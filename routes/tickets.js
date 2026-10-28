const express = require("express");
const mongoose = require("mongoose");
const Ticket = require("../models/Ticket");
const Customer = require("../models/Customer");
const {
  badRequest,
  cents,
  validDate,
  legacyAmount,
  paidCents,
  ticketInput,
} = require("../lib/tickets");
const router = express.Router();
async function loadTicket(req, includeDeleted = false) {
  if (!mongoose.isValidObjectId(req.params.id))
    throw badRequest("Geçersiz bilet numarası.");
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) throw badRequest("Bilet bulunamadı.", 404);
  if (ticket.deletedAt && !includeDeleted) throw badRequest("Bilet silinmiş. Silinen eski biletler bölümünden geri alabilirsiniz.", 409);
  const owner = ticket.staffId
    ? String(ticket.staffId) === String(req.user._id)
    : ticket.staffName === req.user.name;
  if (req.user.role !== "admin" && !owner)
    throw badRequest(
      "Bu bileti yalnızca ekleyen çalışan veya yönetici değiştirebilir.",
      403,
    );
  if (
    !Number.isInteger(req.body.version) ||
    req.body.version !== (ticket.version || 0)
  )
    throw badRequest(
      "Bilet başka bir işlemde değişti. Listeyi yenileyip tekrar deneyin.",
      409,
    );
  return ticket;
}
async function saveChange(ticket, req, changes, action, unset = {}) {
  const version = ticket.version || 0;
  const query = {
    _id: ticket._id,
    $or: [
      { version },
      ...(version === 0 ? [{ version: { $exists: false } }] : []),
    ],
  };
  const result = await Ticket.findOneAndUpdate(
    query,
    {
      $set: changes,
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
      $inc: { version: 1 },
      $push: {
        history: { action, staffName: req.user.name, date: new Date() },
      },
    },
    { returnDocument: "after", runValidators: true },
  );
  if (!result)
    throw badRequest(
      "Bilet başka bir işlemde değişti. Listeyi yenileyip tekrar deneyin.",
      409,
    );
  return result;
}
router.get("/", async (req, res, next) => {
  try {
    res.json(await Ticket.find({ deletedAt: { $exists: false } }).sort({ createdAt: -1 }).lean());
  } catch (e) {
    next(e);
  }
});
router.get("/archived-legacy", async (req, res, next) => {
  try {
    if (req.user.role !== "admin") throw badRequest("Silinen kayıtlar yönetici yetkisi gerektirir.", 403);
    res.json(await Ticket.find({ customerId: null, deletedAt: { $exists: true } }).sort({ deletedAt: -1 }).lean());
  } catch (e) { next(e); }
});
router.post("/:id/archive", async (req, res, next) => {
  try {
    if (req.user.role !== "admin") throw badRequest("Eski bilet silme yönetici yetkisi gerektirir.", 403);
    const ticket = await loadTicket(req);
    if (ticket.customerId) throw badRequest("Müşteri kartına bağlı bilet silinemez. Bilet iptalini kullanın.", 409);
    res.json(await saveChange(ticket, req, { deletedAt: new Date(), deletedBy: req.user.name }, "Eski deneme bileti silindi (geri alınabilir)"));
  } catch (e) { next(e); }
});
router.post("/:id/restore", async (req, res, next) => {
  try {
    if (req.user.role !== "admin") throw badRequest("Geri alma yönetici yetkisi gerektirir.", 403);
    const ticket = await loadTicket(req, true);
    if (ticket.customerId || !ticket.deletedAt) throw badRequest("Geri alınabilecek eski bilet bulunamadı.", 409);
    res.json(await saveChange(ticket, req, {}, "Silinen eski bilet geri alındı", { deletedAt: 1, deletedBy: 1 }));
  } catch (e) { next(e); }
});
router.post("/", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.body.customerId))
      throw badRequest("Önce müşteri kartını seçin.");
    const customer = await Customer.findById(req.body.customerId);
    if (!customer) throw badRequest("Müşteri kartı bulunamadı.", 404);
    const data = ticketInput({
      ...req.body,
      customerName: customer.name,
      phone: customer.phone,
    });
    res.status(201).json(
      await Ticket.create({
        ...data,
        customerId: customer._id,
        staffId: req.user._id,
        staffName: req.user.name,
        history: [
          {
            action: "Bilet oluşturuldu",
            staffName: req.user.name,
            date: new Date(),
          },
        ],
      }),
    );
  } catch (e) {
    next(e);
  }
});
router.put("/:id/customer", async (req, res, next) => {
  try {
    if (req.user.role !== "admin")
      throw badRequest(
        "Eski biletleri yalnızca yönetici müşteri kartına bağlayabilir.",
        403,
      );
    const ticket = await loadTicket(req);
    if (ticket.customerId)
      throw badRequest("Bilet zaten bir müşteri kartına bağlı.", 409);
    if (!mongoose.isValidObjectId(req.body.customerId))
      throw badRequest("Müşteri kartını seçin.");
    const customer = await Customer.findById(req.body.customerId);
    if (!customer) throw badRequest("Müşteri kartı bulunamadı.", 404);
    res.json(
      await saveChange(
        ticket,
        req,
        { customerId: customer._id, legacyPaidAmount: legacyAmount(ticket) },
        `Bilet ${customer.code} müşteri kartına bağlandı`,
      ),
    );
  } catch (e) {
    next(e);
  }
});
router.put("/:id", async (req, res, next) => {
  try {
    const ticket = await loadTicket(req);
    if (ticket.status === "cancelled")
      throw badRequest("İptal edilmiş bilet düzenlenemez.");
    const customer = ticket.customerId
      ? await Customer.findById(ticket.customerId)
      : null;
    const data = ticketInput(
      customer
        ? { ...req.body, customerName: customer.name, phone: customer.phone }
        : req.body,
    );
    if (!ticket.customerId && Math.round(data.price * 100) < paidCents(ticket))
      throw badRequest("Bilet tutarı tahsil edilen tutardan az olamaz.");
    res.json(
      await saveChange(
        ticket,
        req,
        {
          ...data,
          legacyPaidAmount: legacyAmount(ticket),
          isPaid: paidCents(ticket) >= Math.round(data.price * 100),
        },
        "Bilet bilgileri düzenlendi",
      ),
    );
  } catch (e) {
    next(e);
  }
});
router.post("/:id/payments", async (req, res, next) => {
  try {
    const ticket = await loadTicket(req);
    if (ticket.status === "cancelled")
      throw badRequest("İptal edilmiş bilete tahsilat eklenemez.");
    if (ticket.customerId)
      throw badRequest(
        "Tahsilatı müşteri kartından ekleyin. Bilete bağlı ödeme kullanılmıyor.",
        409,
      );
    const price = cents(ticket.price);
    const amount = cents(req.body.amount);
    const remaining = price - paidCents(ticket);
    if (amount > remaining) throw badRequest("Tahsilat kalan borcu aşamaz.");
    if (
      !validDate(req.body.date) ||
      !["Nakit", "Havale", "Kart"].includes(req.body.method)
    )
      throw badRequest("Geçerli tahsilat tarihi ve yöntemi seçin.");
    if (
      req.body.note != null &&
      (typeof req.body.note !== "string" || req.body.note.length > 500)
    )
      throw badRequest("Tahsilat notu en fazla 500 karakter olabilir.");
    const payments = [
      ...ticket.payments.map((p) => p.toObject()),
      {
        amount: amount / 100,
        date: req.body.date,
        method: req.body.method,
        staffId: req.user._id,
        staffName: req.user.name,
        note: req.body.note || "",
      },
    ];
    res.json(
      await saveChange(
        ticket,
        req,
        {
          payments,
          legacyPaidAmount: legacyAmount(ticket),
          isPaid: amount === remaining,
        },
        `${(amount / 100).toFixed(2)} TL tahsilat eklendi (${req.body.method})`,
      ),
    );
  } catch (e) {
    next(e);
  }
});
router.post("/:id/payments/:paymentId/void", async (req, res, next) => {
  try {
    if (req.user.role !== "admin")
      throw badRequest(
        "Tahsilat düzeltmesi yalnızca yönetici tarafından yapılabilir.",
        403,
      );
    const ticket = await loadTicket(req);
    if (
      typeof req.body.reason !== "string" ||
      !req.body.reason.trim() ||
      req.body.reason.trim().length > 500
    )
      throw badRequest("Düzeltme gerekçesini girin (en fazla 500 karakter).");
    const payment = ticket.payments.id(req.params.paymentId);
    if (!payment || payment.voidedAt)
      throw badRequest("Tahsilat bulunamadı veya zaten geçersiz kılındı.", 404);
    const payments = ticket.payments.map((p) => p.toObject());
    const target = payments.find((p) => String(p._id) === req.params.paymentId);
    Object.assign(target, {
      voidedAt: new Date(),
      voidedBy: req.user.name,
      voidReason: req.body.reason.trim(),
    });
    const total = paidCents({ ...ticket.toObject(), payments });
    res.json(
      await saveChange(
        ticket,
        req,
        { payments, isPaid: total >= Math.round(ticket.price * 100) },
        `Tahsilat geçersiz kılındı: ${req.body.reason.trim()}`,
      ),
    );
  } catch (e) {
    next(e);
  }
});
router.post("/:id/cancel", async (req, res, next) => {
  try {
    const ticket = await loadTicket(req);
    if (ticket.status === "cancelled")
      throw badRequest("Bilet zaten iptal edilmiş.");
    if (!ticket.customerId && paidCents(ticket) > 0)
      throw badRequest(
        "Tahsilatlı bilet iptal edilemez. Önce iade / düzeltme durumunu muhasebeyle kontrol edin.",
      );
    res.json(
      await saveChange(
        ticket,
        req,
        { status: "cancelled" },
        "Bilet iptal edildi",
      ),
    );
  } catch (e) {
    next(e);
  }
});
// Eski sürümün ödeme kutusu, ayrıntılı tahsilat geçmişini değiştiremez.
router.patch("/:id", (req, res) =>
  res.status(409).json({
    message:
      "Yeni paneli açıp tahsilat ekleyin. Ödeme kutusu artık kullanılmıyor.",
  }),
);
module.exports = router;
