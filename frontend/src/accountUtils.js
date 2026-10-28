export const money = (n) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(
    (Number(n) || 0) / 100,
  );
export const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(
    new Date(),
  );
export const balanceLabel = (cents) =>
  cents > 0
    ? "Müşteri alacaklı"
    : cents < 0
      ? "Müşteri borçlu"
      : "Hesap dengede";
export const signedMoney = (n) =>
  `${n > 0 ? "+" : n < 0 ? "−" : ""}${money(Math.abs(n))}`;
export const netPreview = (amount, mode, value, method) => {
  const gross = Math.round((Number(amount) || 0) * 100);
  const fee =
    method !== "Kart"
      ? 0
      : mode === "fixed"
        ? Math.round((Number(value) || 0) * 100)
        : Math.round((gross * (Number(value) || 0)) / 100);
  return { gross, fee, net: gross - fee };
};
export const typeLabel = (type) =>
  ({
    ticket: "Bilet borcu",
    payment: "Tahsilat",
    legacy_payment: "Eski tahsilat",
    debit: "Borç kaydı",
    credit: "Alacak kaydı",
    refund: "İade / ödeme",
  })[type] || type;
export function csv(rows) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map(
            (v) =>
              '"' +
              (typeof v === "number"
                ? String(v)
                : String(v ?? "").replace(/^\s*[=+\-@\t\r]/, "'$&")
              ).replace(/"/g, '""') +
              '"',
          )
          .join(";"),
      )
      .join("\r\n")
  );
}
export const downloadCSV = (name, rows) => {
  const url = URL.createObjectURL(
    new Blob([csv(rows)], { type: "text/csv;charset=utf-8;" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};
