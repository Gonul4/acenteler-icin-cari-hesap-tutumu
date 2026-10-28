const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  entryInput,
  ledgerRows,
  summarize,
  statement,
  customerInput,
  paymentSchedule,
} = require("../lib/accounts");
const req = {
  type: "payment",
  amount: 10000,
  date: "2026-10-07",
  method: "Kart",
  commissionMode: "percent",
  commissionValue: 2,
  description: "POS tahsilatı",
  requestId: "00000000-0000-4000-8000-000000000001",
};
test("10000 TL at 2% adds net 9800 TL, leaves +1800 after 8000 debt", () => {
  const entry = { _id: "e1", ...entryInput(req, { defaultPosRate: 2 }) };
  assert.equal(entry.commissionCents, 20000);
  assert.equal(entry.netCents, 980000);
  const rows = ledgerRows(
    [{ _id: "t1", price: 8000, saleDate: "2026-10-07" }],
    [entry],
  );
  assert.equal(summarize(rows).balanceCents, 180000);
  assert.equal(summarize(ledgerRows([], [entry])).balanceCents, 980000);
});
test("payment reminders apply net credits to oldest debts and omit settled, cancelled and deleted tickets", () => {
  const tickets = [
    { _id: "old", price: 1000, saleDate: "2026-10-01" },
    { _id: "due", price: 10000, saleDate: "2026-10-02", dueDate: "2026-11-03", pnr: "DUE03" },
    { _id: "later", price: 2000, saleDate: "2026-10-03", dueDate: "2026-11-05" },
    { _id: "cancelled", price: 5000, saleDate: "2026-09-01", dueDate: "2026-10-01", status: "cancelled" },
    { _id: "deleted", price: 5000, saleDate: "2026-09-01", dueDate: "2026-10-01", deletedAt: new Date() },
  ];
  const paid = { _id: "pos", ...entryInput(req, {}) }; // net 9800, first 1000 clears old debt
  let reminders = paymentSchedule(tickets, [paid]);
  assert.deepEqual(reminders.map((r) => [r.ticketId, r.remainingCents]), [["due", 120000], ["later", 200000]]);
  const extra = { _id: "cash", type: "payment", netCents: 320000, date: "2026-10-08" };
  assert.deepEqual(paymentSchedule(tickets, [paid, extra]), []);
  extra.voidedAt = new Date();
  assert.deepEqual(paymentSchedule(tickets, [paid, extra]), reminders);
  const manual = { _id: "debit", type: "debit", netCents: 50000, date: "2026-09-01" };
  assert.equal(paymentSchedule(tickets, [paid, manual])[0].remainingCents, 170000);
});
test("fixed fee and invalid commission cases are validated", () => {
  assert.equal(
    entryInput({ ...req, commissionMode: "fixed", commissionValue: 250 }, {})
      .netCents,
    975000,
  );
  for (const commissionValue of [-1, 100, "invalid", true])
    assert.throws(() => entryInput({ ...req, commissionValue }, {}));
  assert.throws(() =>
    entryInput({ ...req, commissionMode: "fixed", commissionValue: 10000 }, {}),
  );
  assert.throws(() => entryInput({ ...req, method: "Havale" }, {}));
  assert.equal(
    entryInput({ ...req, method: "Havale", commissionValue: 0 }, {}).netCents,
    1000000,
  );
});
test("voids and cancelled bills are visible but excluded from balances", () => {
  const rows = ledgerRows(
    [{ _id: "t1", price: 1000, saleDate: "2026-10-07", status: "cancelled" }],
    [{ _id: "e1", ...entryInput(req, {}), voidedAt: new Date() }],
  );
  assert.equal(rows.length, 2);
  assert.equal(summarize(rows).balanceCents, 0);
  assert.ok(rows.every((r) => r.voided));
});
test("date-filtered statements carry prior and undated payments without guessing dates", () => {
  const rows = ledgerRows(
    [{ _id: "t", price: 5000, isPaid: true, saleDate: "2026-10-01" }],
    [{ _id: "e", ...entryInput({ ...req, date: "2026-10-07" }, {}) }],
  );
  const result = statement(rows, "2026-10-07", "2026-10-07");
  assert.equal(result.openingBalanceCents, 0);
  assert.equal(result.rows.length, 1);
  assert.equal(result.endingBalanceCents, 980000);
  assert.equal(result.unknownDateCount, 1);
  assert.throws(() => statement(rows, "2026-10-08", "2026-10-01"));
});
test("refund/debit and credit corrections preserve cents and account separation", () => {
  const base = entryInput(req, {});
  const refund = entryInput(
    {
      ...req,
      type: "refund",
      amount: 1000,
      method: "Havale",
      commissionValue: 0,
    },
    {},
  );
  assert.equal(
    summarize(
      ledgerRows(
        [],
        [
          { _id: "p", ...base },
          { _id: "r", ...refund },
        ],
      ),
    ).balanceCents,
    880000,
  );
  assert.equal(
    customerInput({ name: "  Ada ", code: "spoof", defaultPosRate: "2.5" })
      .name,
    "Ada",
  );
  assert.equal(customerInput({ name: "Ada" }).code, undefined);
});
