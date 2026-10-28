const mongoose = require("mongoose");
module.exports = mongoose.model(
  "AccountEntry",
  new mongoose.Schema(
    {
      customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Customer",
        required: true,
        index: true,
        immutable: true,
      },
      type: {
        type: String,
        enum: ["payment", "debit", "credit", "refund"],
        required: true,
      },
      amountCents: { type: Number, required: true, min: 1, max: 100000000000 },
      commissionCents: { type: Number, default: 0, min: 0 },
      netCents: { type: Number, required: true, min: 1 },
      commissionMode: {
        type: String,
        enum: ["percent", "fixed"],
        default: "percent",
      },
      commissionValue: { type: Number, default: 0 },
      method: {
        type: String,
        enum: ["Nakit", "Havale", "Kart", ""],
        default: "",
      },
      date: { type: String, required: true },
      description: { type: String, required: true, maxlength: 500 },
      reference: { type: String, maxlength: 100, default: "" },
      account: { type: String, maxlength: 100, default: "" },
      staffId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      staffName: { type: String, required: true },
      requestId: { type: String, required: true, unique: true },
      requestHash: { type: String, required: true, select: false },
      version: { type: Number, default: 0 },
      history: { type: [mongoose.Schema.Types.Mixed], default: [] },
      voidedAt: Date,
      voidedBy: String,
      voidReason: { type: String, maxlength: 500 },
    },
    { timestamps: true },
  ),
);
