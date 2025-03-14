const mongoose = require("mongoose");

const bankAccountSchema = new mongoose.Schema(
  {
    accountHolder: { type: String, required: true },
    accountNumber: { type: String, required: true },
    balance: { type: Number, default: 0 },
    ifscCode: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("BankAccount", bankAccountSchema);
