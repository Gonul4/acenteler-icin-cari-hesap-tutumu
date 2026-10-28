const express = require("express");
const mongoose = require("mongoose");
const Customer = require("../models/Customer");
const Counter = require("../models/Counter");
const Ticket = require("../models/Ticket");
const Entry = require("../models/AccountEntry");
const { badRequest } = require("../lib/tickets");
const {
  customerInput,
  entryInput,
  hashEntry,
  ledgerRows,
  summarize,
  paymentSchedule,
  statement,
  text,
} = require("../lib/accounts");
const router = express.Router();
async function load(id) {
  if (!mongoose.isValidObjectId(id))
    throw badRequest("Geçersiz müşteri kartı.");
  const customer = await Customer.findById(id);
  if (!customer) throw badRequest("Müşteri kartı bulunamadı.", 404);
  return customer;
}
router.get("/", async (req, res, next) => {
  try {
    const [customers, tickets, entries] = await Promise.all([
      Customer.find().sort({ code: 1 }).lean(),
      Ticket.find({ customerId: { $ne: null } }).lean(),
      Entry.find().lean(),
    ]);
    const groupedTickets = new Map(),
      groupedEntries = new Map();
    for (const t of tickets) {
      const key = String(t.customerId);
      if (!groupedTickets.has(key)) groupedTickets.set(key, []);
      groupedTickets.get(key).push(t);
    }
    for (const e of entries) {
      const key = String(e.customerId);
      if (!groupedEntries.has(key)) groupedEntries.set(key, []);
      groupedEntries.get(key).push(e);
    }
    res.json(
      customers.map((c) => ({
        ...c,
        paymentSchedule: paymentSchedule(
          groupedTickets.get(String(c._id)) || [],
          groupedEntries.get(String(c._id)) || [],
        ),
        summary: summarize(
          ledgerRows(
            groupedTickets.get(String(c._id)) || [],
            groupedEntries.get(String(c._id)) || [],
          ),
        ),
      })),
    );
  } catch (e) {
    next(e);
  }
});
router.post("/", async (req, res, next) => {
  try {
    const data = customerInput(req.body);
    const counter = await Counter.findOneAndUpdate(
      { _id: "customer" },
      { $inc: { value: 1 } },
      { upsert: true, returnDocument: "after" },
    );
    const customer = await Customer.create({
      ...data,
      code: `C${String(counter.value).padStart(6, "0")}`,
      createdBy: req.user._id,
      staffName: req.user.name,
      history: [
        {
          action: "Müşteri kartı açıldı",
          staffName: req.user.name,
          date: new Date(),
        },
      ],
    });
    res.status(201).json({ ...customer.toObject(), summary: summarize([]) });
  } catch (e) {
    next(e);
  }
});
router.put("/:id", async (req, res, next) => {
  try {
    if (req.user.role !== "admin")
      throw badRequest(
        "Müşteri kartını yalnızca yönetici düzenleyebilir.",
        403,
      );
    const customer = await load(req.params.id);
    if (req.body.version !== (customer.version || 0))
      throw badRequest("Müşteri kartı değişti. Listeyi yenileyin.", 409);
    const result = await Customer.findOneAndUpdate(
      { _id: customer._id, version: customer.version || 0 },
      {
        $set: customerInput(req.body),
        $inc: { version: 1 },
        $push: {
          history: {
            action: "Müşteri kartı düzenlendi",
            staffName: req.user.name,
            date: new Date(),
          },
        },
      },
      { returnDocument: "after", runValidators: true },
    );
    if (!result)
      throw badRequest("Müşteri kartı değişti. Listeyi yenileyin.", 409);
    res.json(result);
  } catch (e) {
    next(e);
  }
});
router.get("/:id/statement", async (req, res, next) => {
  try {
    const customer = await load(req.params.id);
    const [tickets, entries] = await Promise.all([
      Ticket.find({ customerId: customer._id }).lean(),
      Entry.find({ customerId: customer._id }).lean(),
    ]);
    res.json({
      customer,
      tickets,
      ...statement(
        ledgerRows(tickets, entries),
        req.query.from || "",
        req.query.to || "",
      ),
    });
  } catch (e) {
    next(e);
  }
});
router.post("/:id/entries", async (req, res, next) => {
  try {
    const customer = await load(req.params.id);
    const data = entryInput(req.body, customer);
    if (req.user.role !== "admin" && data.type !== "payment")
      throw badRequest(
        "Borç, alacak düzeltmesi ve iade kaydı yönetici yetkisi gerektirir.",
        403,
      );
    const trusted = {
      ...data,
      customerId: customer._id,
      staffId: req.user._id,
      staffName: req.user.name,
    };
    const requestHash = hashEntry({
      ...data,
      customerId: String(customer._id),
      staffId: String(req.user._id),
    });
    const existing = await Entry.findOne({ requestId: data.requestId }).select(
      "+requestHash",
    );
    if (existing) {
      if (existing.requestHash !== requestHash)
        throw badRequest(
          "Bu işlem anahtarı farklı bir kayıtta kullanılmış.",
          409,
        );
      const out = existing.toObject();
      delete out.requestHash;
      return res.json(out);
    }
    let entry;
    try {
      entry = await Entry.create({ ...trusted, requestHash });
    } catch (e) {
      if (e.code !== 11000) throw e;
      entry = await Entry.findOne({ requestId: data.requestId }).select(
        "+requestHash",
      );
      if (!entry || entry.requestHash !== requestHash)
        throw badRequest("İşlem anahtarı çakıştı. Listeyi yenileyin.", 409);
    }
    const out = entry.toObject();
    delete out.requestHash;
    res.status(201).json(out);
  } catch (e) {
    next(e);
  }
});
// Corrections retain the original entry and use optimistic concurrency.
router.put("/:id/entries/:entryId", async (req, res, next) => {
  try {
    if (req.user.role !== "admin") throw badRequest("Hareket düzenleme yönetici yetkisi gerektirir.", 403);
    const customer = await load(req.params.id);
    if (!mongoose.isValidObjectId(req.params.entryId)) throw badRequest("Geçersiz hareket.");
    const entry = await Entry.findOne({ _id: req.params.entryId, customerId: customer._id });
    if (!entry) throw badRequest("Hareket bulunamadı.", 404);
    if (entry.voidedAt) throw badRequest("Geçersiz hareket düzenlenemez.", 409);
    const version = entry.version || 0;
    if (!Number.isInteger(req.body.version) || req.body.version !== version) throw badRequest("Hareket değişti. Ekstreyi yenileyin.", 409);
    const reason = text(req.body.reason, "Düzeltme gerekçesi", 500, true);
    const data = entryInput({ ...req.body, type: entry.type, requestId: entry.requestId }, customer);
    delete data.requestId;
    const fields = Object.keys(data);
    const before = Object.fromEntries(fields.map(k => [k, entry[k]]));
    const result = await Entry.findOneAndUpdate({
      _id: entry._id, customerId: customer._id, voidedAt: { $exists: false },
      $or: [{ version }, ...(version === 0 ? [{ version: { $exists: false } }] : [])],
    }, {
      $set: data, $inc: { version: 1 },
      $push: { history: { date: new Date(), staffId: req.user._id, staffName: req.user.name, reason, before, after: data } },
    }, { returnDocument: "after", runValidators: true });
    if (!result) throw badRequest("Hareket değişti. Ekstreyi yenileyin.", 409);
    res.json(result);
  } catch (e) { next(e); }
});
router.post("/:id/entries/:entryId/void", async (req, res, next) => {
  try {
    if (req.user.role !== "admin")
      throw badRequest(
        "Hareket düzeltmesi yalnızca yönetici tarafından yapılabilir.",
        403,
      );
    await load(req.params.id);
    if (!mongoose.isValidObjectId(req.params.entryId))
      throw badRequest("Geçersiz hareket.");
    const reason = text(req.body.reason, "Düzeltme gerekçesi", 500, true);
    const result = await Entry.findOneAndUpdate(
      {
        _id: req.params.entryId,
        customerId: req.params.id,
        voidedAt: { $exists: false },
      },
      {
        $set: {
          voidedAt: new Date(),
          voidedBy: req.user.name,
          voidReason: reason,
        },
      },
      { returnDocument: "after", runValidators: true },
    );
    if (!result)
      throw badRequest("Hareket bulunamadı veya zaten geçersiz kılındı.", 409);
    res.json(result);
  } catch (e) {
    next(e);
  }
});
module.exports = router;
