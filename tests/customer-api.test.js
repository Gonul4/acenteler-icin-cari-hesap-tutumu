const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
process.env.JWT_SECRET = "test-customer-ledger-secret-1234567890";
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.NODE_ENV = "test";
const Customer = require("../models/Customer"),
  Counter = require("../models/Counter"),
  Entry = require("../models/AccountEntry"),
  Ticket = require("../models/Ticket"),
  User = require("../models/User");
const app = require("../server");
test("customer ledger API isolates cards, handles net POS, advance, retry, void and old-ticket linking", async () => {
  const originals = [];
  const stub = (model, key, value) => {
    originals.push([model, key, model[key]]);
    model[key] = value;
  };
  const customers = new Map(),
    entries = new Map(),
    tickets = new Map();
  let sequence = 0;
  const admin = {
      _id: "507f1f77bcf86cd799439001",
      name: "Muhasebe",
      role: "admin",
      active: true,
    },
    staff = {
      _id: "507f1f77bcf86cd799439002",
      name: "Çalışan",
      role: "staff",
      active: true,
    };
  stub(User, "findById", (id) => ({
    select: async () => (String(id) === admin._id ? admin : staff),
  }));
  stub(Counter, "findOneAndUpdate", async () => ({ value: ++sequence }));
  stub(Customer, "create", async (data) => {
    const doc = new Customer(data);
    customers.set(String(doc._id), doc);
    return doc;
  });
  stub(Customer, "findById", async (id) => customers.get(String(id)) || null);
  stub(Customer, "find", () => ({
    sort: () => ({
      lean: async () => [...customers.values()].map((d) => d.toObject()),
    }),
  }));
  stub(Customer, "findOneAndUpdate", async (q, u) => {
    const d = customers.get(String(q._id));
    if (!d || d.version !== q.version) return null;
    const next = new Customer({
      ...d.toObject(),
      ...u.$set,
      version: d.version + 1,
      history: [...d.history, u.$push.history],
    });
    customers.set(String(next._id), next);
    return next;
  });
  stub(Entry, "create", async (data) => {
    if ([...entries.values()].some((e) => e.requestId === data.requestId))
      throw { code: 11000 };
    const d = new Entry(data);
    entries.set(String(d._id), d);
    return d;
  });
  stub(Entry, "findOne", (q) => {
    const doc = [...entries.values()].find(e => q.requestId ? e.requestId === q.requestId : String(e._id) === String(q._id) && String(e.customerId) === String(q.customerId)) || null;
    const result = Promise.resolve(doc);
    result.select = async () => doc;
    return result;
  });
  stub(Entry, "find", (q) => ({
    lean: async () =>
      [...entries.values()]
        .filter(
          (e) =>
            !q?.customerId || String(e.customerId) === String(q.customerId),
        )
        .map((e) => e.toObject()),
  }));
  stub(Entry, "findOneAndUpdate", async (q, u) => {
    const d = entries.get(String(q._id));
    if (!d || String(d.customerId) !== String(q.customerId) || d.voidedAt)
      return null;
    if (q.$or && (d.version || 0) !== q.$or[0].version) return null;
    Object.assign(d, u.$set);
    if (u.$inc) d.version = (d.version || 0) + u.$inc.version;
    if (u.$push) d.history.push(u.$push.history);
    return d;
  });
  stub(Ticket, "create", async (data) => {
    const d = new Ticket(data);
    tickets.set(String(d._id), d);
    return d;
  });
  stub(Ticket, "findById", async (id) => tickets.get(String(id)) || null);
  stub(Ticket, "find", (q) => {
    const rows = () =>
      [...tickets.values()]
        .filter(t => !q?.deletedAt || Boolean(t.deletedAt) === q.deletedAt.$exists)
        .filter(
          (t) =>
            !q?.customerId ||
            (Object.prototype.hasOwnProperty.call(q.customerId, "$ne")
              ? Boolean(t.customerId)
              : String(t.customerId) === String(q.customerId)),
        )
        .map((t) => t.toObject());
    return {
      lean: async () => rows(),
      sort: () => ({ lean: async () => rows() }),
    };
  });
  stub(Ticket, "findOneAndUpdate", async (q, u) => {
    const d = tickets.get(String(q._id));
    if (!d || d.version !== q.$or[0].version) return null;
    const next = new Ticket({
      ...d.toObject(),
      ...u.$set,
      version: d.version + 1,
      history: [...d.history, u.$push.history],
    });
    for (const key of Object.keys(u.$unset || {})) next.set(key, undefined);
    tickets.set(String(next._id), next);
    return next;
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const root = `http://127.0.0.1:${server.address().port}/api`;
  let actor = admin;
  const call = async (path, data, method = "POST") => {
    const token = jwt.sign({}, process.env.JWT_SECRET, {
      subject: actor._id,
      issuer: "turizm-takip-api",
      audience: "turizm-takip-web",
      expiresIn: "1h",
    });
    const r = await fetch(root + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        Cookie: `access_token=${token}`,
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    return { status: r.status, data: await r.json() };
  };
  const move = {
    type: "payment",
    amount: 10000,
    date: "2026-10-07",
    method: "Kart",
    commissionMode: "percent",
    commissionValue: 2,
    description: "Kart tahsilatı",
    requestId: "00000000-0000-4000-8000-000000000001",
  };
  try {
    const first = await call("/customers", {
      name: "Aynı İsim",
      phone: "111",
      defaultPosRate: 2,
    });
    assert.equal(first.status, 201);
    const a = first.data._id;
    const second = await call("/customers", {
      name: "Aynı İsim",
      phone: "222",
    });
    assert.equal(second.status, 201);
    const b = second.data._id;
    assert.notEqual(first.data.code, second.data.code);
    const ticket = await call("/tickets", {
      customerId: a,
      customerName: "spoof",
      price: 5000,
      route: "IST-AYT",
      saleDate: "2026-10-07",
      dueDate: "2026-11-03",
    });
    assert.equal(ticket.status, 201);
    assert.equal(ticket.data.customerName, "Aynı İsim");
    assert.equal(ticket.data.dueDate, "2026-11-03");
    const reminders = (await call("/customers", null, "GET")).data;
    assert.equal(reminders.find((c) => c._id === a).paymentSchedule[0].remainingCents, 500000);
    assert.deepEqual(reminders.find((c) => c._id === b).paymentSchedule, []);
    assert.equal(
      (
        await call("/tickets", {
          customerId: a,
          price: 3000,
          saleDate: "2026-10-07",
        })
      ).status,
      201,
    );
    const pos = await call(`/customers/${a}/entries`, move);
    assert.equal(pos.status, 201);
    assert.equal(pos.data.netCents, 980000);
    assert.equal(pos.data.requestHash, undefined);
    assert.equal((await call(`/customers/${a}/entries`, move)).status, 200);
    assert.equal(entries.size, 1);
    assert.equal(
      (await call(`/customers/${a}/entries`, { ...move, amount: 9999 })).status,
      409,
    );
    let stmt = await call(`/customers/${a}/statement`, null, "GET");
    assert.equal(stmt.data.summary.balanceCents, 180000);
    assert.deepEqual((await call("/customers", null, "GET")).data.find((c) => c._id === a).paymentSchedule, []);
    const cash = {
      ...move,
      method: "Havale",
      amount: 500,
      commissionValue: 0,
      requestId: "00000000-0000-4000-8000-000000000002",
    };
    assert.equal((await call(`/customers/${a}/entries`, cash)).status, 201);
    assert.equal(
      (
        await call(`/customers/${b}/entries`, {
          ...cash,
          amount: 1000,
          requestId: "00000000-0000-4000-8000-000000000003",
        })
      ).status,
      201,
    );
    const otherStatement = await call(`/customers/${b}/statement`, null, "GET");
    assert.equal(otherStatement.data.summary.balanceCents, 100000);
    assert.equal(otherStatement.data.tickets.length, 0);
    const list = await call("/customers", null, "GET");
    assert.equal(
      list.data.find((c) => c._id === a).summary.balanceCents,
      230000,
    );
    assert.equal(
      list.data.find((c) => c._id === b).summary.balanceCents,
      100000,
    );
    const cashEntry = [...entries.values()].find(e => e.requestId === cash.requestId);
    const editPath = `/customers/${a}/entries/${cashEntry._id}`;
    assert.equal((await call(editPath, { ...cash, amount: 1000, version: 0 }, "PUT")).status, 400);
    assert.equal((await call(`/customers/${b}/entries/${cashEntry._id}`, { ...cash, version: 0, reason: "Yanlış kart" }, "PUT")).status, 404);
    actor = staff;
    assert.equal((await call(editPath, { ...cash, version: 0, reason: "Yetkisiz" }, "PUT")).status, 403);
    actor = admin;
    const corrected = await call(editPath, { ...cash, amount: 1000, version: 0, reason: "Dekont tutarı düzeltildi" }, "PUT");
    assert.equal(corrected.status, 200);
    assert.equal(corrected.data.history[0].before.amountCents, 50000);
    assert.equal(corrected.data.history[0].after.amountCents, 100000);
    assert.equal(corrected.data.history[0].staffName, admin.name);
    assert.equal((await call(editPath, { ...cash, version: 0, reason: "Eski sürüm" }, "PUT")).status, 409);
    const correctedStatement = await call(`/customers/${a}/statement`, null, "GET");
    assert.equal(correctedStatement.data.summary.balanceCents, 280000);
    assert.equal((await call(editPath, { ...cash, version: 1, reason: "Kontrol sonrası eski tutar" }, "PUT")).status, 200);
    actor = staff;
    assert.equal(
      (
        await call(`/customers/${a}/entries`, {
          ...cash,
          type: "debit",
          requestId: "00000000-0000-4000-8000-000000000004",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await call(`/customers/${a}/entries/${pos.data._id}/void`, {
          reason: "Yanlış kayıt",
        })
      ).status,
      403,
    );
    actor = admin;
    assert.equal(
      (
        await call(`/customers/${b}/entries/${pos.data._id}/void`, {
          reason: "Yanlış kart",
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await call(`/customers/${a}/entries/${pos.data._id}/void`, {
          reason: "Yanlış kayıt",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await call(`/customers/${a}/entries/${pos.data._id}/void`, {
          reason: "Tekrar",
        })
      ).status,
      409,
    );
    stmt = await call(`/customers/${a}/statement`, null, "GET");
    assert.equal(stmt.data.summary.balanceCents, -750000);
    assert.ok(stmt.data.rows.find((r) => r.sourceId === pos.data._id).voided);
    const old = new Ticket({
      customerName: "Eski Müşteri",
      price: 2000,
      staffName: "Önceki çalışan",
      isPaid: true,
      saleDate: "2026-10-01",
    });
    tickets.set(String(old._id), old);
    assert.equal(
      (
        await call(
          `/tickets/${old._id}/customer`,
          { customerId: a, version: 0 },
          "PUT",
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await call(
          `/tickets/${old._id}/customer`,
          { customerId: b, version: 1 },
          "PUT",
        )
      ).status,
      409,
    );
    stmt = await call(`/customers/${a}/statement`, null, "GET");
    assert.equal(stmt.data.summary.balanceCents, -750000);
    assert.equal(stmt.data.unknownDateCount, 1);
    assert.equal(
      (await call(`/tickets/${ticket.data._id}/cancel`, { version: 0 })).status,
      200,
    );
    stmt = await call(`/customers/${a}/statement`, null, "GET");
    assert.equal(stmt.data.summary.balanceCents, -250000);
    const disposable = new Ticket({ customerName: "Deneme", price: 100, staffName: "Önceki çalışan", isPaid: true });
    tickets.set(String(disposable._id), disposable);
    actor = staff;
    assert.equal((await call(`/tickets/${disposable._id}/archive`, { version: 0 })).status, 403);
    assert.equal((await call("/tickets/archived-legacy", null, "GET")).status, 403);
    actor = admin;
    assert.equal((await call(`/tickets/${old._id}/archive`, { version: 1 })).status, 409);
    assert.equal((await call(`/tickets/${disposable._id}/archive`, { version: 99 })).status, 409);
    const archived = await call(`/tickets/${disposable._id}/archive`, { version: 0 });
    assert.equal(archived.status, 200);
    assert.equal(archived.data.deletedBy, admin.name);
    assert.equal(archived.data.isPaid, true);
    assert.equal((await call(`/tickets/${disposable._id}/customer`, { customerId: a, version: 1 }, "PUT")).status, 409);
    const activeTickets = await call("/tickets", null, "GET");
    assert.ok(!activeTickets.data.some(t => t._id === String(disposable._id)));
    const trash = await call("/tickets/archived-legacy", null, "GET");
    assert.equal(trash.data.length, 1);
    assert.equal((await call(`/tickets/${disposable._id}/restore`, { version: 0 })).status, 409);
    const restored = await call(`/tickets/${disposable._id}/restore`, { version: 1 });
    assert.equal(restored.status, 200);
    assert.equal(restored.data.deletedAt, undefined);
    assert.equal(restored.data.price, 100);
    assert.equal(restored.data.isPaid, true);
    assert.equal(restored.data.history.length, 2);
    assert.equal((await call("/tickets/archived-legacy", null, "GET")).data.length, 0);
    assert.equal((await call(`/customers/${a}/statement`, null, "GET")).data.summary.balanceCents, -250000);
    const changed = await call(
      `/customers/${a}`,
      { name: "Yeni isim", code: "HACK", defaultPosRate: 3, version: 0 },
      "PUT",
    );
    assert.equal(changed.status, 200);
    assert.equal(changed.data.code, first.data.code);
    assert.equal(
      (await call(`/customers/${a}`, { name: "Stale", version: 0 }, "PUT"))
        .status,
      409,
    );
  } finally {
    for (const [m, k, v] of originals) m[k] = v;
    await new Promise((r) => server.close(r));
  }
});
