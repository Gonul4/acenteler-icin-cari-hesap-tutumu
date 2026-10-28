const mongoose = require("mongoose");
module.exports = mongoose.model(
  "Counter",
  new mongoose.Schema({ _id: String, value: { type: Number, default: 0 } }),
);
