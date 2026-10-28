function badRequest(message, status = 400) {
  return Object.assign(new Error(message), { status });
}
function cents(value) {
  const number =
    typeof value === "number" || typeof value === "string"
      ? Number(value)
      : NaN;
  const result = Math.round(number * 100);
  if (
    !Number.isFinite(number) ||
    number <= 0 ||
    number > 1000000000 ||
    Math.abs(number * 100 - result) > 0.000001
  ) {
    throw badRequest(
      "Tutar pozitif, en fazla iki ondalık basamaklı ve en fazla 1 milyar TL olmalıdır.",
    );
  }
  return result;
}
function validDate(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
function legacyAmount(ticket) {
  return (
    Number(ticket.legacyPaidAmount) ||
    (ticket.isPaid && !(ticket.payments || []).length
      ? Number(ticket.price) || 0
      : 0)
  );
}
function paidCents(ticket) {
  return (
    Math.round(legacyAmount(ticket) * 100) +
    (ticket.payments || [])
      .filter((p) => !p.voidedAt)
      .reduce((sum, p) => sum + Math.round(Number(p.amount) * 100), 0)
  );
}
function ticketInput(body) {
  const data = {};
  for (const [key, max] of Object.entries({
    customerName: 150,
    route: 200,
    phone: 40,
    pnr: 50,
    ticketNumber: 80,
    notes: 2000,
  })) {
    const value = body[key] ?? "";
    if (typeof value !== "string" || value.trim().length > max)
      throw badRequest(`Geçersiz alan: ${key}`);
    data[key] = value.trim();
  }
  if (!data.customerName) throw badRequest("Müşteri adı zorunludur.");
  data.price = cents(body.price) / 100;
  if (
    !validDate(body.saleDate) ||
    (body.travelDate && !validDate(body.travelDate))
  )
    throw badRequest("Geçerli bir satış / seyahat tarihi girin.");
  data.saleDate = body.saleDate;
  data.travelDate = body.travelDate || "";
  if (body.dueDate != null && body.dueDate !== "" && !validDate(body.dueDate))
    throw badRequest("Geçerli bir ödeme tarihi girin.");
  data.dueDate = body.dueDate || "";
  return data;
}
module.exports = {
  badRequest,
  cents,
  validDate,
  legacyAmount,
  paidCents,
  ticketInput,
};
