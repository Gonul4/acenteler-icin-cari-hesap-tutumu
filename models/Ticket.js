const mongoose = require("mongoose");
const PaymentSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 0.01 },
    date: { type: String, required: true },
    method: { type: String, enum: ["Nakit", "Havale", "Kart"], required: true },
    staffName: { type: String, required: true },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    note: { type: String, maxlength: 500, default: "" },
    voidedAt: Date,
    voidedBy: String,
    voidReason: { type: String, maxlength: 500 },
  },
  { timestamps: true },
);
const TicketSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      index: true,
    },
    customerName: { type: String, required: true, trim: true, maxlength: 150 },
    route: { type: String, trim: true, maxlength: 200, default: "" },
    price: { type: Number, required: true, min: 0.01 },
    staffName: { type: String, required: true },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    pnr: { type: String, trim: true, maxlength: 50, default: "" },
    ticketNumber: { type: String, trim: true, maxlength: 80, default: "" },
    phone: { type: String, trim: true, maxlength: 40, default: "" },
    saleDate: { type: String, default: "" },
    travelDate: { type: String, default: "" },
    dueDate: { type: String, default: "" },
    notes: { type: String, maxlength: 2000, default: "" },
    isPaid: { type: Boolean, default: false },
    legacyPaidAmount: { type: Number, min: 0, default: 0 },
    payments: { type: [PaymentSchema], default: [] },
    status: { type: String, enum: ["active", "cancelled"], default: "active" },
    deletedAt: Date,
    deletedBy: String,
    version: { type: Number, default: 0 },
    history: {
      type: [{ action: String, staffName: String, date: Date }],
      default: [],
    },
  },
  { timestamps: true },
);
module.exports = mongoose.model("Ticket", TicketSchema);
