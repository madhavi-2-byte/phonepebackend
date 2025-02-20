require("dotenv").config();
const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
app.use(express.json());
app.use(cors());

const MERCHANT_KEY = process.env.MERCHANT_KEY;
const MERCHANT_ID = process.env.MERCHANT_ID;
const MERCHANT_BASE_URL = "https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay";
const MERCHANT_STATUS_URL = "https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/status";
const SALT_INDEX = 1; // Keep it as 1 for testing
const MONGO_URI = process.env.MONGO_URI;

// Connect to MongoDB
mongoose
  .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Generate SHA256 Checksum
const generateChecksum = (data, key) => {
  const hash = crypto.createHash("sha256").update(data + key).digest("hex");
  return hash + "###" + SALT_INDEX;
};

// Route to Initiate Payment
app.post("/payment/initiate", async (req, res) => {
  try {
    console.log("📩 Received payment request:", req.body); // Debugging

    const { amount } = req.body;
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    const transactionId = `TXN${Date.now()}`;
    const redirectUrl = "https://your-app.com/payment-success"; // Change this URL

    const payload = {
      merchantId: MERCHANT_ID,
      merchantTransactionId: transactionId,
      amount: amount * 100, // Convert to paise
      redirectUrl,
      callbackUrl: redirectUrl,
      mobileNumber: "9999999999", // Replace with actual user number
      paymentInstrument: {
        type: "PAY_PAGE",
      },
    };

    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64");
    const checksum = generateChecksum(payloadBase64 + "/pg/v1/pay", MERCHANT_KEY);

    console.log("🔑 Payload:", payload);
    console.log("🔒 Checksum:", checksum);

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

    console.log("📨 PhonePe Response:", response.data);

    if (response.data.success && response.data.data.instrumentResponse.redirectInfo.url) {
      return res.json({
        success: true,
        paymentUrl: response.data.data.instrumentResponse.redirectInfo.url,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: response.data.message || "Payment initiation failed",
      });
    }
  } catch (error) {
    console.error("❌ PhonePe API Error:", error.response?.data || error.message);
    res.status(500).json({ success: false, error: error.response?.data || error.message });
  }
});

// Route to Check Payment Status
app.get("/payment/status/:transactionId", async (req, res) => {
  try {
    const { transactionId } = req.params;
    const statusUrl = `/pg/v1/status/${MERCHANT_ID}/${transactionId}`;
    const checksum = generateChecksum(statusUrl, MERCHANT_KEY);

    console.log("🔍 Checking status for:", transactionId);

    const response = await axios.get(`${MERCHANT_STATUS_URL}/${MERCHANT_ID}/${transactionId}`, {
      headers: { "Content-Type": "application/json", "X-VERIFY": checksum, "X-MERCHANT-ID": MERCHANT_ID },
    });

    res.json(response.data);
  } catch (error) {
    console.error("❌ PhonePe API Error:", error.response?.data || error.message);
    res.status(500).json({ success: false, error: error.response?.data || error.message });
  }
});

// Start Express Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
