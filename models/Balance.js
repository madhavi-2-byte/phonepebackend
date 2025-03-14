const mongoose = require("mongoose");

const BalanceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  balance: { type: Number, default: 0 },
});

module.exports = mongoose.model("Balance", BalanceSchema);
