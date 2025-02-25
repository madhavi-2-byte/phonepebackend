require("dotenv").config();
const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
app.use(express.json());
app.use(cors());

// Load environment variables
const { MERCHANT_KEY, MERCHANT_ID, MONGO_URI } = process.env;
const MERCHANT_BASE_URL = "https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay";
const MERCHANT_STATUS_URL = "https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/status";
const SALT_INDEX = 1; // Sandbox uses 1

// Validate environment variables
if (!MERCHANT_KEY || !MERCHANT_ID || !MONGO_URI) {
  console.error("❌ ERROR: Missing required environment variables!");
  process.exit(1);
}

// Connect to MongoDB
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch(err => {
    console.error("❌ MongoDB Connection Error:", err);
    process.exit(1);
  });

// Define Bank Account Schema
const bankAccountSchema = new mongoose.Schema({
  accountHolder: String,
  accountNumber: { type: String, unique: true },
  ifscCode: String,
}, { timestamps: true });

const BankAccount = mongoose.model("BankAccount", bankAccountSchema);

// Define Balance Schema
const balanceSchema = new mongoose.Schema({
  userId: String,
  balance: { type: Number, default: 5000 },
}, { timestamps: true });

const Balance = mongoose.model("Balance", balanceSchema);

// Generate SHA256 Checksum
const generateChecksum = (data, key) => {
  const hash = crypto.createHash("sha256").update(data + key).digest("hex");
  return hash + "###" + SALT_INDEX;
};

// ✅ Get All Bank Accounts
app.get("/bank/accounts", async (req, res) => {
  try {
    const accounts = await BankAccount.find();
    res.json({ success: true, accounts });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Add Bank Account
// Add Bank Account and Fetch Balance
app.post("/bank/add", async (req, res) => {
  try {
    const { userId, accountHolder, accountNumber, ifscCode } = req.body;

    // Assuming you have a BankAccount model to store user bank accounts
    const bankAccount = new BankAccount({
      userId,
      accountHolder,
      accountNumber,
      ifscCode,
    });

    // Save the new bank account
    await bankAccount.save();

    // Assuming you have a Balance model that holds the user's balance
    let userBalance = await Balance.findOne({ userId });

    // If no balance exists, create a new one
    if (!userBalance) {
      userBalance = new Balance({
        userId,
        balance: 5000, // You can set this to any initial value or retrieve it from a payment system
      });
      await userBalance.save();
    }

    // For simplicity, let's assume you update balance by adding a certain amount (e.g., ₹1000)
    userBalance.balance += 1000; // Add ₹1000 or whatever the logic is
    await userBalance.save();

    // Return success response with updated balance
    res.json({
      success: true,
      message: "Bank account added successfully",
      updatedBalance: userBalance.balance,
    });
  } catch (error) {
    console.error("❌ Error adding bank account:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Delete Bank Account
app.delete("/bank/delete/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const deletedAccount = await BankAccount.findByIdAndDelete(id);
    if (!deletedAccount) {
      return res.status(404).json({ success: false, message: "Bank account not found" });
    }

    res.json({ success: true, message: "Bank account deleted" });
  } catch (error) {
    console.error("❌ Error deleting account:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Get User Balance
// ✅ Get User Balance
app.get("/balance", async (req, res) => {
  try {
    // Assuming you're using userId to find the balance; replace with actual user ID logic
    const userId = "defaultUserId"; // You can replace this with dynamic user ID logic

    let userBalance = await Balance.findOne({ userId });
    
    if (!userBalance) {
      // Insert a default balance if not found
      userBalance = new Balance({ userId, balance: 5000 });
      await userBalance.save();
    }
    
    res.json({ success: true, balance: userBalance.balance });
  } catch (error) {
    console.error("❌ Error fetching balance:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// 📌 Initiate Payment
app.post("/payment/initiate", async (req, res) => {
  try {
    const amount = Number(req.body.amount); // Convert to Number
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    const transactionId = `TXN${Date.now()}`;
    const redirectUrl = "https://your-app.com/payment-success";
    const callbackUrl = "https://your-app.com/payment-callback";

    const payload = {
      merchantId: MERCHANT_ID,
      merchantTransactionId: transactionId,
      amount: amount * 100, // Convert to paise
      redirectUrl,
      callbackUrl,
      paymentInstrument: { type: "PAY_PAGE" },
    };

    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64");
    const checksum = generateChecksum(payloadBase64 + "/pg/v1/pay", MERCHANT_KEY);

    const response = await axios.post(
      MERCHANT_BASE_URL,
      { request: payloadBase64 },
      {
        headers: {
          "Content-Type": "application/json",
          "X-VERIFY": checksum,
          "X-MERCHANT-ID": MERCHANT_ID,
        },
      }
    );

    const paymentUrl = response.data?.data?.instrumentResponse?.redirectInfo?.url || "";

    if (response.data.success && paymentUrl) {
      return res.json({ success: true, paymentUrl });
    } else {
      return res.status(400).json({
        success: false,
        message: "Payment URL not received from PhonePe",
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.response?.data || error.message,
    });
  }
});

// 📌 Route to Check Payment Status
app.get("/payment/status/:transactionId", async (req, res) => {
  try {
    const { transactionId } = req.params;
    const statusUrl = `/pg/v1/status/${MERCHANT_ID}/${transactionId}`;
    const checksum = generateChecksum(statusUrl, MERCHANT_KEY);

    const response = await axios.get(`${MERCHANT_STATUS_URL}/${MERCHANT_ID}/${transactionId}`, {
      headers: { "Content-Type": "application/json", "X-VERIFY": checksum, "X-MERCHANT-ID": MERCHANT_ID },
    });

    if (response.data.success && response.data.code === "PAYMENT_SUCCESS") {
      return res.json({ success: true, message: "Payment successful" });
    } else {
      return res.status(400).json({ success: false, message: "Payment not successful", response: response.data });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.response?.data || error.message });
  }
});

// Start Express Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
