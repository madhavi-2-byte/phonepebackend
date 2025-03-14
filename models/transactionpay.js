const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  transactionId: { type: String, required: true, unique: true },
  amount: { type: Number, required: true },
  type: { type: String, enum: ["credit", "debit"], required: true },
  status: { type: String, enum: ["success", "failed", "pending"], required: true },
  accountNumber: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

// Define the model using mongoose.model
const Transaction = mongoose.model("Transaction", transactionSchema);

module.exports = Transaction;
