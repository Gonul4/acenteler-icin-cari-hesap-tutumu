const mongoose = require("mongoose");
const schema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, immutable: true },
    name: { type: String, required: true, trim: true, maxlength: 150 },
    phone: { type: String, trim: true, maxlength: 40, default: "" },
    email: { type: String, trim: true, maxlength: 150, default: "" },
    address: { type: String, trim: true, maxlength: 500, default: "" },
    notes: { type: String, trim: true, maxlength: 2000, default: "" },
    defaultPosRate: { type: Number, min: 0, max: 99.99, default: 0 },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    staffName: { type: String, required: true },
    version: { type: Number, default: 0 },
    history: {
      type: [{ action: String, staffName: String, date: Date }],
      default: [],
    },
  },
  { timestamps: true },
);
module.exports = mongoose.model("Customer", schema);
