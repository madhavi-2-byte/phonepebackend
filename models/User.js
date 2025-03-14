const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  bankAccounts: [{ type: mongoose.Schema.Types.ObjectId, ref: "BankAccount" }],
  balance: { type: Number, default: 0 },
});

module.exports = mongoose.model("User", UserSchema);
