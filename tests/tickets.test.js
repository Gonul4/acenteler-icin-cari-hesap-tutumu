const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  cents,
  validDate,
  legacyAmount,
  paidCents,
  ticketInput,
} = require("../lib/tickets");
const input = {
  customerName: " Ayşe ",
  route: "IST-AYT",
  price: "19.99",
  saleDate: "2026-10-06",
  travelDate: "",
};
test("money uses cents and rejects invalid amounts", () => {
  assert.equal(cents("19.99"), 1999);
  for (const value of ["", -1, 0, 1.001, NaN, Infinity, null, {}, 1e10])
    assert.throws(() => cents(value));
});
test("legacy paid data survives price changes without inventing payment details", () => {
  assert.equal(legacyAmount({ price: 5000, isPaid: true }), 5000);
  assert.equal(
    paidCents({
      price: 6000,
      isPaid: false,
      legacyPaidAmount: 5000,
      payments: [],
    }),
    500000,
  );
});
test("voided payments are excluded and partial payments round correctly", () => {
  assert.equal(
    paidCents({
      payments: [
        { amount: 0.1 },
        { amount: 0.2 },
        { amount: 100, voidedAt: new Date() },
      ],
    }),
    30,
  );
});
test("dates and customer data are validated; trusted fields are not taken from client", () => {
  assert.equal(validDate("2026-02-30"), false);
  const data = ticketInput({
    ...input,
    staffName: "spoof",
    staffId: "spoof",
    isPaid: true,
    status: "cancelled",
  });
  assert.equal(data.customerName, "Ayşe");
  assert.equal(data.price, 19.99);
  assert.equal(data.phone, "");
  for (const key of ["staffName", "staffId", "isPaid", "status"])
    assert.equal(data[key], undefined);
  assert.throws(() => ticketInput({ ...input, customerName: " " }));
  assert.throws(() => ticketInput({ ...input, saleDate: "2026-02-30" }));
  assert.equal(ticketInput({ ...input, dueDate: "2026-11-03" }).dueDate, "2026-11-03");
  assert.equal(ticketInput(input).dueDate, "");
  for (const dueDate of ["2026-02-30", "03/11/2026", 123, false])
    assert.throws(() => ticketInput({ ...input, dueDate }));
});
