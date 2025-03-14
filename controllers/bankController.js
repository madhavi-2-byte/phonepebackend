const BankAccount = require("../models/BankAccount");

// ✅ Get all bank accounts
exports.getBankAccounts = async (req, res) => {
  try {
    console.log("🔹 Received request to fetch bank accounts");

    const accounts = await BankAccount.find();

    console.log("✅ Retrieved accounts:", accounts);
    res.json({ success: true, accounts });
  } catch (error) {
    console.error("❌ Error fetching accounts:", error);
    res.status(500).json({ success: false, message: "Error fetching accounts." });
  }
};

// ✅ Add a bank account
exports.addBankAccount = async (req, res) => {
  try {
    const { accountHolder, accountNumber, ifscCode } = req.body;

    // Simple validation
    if (!accountHolder || !accountNumber || !ifscCode) {
      return res.status(400).json({ success: false, message: "All fields are required." });
    }

    // Create a new bank account
    const newAccount = new BankAccount({
      accountHolder,
      accountNumber,
      ifscCode,
    });

    await newAccount.save();

    res.json({ success: true, message: "Bank account added successfully." });
  } catch (error) {
    console.error("❌ Error adding bank account:", error);
    res.status(500).json({ success: false, message: "Error adding bank account." });
  }
};

// ✅ Delete a bank account
exports.deleteBankAccount = async (req, res) => {
  try {
    const { accountId } = req.params;

    const deletedAccount = await BankAccount.findByIdAndDelete(accountId);

    if (!deletedAccount) return res.status(404).json({ success: false, message: "Bank account not found." });

    res.json({ success: true, message: "Bank account deleted successfully." });
  } catch (error) {
    console.error("❌ Error deleting bank account:", error);
    res.status(500).json({ success: false, message: "Error deleting account." });
  }
};
