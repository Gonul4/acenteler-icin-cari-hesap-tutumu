const crypto = require("crypto");
const { badRequest, cents, validDate, legacyAmount } = require("./tickets");
const text = (value, label, max, required = false) => {
  const input = value ?? "";
  if (
    typeof input !== "string" ||
    input.trim().length > max ||
    (required && !input.trim())
  )
    throw badRequest(
      `${label} alanını kontrol edin (en fazla ${max} karakter).`,
    );
  return input.trim();
};
function rate(value) {
  if (value != null && typeof value !== "number" && typeof value !== "string")
    throw badRequest("Geçerli bir POS oranı girin.");
  const number = value === "" || value == null ? 0 : Number(value);
  if (
    !Number.isFinite(number) ||
    number < 0 ||
    number > 99.99 ||
    Math.abs(number * 100 - Math.round(number * 100)) > 0.000001
  )
    throw badRequest(
      "POS oranı 0–99,99 arasında, en fazla iki ondalık basamaklı olmalıdır.",
    );
  return number;
}
function customerInput(body) {
  return {
    name: text(body.name, "Müşteri adı", 150, true),
    phone: text(body.phone, "Telefon", 40),
    email: text(body.email, "E-posta", 150),
    address: text(body.address, "Adres", 500),
    notes: text(body.notes, "Not", 2000),
    defaultPosRate: rate(body.defaultPosRate),
  };
}
function entryInput(body, customer) {
  if (!["payment", "debit", "credit", "refund"].includes(body.type))
    throw badRequest("Geçerli bir hareket türü seçin.");
  if (!validDate(body.date))
    throw badRequest("Geçerli bir işlem tarihi girin.");
  if (
    typeof body.requestId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      body.requestId,
    )
  )
    throw badRequest("İşlem anahtarı eksik. Formu kapatıp yeniden açın.");
  const amountCents = cents(body.amount);
  const isPayment = body.type === "payment";
  const hasMethod = isPayment || body.type === "refund";
  const method = hasMethod ? body.method : "";
  if (hasMethod && !["Nakit", "Havale", "Kart"].includes(method))
    throw badRequest("Ödeme yöntemini seçin.");
  const commissionMode = body.commissionMode || "percent";
  if (!["percent", "fixed"].includes(commissionMode))
    throw badRequest("Komisyon türünü seçin.");
  let commissionCents = 0,
    commissionValue = 0;
  if (isPayment && method === "Kart") {
    if (commissionMode === "percent") {
      commissionValue = rate(body.commissionValue ?? customer.defaultPosRate);
      commissionCents = Math.round((amountCents * commissionValue) / 100);
    } else {
      commissionValue = Number(body.commissionValue || 0);
      commissionCents = commissionValue === 0 ? 0 : cents(body.commissionValue);
    }
    if (commissionCents >= amountCents)
      throw badRequest("Komisyon, çekilen kart tutarından küçük olmalıdır.");
  } else if (body.commissionValue && Number(body.commissionValue) !== 0)
    throw badRequest("Komisyon yalnızca kart tahsilatında uygulanabilir.");
  return {
    type: body.type,
    amountCents,
    commissionCents,
    netCents: amountCents - commissionCents,
    commissionMode,
    commissionValue,
    method,
    date: body.date,
    description: text(body.description, "Açıklama", 500, true),
    reference: text(body.reference, "Referans", 100),
    account: text(body.account, "Banka / POS", 100),
    requestId: body.requestId,
  };
}
const hashEntry = (data) =>
  crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
