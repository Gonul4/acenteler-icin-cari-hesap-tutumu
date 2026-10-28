const { test } = require("node:test");
const assert = require("node:assert/strict");
process.env.JWT_SECRET = "test-secret-used-only-for-tests-1234567890";
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.NODE_ENV = "test";
const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const Ticket = require("../models/Ticket");
const User = require("../models/User");
const Customer = require("../models/Customer");
const app = require("../server");
const ADMIN_ID = "507f1f77bcf86cd799439001";
const STAFF_ID = "507f1f77bcf86cd799439002";
test("real cookie authentication protects ticket, payment and staff-account operations", async () => {
  const originalCustomer = Customer.findById;
  Customer.findById = async (id) => ({ _id: id, name: "Ayşe", phone: "" });
  const hash = await argon2.hash("test-only-password");
  const admin = {
    _id: ADMIN_ID,
    name: "Test Muhasebe",
    username: "admin",
    role: "admin",
    active: true,
    passwordHash: hash,
  };
  const worker = {
    _id: STAFF_ID,
    name: "Test Çalışanı",
    username: "worker",
    role: "staff",
    active: true,
    passwordHash: hash,
  };
  const originals = {
    tf: Ticket.find,
    tc: Ticket.create,
    tb: Ticket.findById,
    tu: Ticket.findOneAndUpdate,
    uf: User.findOne,
    ub: User.findById,
    uc: User.create,
  };
  const docs = new Map();
  let lastUserInput;
  User.findOne = ({ username }) => ({
    select: async () =>
      username === "admin" ? admin : username === "worker" ? worker : null,
  });
  User.findById = (id) => ({
    select: async () =>
      id === ADMIN_ID ? admin : id === STAFF_ID ? worker : null,
  });
  User.create = async (data) => {
    lastUserInput = data;
    return { ...data, _id: "507f1f77bcf86cd799439003", active: true };
  };
  Ticket.create = async (data) => {
    const doc = new Ticket(data);
    docs.set(String(doc._id), doc);
    return doc;
  };
  Ticket.findById = async (id) => docs.get(String(id)) || null;
  Ticket.find = () => ({
    sort: () => ({
      lean: async () => [...docs.values()].map((d) => d.toObject()),
    }),
  });
  Ticket.findOneAndUpdate = async (query, update) => {
    const current = docs.get(String(query._id));
    if (!current || current.version !== query.$or[0].version) return null;
    const data = {
      ...current.toObject(),
      ...update.$set,
      version: current.version + 1,
      history: [...current.history, update.$push.history],
    };
    const doc = new Ticket(data);
    docs.set(String(doc._id), doc);
    return doc;
  };
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const root = `http://127.0.0.1:${server.address().port}/api`;
  let cookie = "";
  const call = async (path, body, method = "POST", custom = true) => {
    const r = await fetch(root + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(custom ? { "X-Requested-With": "XMLHttpRequest" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: r.status,
      data: r.status === 204 ? null : await r.json(),
      cookie: r.headers.get("set-cookie"),
    };
  };
  const login = async (username) => {
    const result = await call("/auth/login", {
      username,
      password: "test-only-password",
    });
    assert.equal(result.status, 200);
    assert.match(result.cookie, /HttpOnly/i);
    assert.match(result.cookie, /Max-Age=86400(?:;|$)/);
    cookie = result.cookie.split(";")[0];
    const token = cookie.slice("access_token=".length);
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    assert.equal(payload.exp - payload.iat, 24 * 60 * 60);
    const verifyOptions = {
      algorithms: ["HS256"], issuer: "turizm-takip-api", audience: "turizm-takip-web",
    };
    assert.doesNotThrow(() => jwt.verify(token, process.env.JWT_SECRET, {
      ...verifyOptions, clockTimestamp: payload.iat + 23 * 60 * 60,
    }));
    assert.throws(() => jwt.verify(token, process.env.JWT_SECRET, {
      ...verifyOptions, clockTimestamp: payload.exp,
    }), { name: "TokenExpiredError" });
  };
  const input = {
    customerId: "507f1f77bcf86cd799439020",
    customerName: "Ayşe",
    route: "IST-AYT",
    price: 5000,
    saleDate: "2026-10-06",
    travelDate: "",
    pnr: "TEST01",
    ticketNumber: "",
    notes: "",
    phone: "",
  };
  try {
    assert.equal((await call("/tickets", null, "GET")).status, 401);
    assert.equal(
      (
        await call(
          "/auth/login",
          { username: "admin", password: "test-only-password" },
          "POST",
          false,
        )
      ).status,
      403,
    );
    assert.equal(
      (await call("/auth/login", { username: "admin", password: "wrong" }))
        .status,
      401,
    );
    await login("worker");
    const created = await call("/tickets", {
      ...input,
      staffName: "spoof",
      isPaid: true,
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.staffName, worker.name);
    assert.equal(created.data.staffId, STAFF_ID);
    assert.equal(created.data.isPaid, false);
    const path = "/tickets/" + created.data._id;
    assert.equal(
      (
        await call(path + "/payments", {
          amount: 100,
          date: "2026-10-06",
          method: "Nakit",
          version: 0,
        })
      ).status,
      409,
    );
    docs.get(created.data._id).customerId = undefined;
    assert.equal((await call("/tickets", null, "GET")).data.length, 1);
    assert.equal(
      (
        await call(path + "/payments", {
          amount: 5001,
          date: "2026-10-06",
          method: "Nakit",
          version: 0,
        })
      ).status,
      400,
    );
    const payment = await call(path + "/payments", {
      amount: 2000,
      date: "2026-10-06",
      method: "Havale",
      version: 0,
    });
    assert.equal(payment.status, 200);
    assert.equal(payment.data.version, 1);
    assert.equal(payment.data.isPaid, false);
    assert.equal(
      (
        await call(path + "/payments", {
          amount: 100,
          date: "2026-10-06",
          method: "Nakit",
          version: 0,
        })
      ).status,
      409,
    );
    assert.equal(
      (await call(path, { ...input, price: 1000, version: 1 }, "PUT")).status,
      400,
    );
    assert.equal((await call(path + "/cancel", { version: 1 })).status, 400);
    const voidPath =
      path + "/payments/" + payment.data.payments[0]._id + "/void";
    assert.equal(
      (await call(voidPath, { reason: "Yanlış tutar", version: 1 })).status,
      403,
    );
    assert.equal(
      (
        await call("/users", {
          name: "Yeni",
          username: "yeni",
          password: "test-only-password",
          role: "staff",
        })
      ).status,
      403,
    );
    await login("admin");
    const voided = await call(voidPath, {
      reason: "Yanlış girilmiş tahsilat",
      version: 1,
    });
    assert.equal(voided.status, 200);
    assert.ok(voided.data.payments[0].voidedAt);
    assert.equal(voided.data.payments.length, 1);
    const cancelled = await call(path + "/cancel", { version: 2 });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.data.status, "cancelled");
    assert.equal(
      (
        await call(path + "/payments", {
          amount: 100,
          date: "2026-10-06",
          method: "Nakit",
          version: 3,
        })
      ).status,
      400,
    );
    const account = await call("/users", {
      name: "Yeni Çalışan",
      username: "newstaff",
      password: "new-staff-password",
      role: "staff",
    });
    assert.equal(account.status, 201);
    assert.equal(account.data.passwordHash, undefined);
    assert.notEqual(lastUserInput.passwordHash, "new-staff-password");
    assert.ok(
      await argon2.verify(lastUserInput.passwordHash, "new-staff-password"),
    );
    const adminTicket = await call("/tickets", input);
    await login("worker");
    assert.equal(
      (
        await call(
          "/tickets/" + adminTicket.data._id,
          { ...input, version: 0 },
          "PUT",
        )
      ).status,
      403,
    );
    const legacy = new Ticket({
      ...input,
      isPaid: true,
      staffName: worker.name,
    });
    docs.set(String(legacy._id), legacy);
    const changed = await call(
      "/tickets/" + legacy._id,
      { ...input, price: 6000, version: 0 },
      "PUT",
    );
    assert.equal(changed.status, 200);
    assert.equal(changed.data.legacyPaidAmount, 5000);
    assert.equal(changed.data.isPaid, false);
    const logout = await call("/auth/logout");
    assert.equal(logout.status, 204);
    assert.match(logout.cookie, /Expires=Thu, 01 Jan 1970/);
    cookie = "";
    assert.equal((await call("/tickets", null, "GET")).status, 401);
  } finally {
    Customer.findById = originalCustomer;
    Ticket.find = originals.tf;
    Ticket.create = originals.tc;
    Ticket.findById = originals.tb;
    Ticket.findOneAndUpdate = originals.tu;
    User.findOne = originals.uf;
    User.findById = originals.ub;
    User.create = originals.uc;
    await new Promise((resolve) => server.close(resolve));
  }
});
