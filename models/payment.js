const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
  merchantTransactionId: {
    type: String,
    required: true,
    unique: true, // Ensure no duplicate transaction IDs
  },
  amount: {
    type: Number,
    required: true,
  },

  status: {
    type: String,
    enum: ["pending", "success", "failed"], // ✅ Ensure status validation
    default: "pending",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Payment", paymentSchema);
