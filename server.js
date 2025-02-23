require("dotenv").config();
const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// Load environment variables
const MERCHANT_KEY = process.env.MERCHANT_KEY;
const MERCHANT_ID = process.env.MERCHANT_ID;
const MERCHANT_BASE_URL = "https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay";
const MERCHANT_STATUS_URL = "https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/status";
const SALT_INDEX = 1; // Use 1 for testing

// Validate environment variables
if (!MERCHANT_KEY || !MERCHANT_ID) {
  console.error("❌ ERROR: MERCHANT_KEY or MERCHANT_ID is missing in .env file!");
  process.exit(1);
}

// Generate SHA256 Checksum
const generateChecksum = (data, key) => {
  const hash = crypto.createHash("sha256").update(data + key).digest("hex");
  return hash + "###" + SALT_INDEX;
};

// 📌 Route to Initiate Payment
app.post("/payment/initiate", async (req, res) => {
  try {
    console.log("📩 Received payment request:", req.body);

    const { amount } = req.body;
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    const transactionId = `TXN${Date.now()}`;
    const redirectUrl = "https://your-app.com/payment-success"; // Replace with actual success URL

    const payload = {
      merchantId: MERCHANT_ID,
      merchantTransactionId: transactionId,
      amount: amount * 100, // Convert to paise
      redirectUrl,
      callbackUrl: redirectUrl,
      paymentInstrument: { type: "PAY_PAGE" },
    };

    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64");
    const checksum = generateChecksum(payloadBase64 + "/pg/v1/pay", MERCHANT_KEY);

    console.log("📨 Sending request to PhonePe...");

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

    console.log("📨 Full PhonePe Response:", JSON.stringify(response.data, null, 2));

    // Extract Payment URL
    const paymentUrl = response.data?.data?.instrumentResponse?.redirectInfo?.url || "";

    if (response.data.success && paymentUrl) {
      console.log("✅ Payment URL:", paymentUrl);
      return res.json({ success: true, paymentUrl });
    } else {
      console.error("❌ Payment URL not found in response.");
      return res.status(400).json({
        success: false,
        message: "Payment URL not received from PhonePe",
        response: response.data,
      });
    }
  } catch (error) {
    console.error("❌ PhonePe API Error:", error.response?.data || error.message);
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

    console.log("🔍 Checking status for:", transactionId);

    const response = await axios.get(`${MERCHANT_STATUS_URL}/${MERCHANT_ID}/${transactionId}`, {
      headers: { "Content-Type": "application/json", "X-VERIFY": checksum, "X-MERCHANT-ID": MERCHANT_ID },
    });

    console.log("📨 Payment Status Response:", response.data);

    if (response.data.success && response.data.code === "PAYMENT_SUCCESS") {
      return res.json({ success: true, message: "Payment successful" });
    } else {
      return res.status(400).json({ success: false, message: "Payment not successful", response: response.data });
    }
  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
    res.status(500).json({ success: false, error: error.response?.data || error.message });
  }
});

// Start Express Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
