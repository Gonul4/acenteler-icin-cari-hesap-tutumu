export const money = (value) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(
    Number(value) || 0,
  );
export const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(
    new Date(),
  );
export const paid = (ticket) => {
  const legacy =
    Number(ticket.legacyPaidAmount) ||
    (ticket.isPaid && !ticket.payments?.length ? Number(ticket.price) || 0 : 0);
  return (
    (Math.round(legacy * 100) +
      (ticket.payments || [])
        .filter((p) => !p.voidedAt)
        .reduce((sum, p) => sum + Math.round(Number(p.amount) * 100), 0)) /
    100
  );
};
export const balance = (t) =>
  Math.max(0, Math.round(((Number(t.price) || 0) - paid(t)) * 100) / 100);
export const blankTicket = () => ({
  customerName: "",
  phone: "",
  pnr: "",
  ticketNumber: "",
  route: "",
  price: "",
  saleDate: today(),
  travelDate: "",
  notes: "",
});
export const csvContent = (tickets) => {
  const rows = [
    [
      "Müşteri",
      "Telefon",
      "PNR",
      "Bilet no",
      "Rota",
      "Satış tarihi",
      "Seyahat tarihi",
      "Tutar TL",
      "Tahsilat TL",
      "Kalan TL",
      "Çalışan",
      "Durum",
    ],
    ...tickets.map((t) => [
      t.customerName,
      t.phone,
      t.pnr,
      t.ticketNumber,
      t.route,
      t.saleDate || t.createdAt?.slice(0, 10),
      t.travelDate,
      t.price,
      paid(t),
      t.status === "cancelled" ? 0 : balance(t),
      t.staffName,
      t.status === "cancelled" ? "İptal" : balance(t) === 0 ? "Ödendi" : "Borç",
    ]),
  ];
  const cell = (value) =>
    '"' +
    String(value ?? "")
      .replace(/^[=+\-@\t\r]/, "'$&")
      .replace(/"/g, '""') +
    '"';
  return "\uFEFF" + rows.map((row) => row.map(cell).join(";")).join("\r\n");
};