function ledgerRows(tickets, entries) {
  const rows = [];
  for (const t of tickets) {
    const date =
      t.saleDate ||
      t.createdAt?.toISOString?.().slice(0, 10) ||
      (typeof t.createdAt === "string" ? t.createdAt.slice(0, 10) : "");
    const price = Math.round((Number(t.price) || 0) * 100);
    rows.push({
      id: `ticket:${t._id}`,
      source: "ticket",
      sourceId: String(t._id),
      type: "ticket",
      date,
      createdAt: t.createdAt,
      debitCents: price,
      creditCents: 0,
      description: `Bilet · ${t.route || "Rota girilmemiş"}`,
      reference: t.pnr || t.ticketNumber || "",
      staffName: t.staffName,
      voided: t.status === "cancelled",
      voidReason: t.status === "cancelled" ? "Bilet iptal edilmiş" : "",
    });
    const legacy = Math.round(legacyAmount(t) * 100);
    if (legacy > 0)
      rows.push({
        id: `legacy:${t._id}`,
        source: "legacy",
        sourceId: String(t._id),
        type: "legacy_payment",
        date: "",
        debitCents: 0,
        creditCents: legacy,
        description:
          "Önceki kayıttan taşınan ödeme (tarih / yöntem bilinmiyor)",
        reference: t.pnr || t.ticketNumber || "",
        staffName: t.staffName,
        voided: false,
      });
    for (const p of t.payments || [])
      rows.push({
        id: `payment:${t._id}:${p._id}`,
        source: "ticket-payment",
        sourceId: String(t._id),
        paymentId: String(p._id),
        type: "legacy_payment",
        date: p.date || "",
        createdAt: p.createdAt,
        debitCents: 0,
        creditCents: Math.round(Number(p.amount) * 100),
        description: p.note || "Önceki bilet tahsilatı",
        reference: t.pnr || t.ticketNumber || "",
        method: p.method,
        staffName: p.staffName,
        voided: Boolean(p.voidedAt),
        voidReason: p.voidReason,
      });
  }
  for (const e of entries) {
    const credit = ["payment", "credit"].includes(e.type);
    rows.push({
      id: `entry:${e._id}`,
      source: "entry",
      sourceId: String(e._id),
      type: e.type,
      version: e.version || 0,
      history: e.history || [],
      edit: { amount: e.amountCents / 100, date: e.date, method: e.method, commissionMode: e.commissionMode, commissionValue: e.commissionValue, description: e.description, reference: e.reference, account: e.account },
      date: e.date,
      createdAt: e.createdAt,
      debitCents: credit ? 0 : e.netCents,
      creditCents: credit ? e.netCents : 0,
      grossCents: e.amountCents,
      commissionCents: e.commissionCents,
      description: e.description,
      reference: e.reference,
      account: e.account,
      method: e.method,
      staffName: e.staffName,
      voided: Boolean(e.voidedAt),
      voidReason: e.voidReason,
    });
  }
  return rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      new Date(a.createdAt || 0).getTime() -
        new Date(b.createdAt || 0).getTime() ||
      a.id.localeCompare(b.id),
  );
}
function summarize(rows) {
  const summary = {
    debitCents: 0,
    creditCents: 0,
    balanceCents: 0,
    grossPaymentsCents: 0,
    netPaymentsCents: 0,
    commissionCents: 0,
  };
  for (const row of rows) {
    if (row.voided) continue;
    summary.debitCents += row.debitCents;
    summary.creditCents += row.creditCents;
    if (["payment", "legacy_payment"].includes(row.type)) {
      summary.netPaymentsCents += row.creditCents;
      summary.grossPaymentsCents += row.grossCents || row.creditCents;
      summary.commissionCents += row.commissionCents || 0;
    }
  }
  summary.balanceCents = summary.creditCents - summary.debitCents;
  return summary;
}
// Independent credits settle the oldest ledger debits first, including undated
// tickets and manual debts. This allocation is only for payment reminders.
function paymentSchedule(tickets, entries) {
  const rows = ledgerRows(tickets.filter((t) => !t.deletedAt), entries).filter((r) => !r.voided);
  let credit = rows.reduce((sum, r) => sum + r.creditCents, 0);
  const byId = new Map(tickets.map((t) => [String(t._id), t]));
  const schedule = [];
  for (const row of rows) {
    if (!row.debitCents) continue;
    const applied = Math.min(credit, row.debitCents);
    credit -= applied;
    const remainingCents = row.debitCents - applied;
    const ticket = row.source === "ticket" ? byId.get(row.sourceId) : null;
    if (remainingCents > 0 && ticket?.dueDate)
      schedule.push({ ticketId: String(ticket._id), dueDate: ticket.dueDate, remainingCents,
        priceCents: row.debitCents, pnr: ticket.pnr || ticket.ticketNumber || "", route: ticket.route || "" });
  }
  return schedule.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.ticketId.localeCompare(b.ticketId));
}
function statement(rows, from = "", to = "") {
  if (
    (from && !validDate(from)) ||
    (to && !validDate(to)) ||
    (from && to && from > to)
  )
    throw badRequest("Geçerli bir tarih aralığı seçin.");
  const filtered = Boolean(from || to);
  const preceding = rows.filter(
    (r) => filtered && (!r.date || (from && r.date < from)),
  );
  const openingBalanceCents = summarize(preceding).balanceCents;
  let current = openingBalanceCents;
  const visible = rows
    .filter(
      (r) =>
        !filtered ||
        (r.date && (!from || r.date >= from) && (!to || r.date <= to)),
    )
    .map((row) => {
      if (!row.voided) current += row.creditCents - row.debitCents;
      return { ...row, balanceCents: current };
    });
  return {
    rows: visible,
    openingBalanceCents,
    endingBalanceCents: current,
    unknownDateCount: rows.filter((r) => !r.date).length,
    summary: summarize(rows),
  };
}
module.exports = {
  text,
  rate,
  customerInput,
  entryInput,
  hashEntry,
  ledgerRows,
  summarize,
  paymentSchedule,
  statement,
};
