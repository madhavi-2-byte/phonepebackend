const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");

// Initiate payment
router.post("/api/initiate-payment", paymentController.initiatePayment);

// Check payment status
router.post("/api/check-payment-status", paymentController.checkPaymentStatus);

module.exports = router;
