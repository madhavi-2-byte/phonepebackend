const Transaction = require("../models/transactionpay");
const BankAccount = require("../models/BankAccount");

// ✅ Add Money to Bank (Fixed)
exports.addTransaction = async (req, res) => {
  try {
    const { transactionId, amount, type, accountNumber } = req.body;

    if (!transactionId || !amount || amount <= 0 || !["credit", "debit"].includes(type) || !accountNumber) {
      return res.status(400).json({ success: false, message: "Invalid transaction details." });
    }

    // ✅ Find the associated bank account
    const bankAccount = await BankAccount.findOne({ accountNumber });
    if (!bankAccount) {
      return res.status(404).json({ success: false, message: "Bank account not found." });
    }

    let transactionStatus = "pending"; // ✅ Default to pending

    if (type === "credit") {
      bankAccount.balance += amount;
      transactionStatus = "success"; // ✅ Always lowercase
    } else if (type === "debit") {
      if (bankAccount.balance >= amount) {
        bankAccount.balance -= amount;
        transactionStatus = "success"; // ✅ Always lowercase
      } else {
        transactionStatus = "failed"; // ❌ Insufficient funds → failed
      }
    }

    // ✅ Update balance only if transaction is successful
    if (transactionStatus === "success") {
      await bankAccount.save();
    }

    // ✅ Save Transaction (Ensure lowercase status)
    const newTransaction = new Transaction({
      transactionId,
      amount,
      type,
      accountNumber,
      status: transactionStatus.toLowerCase(), // ✅ Convert status to lowercase
    });

    await newTransaction.save();

    res.json({
      success: transactionStatus === "success",
      message: transactionStatus === "success" ? "Transaction successful!" : "Transaction failed!",
      transaction: newTransaction,
      updatedBalance: bankAccount.balance,
    });
  } catch (error) {
    console.error("❌ Error adding transaction:", error);
    res.status(500).json({ success: false, message: "Server error. Try again." });
  }
};

// ✅ Get All Transactions (No User ID Required)
exports.addMoneyWithBank = async (req, res) => {
  try {
    console.log("📥 Received request for add-money-bank:", req.body);

    const { amount, accountNumber } = req.body;

    if (!amount || amount <= 0 || !accountNumber) {
      return res.status(400).json({ success: false, message: "Invalid request data." });
    }

    // ✅ Find the bank account using accountNumber
    const bankAccount = await BankAccount.findOne({ accountNumber });

    if (!bankAccount) {
      console.error("❌ Bank account not found:", accountNumber);
      return res.status(404).json({ success: false, message: "Bank account not found." });
    }

    // ✅ Generate a unique transaction ID
    let transactionId = `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;

    // ✅ Ensure `transactionId` is always set
    if (!transactionId) {
      console.error("❌ Transaction ID is null");
      return res.status(500).json({ success: false, message: "Failed to generate transaction ID" });
    }

    // ✅ Add money to the bank account balance
    bankAccount.balance += amount;
    await bankAccount.save();

    // ✅ Save the transaction with the correct `status`
    const newTransaction = await Transaction.create({
      transactionId,
      amount,
      type: "credit",
      status: "success", // ✅ FIXED ENUM VALUE
      accountNumber,
    });

    console.log("✅ Money added successfully! Updated bank account balance:", bankAccount.balance);

    res.json({
      success: true,
      message: "Money added successfully to bank!",
      bankAccountBalance: bankAccount.balance,
      transaction: newTransaction,
    });
  } catch (error) {
    console.error("❌ Error adding money to bank:", error.message);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
};

// ✅ Get All Transactions
// ✅ Get All Transactions (Credit & Debit)
exports.getTransactionHistory = async (req, res) => {
  try {
    const { accountNumber } = req.query;
    const filter = accountNumber ? { accountNumber } : {};

    const transactions = await Transaction.find(filter).sort({ timestamp: -1 });

    res.json({ success: true, transactions });
  } catch (error) {
    console.error("❌ Error fetching transaction history:", error);
    res.status(500).json({ success: false, message: "Server error. Try again." });
  }
};