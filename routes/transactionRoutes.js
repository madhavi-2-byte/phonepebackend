const express = require("express");
const { 
    addTransaction, 
    getTransactionHistory, 
    addMoneyWithBank 
} = require("../controllers/transactionController"); // ✅ Ensure all functions are imported

const router = express.Router();

router.post("/add", addTransaction);
router.get("/history", getTransactionHistory); // ✅ Ensure this function exists in transactionController.js
router.post("/add-money-bank", addMoneyWithBank); 

module.exports = router;
