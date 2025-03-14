// controllers/paymentController.js

const axios = require("axios");
const crypto = require("crypto");
const Transaction = require("../models/payment");
const Balance = require("../models/Balance");
const { MERCHANT_ID, MERCHANT_KEY, CALLBACK_URL, MERCHANT_BASE_URL, MERCHANT_STATUS_URL } = process.env;

// Helper function to generate checksum
const generateChecksum = (data) => {
  return crypto.createHash("sha256").update(data + MERCHANT_KEY).digest("hex") + "###" + 1;
};

// API: Initiate Payment
const initiatePayment = async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount) {
      return res.status(400).json({ success: false, message: "Amount is required." });
    }

    // Generate unique transactionId
    const transactionId = `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`; // Adding randomness to avoid collisions

    // Log to verify the transaction ID generation
    console.log("Generated Transaction ID:", transactionId);

    // Ensure transactionId is valid
    if (!transactionId) {
      return res.status(400).json({ success: false, message: "Transaction ID cannot be null." });
    }

    const payload = {
      merchantId: MERCHANT_ID,
      merchantTransactionId: transactionId,
      amount: amount * 100, // Convert amount to the smallest unit (paise for INR)
      redirectUrl: CALLBACK_URL,
      callbackUrl: CALLBACK_URL,
      paymentInstrument: { type: "PAY_PAGE" },
    };

    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64");
    const checksum = generateChecksum(payloadBase64 + "/pg/v1/pay");

    // Save the transaction in the database
    const existingTransaction = await Transaction.findOne({ merchantTransactionId: transactionId });
    if (existingTransaction) {
      return res.status(400).json({ success: false, message: "Transaction ID already exists." });
    }

    const newTransaction = new Transaction({
      merchantTransactionId: transactionId, // Use merchantTransactionId
      amount,
      status: "pending",
    });
    await newTransaction.save();

    const response = await axios.post(`${MERCHANT_BASE_URL}`, { request: payloadBase64 }, {
      headers: {
        "Content-Type": "application/json",
        "X-VERIFY": checksum,
        "X-MERCHANT-ID": MERCHANT_ID,
      },
    });

    const paymentUrl = response.data?.data?.instrumentResponse?.redirectInfo?.url;
    if (!paymentUrl) {
      throw new Error("Payment URL not found in response");
    }

    res.json({ success: true, paymentUrl, transactionId });

  } catch (error) {
    console.error("🔴 Payment Initiation Error:", error.response?.data || error.message);
    res.status(500).json({ success: false, message: "Error initiating payment." });
  }
};

// API: Check Payment Status and Update Balance
const checkPaymentStatus = async (req, res) => {
  try {
    const { transactionId } = req.body;

    if (!transactionId) {
      return res.status(400).json({ success: false, message: "Transaction ID is required." });
    }

    const payload = `/pg/v1/status/${MERCHANT_ID}/${transactionId}`;
    const checksum = generateChecksum(payload);

    const response = await axios.get(`${MERCHANT_STATUS_URL}/${MERCHANT_ID}/${transactionId}`, {
      headers: {
        "Content-Type": "application/json",
        "X-VERIFY": checksum,
        "X-MERCHANT-ID": MERCHANT_ID,
      },
    });

    let transaction = await Transaction.findOne({ merchantTransactionId: transactionId });
    if (!transaction) {
      return res.status(404).json({ success: false, message: "Transaction not found." });
    }

    let balance = await Balance.findOne({ userId: req.user.id });
    if (!balance) {
      balance = new Balance({ userId: req.user.id, balance: 0 });
      await balance.save();
    }

    const paymentStatus = response.data.code;

    if (paymentStatus === "PAYMENT_SUCCESS") {
      if (transaction.status === "Success") {
        return res.json({ success: true, message: "Payment already processed." });
      }

      balance.balance += transaction.amount;
      await balance.save();

      transaction.status = "Success";
      await transaction.save();

      // Emit balance update (ensure `io` is correctly initialized)
      io.emit("balanceUpdate", balance.balance);

      return res.json({ success: true, message: "Payment successful.", remainingBalance: balance.balance });
    } else if (paymentStatus === "PAYMENT_PENDING") {
      return res.json({ success: false, message: "Payment is still pending." });
    } else {
      transaction.status = "Failed";
      await transaction.save();
      return res.json({ success: false, message: "Payment failed." });
    }
  } catch (error) {
    console.error("🔴 Payment Status Check Error:", error.message);
    res.status(500).json({ success: false, message: "Error checking payment status." });
  }
};

module.exports = { initiatePayment, checkPaymentStatus };

