require("dotenv").config();
const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
app.use(express.json());
app.use(cors());

const { MERCHANT_KEY, MERCHANT_ID, MONGO_URI, PORT } = process.env;
const MERCHANT_BASE_URL = "https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay";
const MERCHANT_STATUS_URL = "https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/status";
const SALT_INDEX = 1;

if (!MERCHANT_KEY || !MERCHANT_ID || !MONGO_URI) {
  console.error("❌ ERROR: Missing required environment variables!");
  process.exit(1);
}

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch(err => {
    console.error("❌ MongoDB Connection Error:", err);
    process.exit(1);
  });

const bankAccountSchema = new mongoose.Schema({
  accountHolder: String,
  accountNumber: { type: String, unique: true },
  ifscCode: String,
}, { timestamps: true });

const BankAccount = mongoose.model("BankAccount", bankAccountSchema);

const balanceSchema = new mongoose.Schema({
  balance: { type: Number, required: true },
}, { timestamps: true });

const Balance = mongoose.model("Balance", balanceSchema);

const transactionSchema = new mongoose.Schema({
  merchantTransactionId: String,
  amount: Number,
  status: String, // Pending, Success, Failed
}, { timestamps: true });

const Transaction = mongoose.model("Transaction", transactionSchema);

const generateChecksum = (data, key) => {
  return crypto.createHash("sha256").update(data + key).digest("hex") + "###" + SALT_INDEX;
};

app.get("/health", (req, res) => {
  res.json({ success: true, message: "API is running" });
});

app.get("/bank/balance", async (req, res) => {
  try {
    const balance = await Balance.findOne();
    if (!balance) {
      return res.status(404).json({ success: false, message: "Balance not found." });
    }
    res.json({ success: true, balance: balance.balance });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching balance." });
  }
});

app.get("/bank/accounts", async (req, res) => {
  try {
    const accounts = await BankAccount.find();
    res.json({ success: true, accounts });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post("/bank/add", async (req, res) => {
  try {
    console.log("Received data:", req.body); // Debugging: Log incoming request

    const { accountHolder, accountNumber, ifscCode } = req.body;

    if (!accountHolder || !accountNumber || !ifscCode) {
      return res.status(400).json({ success: false, message: "All fields are required." });
    }

    const newAccount = new BankAccount({ accountHolder, accountNumber, ifscCode });

    await newAccount.save(); // Save to MongoDB

    res.json({ success: true, message: "Bank account added successfully." });
  } catch (error) {
    console.error("Error adding account:", error); // Log full error in console

    res.status(500).json({
      success: false,
      message: "Error adding account.",
      error: error.message, // Send error message for debugging
    });
  }
});
app.delete("/bank/delete/:accountId", async (req, res) => {
  try {
    const { accountId } = req.params; // Correctly extract accountId

    const deletedAccount = await BankAccount.findByIdAndDelete(accountId); // Use _id instead of accountNumber

    if (!deletedAccount) {
      return res.status(404).json({ success: false, message: "Bank account not found." });
    }

    res.json({ success: true, message: "Bank account deleted successfully." });
  } catch (error) {
    console.error("Error deleting account:", error);
    res.status(500).json({ success: false, message: "Error deleting account." });
  }
});

app.post("/payment/initiate", async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }
    const transactionId = `TXN${Date.now()}`;
    const newTransaction = new Transaction({ merchantTransactionId: transactionId, amount, status: "Pending" });
    await newTransaction.save();
    const payload = {
      merchantId: MERCHANT_ID,
      merchantTransactionId: transactionId,
      amount: amount * 100,
      redirectUrl: `http://your-backend.com/payment-success?txnId=${transactionId}`,
      callbackUrl: `http://your-backend.com/payment-callback`,
      paymentInstrument: { type: "PAY_PAGE" },
    };
    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64");
    const checksum = generateChecksum(payloadBase64 + "/pg/v1/pay", MERCHANT_KEY);
    const response = await axios.post(MERCHANT_BASE_URL, { request: payloadBase64 }, {
      headers: {
        "Content-Type": "application/json",
        "X-VERIFY": checksum,
        "X-MERCHANT-ID": MERCHANT_ID,
      },
    });
    const paymentUrl = response.data?.data?.instrumentResponse?.redirectInfo?.url || "";
    res.json({ success: true, paymentUrl });
  } catch (error) {
    res.status(500).json({ success: false, error: error.response?.data || error.message });
  }
});

app.post("/payment-callback", async (req, res) => {
  try {
    const { merchantTransactionId } = req.body;
    const checksum = generateChecksum(`/pg/v1/status/${merchantTransactionId}`, MERCHANT_KEY);
    const response = await axios.get(`${MERCHANT_STATUS_URL}/${merchantTransactionId}`, {
      headers: {
        "Content-Type": "application/json",
        "X-VERIFY": checksum,
        "X-MERCHANT-ID": MERCHANT_ID,
      },
    });
    const transactionData = response.data;
    if (transactionData.success && transactionData.code === "PAYMENT_SUCCESS") {
      const transaction = await Transaction.findOne({ merchantTransactionId });
      if (!transaction) {
        return res.status(404).json({ success: false, message: "Transaction not found" });
      }
      let userBalance = await Balance.findOne();
      if (!userBalance) {
        userBalance = new Balance({ balance: transaction.amount });
      } else {
        userBalance.balance += transaction.amount;
      }
      await userBalance.save();
      transaction.status = "Success";
      await transaction.save();
      res.json({ success: true, message: "Payment successful & balance updated." });
    } else {
      res.status(400).json({ success: false, message: "Payment failed." });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: "Error verifying payment." });
  }
});

const serverPort = PORT || 5000;
app.listen(serverPort, () => console.log(`🚀 Server running on port ${serverPort}`));
