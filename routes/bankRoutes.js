const express = require("express");
const router = express.Router();
const bankController = require("../controllers/bankController"); // ✅ Ensure correct import

// ✅ Define Routes
router.get("/bank/accounts", bankController.getBankAccounts);
router.post("/bank/add", bankController.addBankAccount);
router.delete("/bank/delete/:accountId", bankController.deleteBankAccount);


module.exports = router;
