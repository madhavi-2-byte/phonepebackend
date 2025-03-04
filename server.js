require("dotenv").config();
const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const cors = require("cors");
const mongoose = require("mongoose");
const http = require("http");
const bcrypt = require("bcrypt");
const twilio = require("twilio");
const { Server } = require("socket.io");

const app = express();
app.use(express.json());
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ✅ Environment Variables
const { 
  MERCHANT_ID, 
  MERCHANT_KEY,
  MERCHANT_BASE_URL,
  MERCHANT_STATUS_URL, 
  MONGO_URI, 
  PORT, 
  TWILIO_ACCOUNT_SID, 
  TWILIO_AUTH_TOKEN, 
  TWILIO_VERIFY_SERVICE_SID, 
  SALT_ROUNDS, 
  SALT_KEY 
} = process.env;  // Add this to your .env or set a default
const CALLBACK_URL = process.env.CALLBACK_URL;
const SALT_INDEX=1


// ✅ Connect to MongoDB
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err);
    process.exit(1);
  });

// ✅ Define MongoDB Schemas
const User = mongoose.model("User", new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true },
}));

// ✅ Set default balance to 0
const Balance = mongoose.model("Balance", new mongoose.Schema({ balance: { type: Number, default: 0 } }, { timestamps: true }));


const Transaction = mongoose.model("Transaction", new mongoose.Schema({
  merchantTransactionId: String,
  amount: Number,
  status: String, 
}, { timestamps: true }));

const BankAccount = mongoose.model("BankAccount", new mongoose.Schema({
  accountHolder: String,
  accountNumber: { type: String, unique: true },
  ifscCode: String,
}, { timestamps: true }));

// ✅ Twilio Client
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// ✅ API to Send OTP
app.post("/send-otp", async (req, res) => {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) return res.status(400).json({ success: false, message: "Phone number is required" });

    try {
        const otpResponse = await client.verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID)
            .verifications.create({ to: phoneNumber, channel: "sms" });

        res.json({ success: true, message: "OTP sent successfully", sid: otpResponse.sid });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error sending OTP", error });
    }
});

// ✅ API to Verify OTP
app.post("/verify-otp", async (req, res) => {
    const { phoneNumber, otp } = req.body;
    
    if (!phoneNumber || !otp) return res.status(400).json({ success: false, message: "Phone number and OTP are required" });

    try {
        const verification = await client.verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID)
            .verificationChecks.create({ to: phoneNumber, code: otp });

        if (verification.status === "approved") {
            res.json({ success: true, message: "OTP verified successfully" });
        } else {
            res.status(400).json({ success: false, message: "Invalid OTP" });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "Error verifying OTP", error });
    }
});
// ✅ Create Password
// ✅ Create Password with Validation
app.post("/create-password", async (req, res) => {
  try {
    const { phone, password, confirmPassword } = req.body;

    console.log("📥 Step 1: Received Data:", req.body);

    // ✅ Validate input fields
    if (!phone || !password || !confirmPassword) {
      console.log("❌ Step 2: Missing Fields");
      return res.status(400).json({ success: false, message: "All fields are required." });
    }

    if (password !== confirmPassword) {
      console.log("❌ Step 3: Passwords do not match");
      return res.status(400).json({ success: false, message: "Passwords do not match." });
    }

    // ✅ Password Strength Check
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    
    if (!passwordRegex.test(password)) {
      console.log("❌ Step 4: Weak Password");
      return res.status(400).json({ 
        success: false, 
        message: "Password must be at least 8 characters long and include uppercase, lowercase, a number, and a special character." 
      });
    }

    // ✅ Check if user already exists
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      console.log("❌ Step 5: User already exists");
      return res.status(400).json({ success: false, message: "User already exists. Please log in." });
    }

    // ✅ Hash the password
    const saltRounds = parseInt(process.env.SALT_ROUNDS) || 10;
    console.log("🔹 Step 6: SALT_ROUNDS:", saltRounds);
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    console.log("✅ Step 7: Password hashed");

    // ✅ Save the user in MongoDB
    const newUser = new User({ phone, password: hashedPassword });
    await newUser.save();

    console.log("✅ Step 8: User saved in database");
    res.json({ success: true, message: "Password created successfully!" });

  } catch (error) {
    console.error("❌ Step 9: Error in /create-password:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// ✅ Login
app.post("/login", async (req, res) => {
  try {
    const { phone, password } = req.body;
    const user = await User.findOne({ phone });
    if (!user || !(await bcrypt.compare(password, user.password))) 
      return res.status(400).json({ success: false, message: "Invalid credentials" });

    res.json({ success: true, message: "Login successful!" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});


app.get("/user/balance", async (req, res) => {
  try {
    let balance = await Balance.findOne();
    
    if (!balance) {
      // ✅ Ensure balance is 0 if it's not set in the database
      balance = new Balance({ balance: 0 });
      await balance.save();
    }

    return res.json({ success: true, balance: balance.balance });

  } catch (error) {
    return res.status(500).json({ success: false, message: "Error fetching balance." });
  }
});



// ✅ API: Get All Bank Accounts
app.get("/bank/accounts", async (req, res) => {
  try {
    const accounts = await BankAccount.find();
    res.json({ success: true, accounts });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching accounts." });
  }
});

// ✅ API: Add Bank Account
app.post("/bank/add", async (req, res) => {
  try {
    const { accountHolder, accountNumber, ifscCode } = req.body;
    if (!accountHolder || !accountNumber || !ifscCode) {
      return res.status(400).json({ success: false, message: "All fields are required." });
    }

    const newAccount = new BankAccount({ accountHolder, accountNumber, ifscCode });
    await newAccount.save();

    res.json({ success: true, message: "Bank account added successfully." });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error adding account." });
  }
});

// ✅ API: Delete Bank Account
app.delete("/bank/delete/:accountId", async (req, res) => {
  try {
    const { accountId } = req.params;
    const deletedAccount = await BankAccount.findByIdAndDelete(accountId);

    if (!deletedAccount) {
      return res.status(404).json({ success: false, message: "Bank account not found." });
    }

    res.json({ success: true, message: "Bank account deleted successfully." });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error deleting account." });
  }
});

// ✅ API: Initiate Payment
// ✅ MongoDB Transaction Schema

// ✅ Function to Generate Checksum
const generateChecksum = (data) => {
  return crypto.createHash("sha256").update(data + MERCHANT_KEY).digest("hex") + "###" + SALT_INDEX;
};

// ✅ API: Initiate Payment
app.post("/payment/initiate", async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount) {
      return res.status(400).json({ success: false, message: "Amount is required." });
    }

    const transactionId = `TXN${Date.now()}`;
    const payload = {
      merchantId: MERCHANT_ID,
      merchantTransactionId: transactionId,
      amount: amount * 100,
      redirectUrl: CALLBACK_URL,
      callbackUrl: CALLBACK_URL,
      paymentInstrument: { type: "PAY_PAGE" },
    };

    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64");
    const checksum = generateChecksum(payloadBase64 + "/pg/v1/pay");

    const newTransaction = new Transaction({
      merchantTransactionId: transactionId,
      amount,
      status: "Pending",
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
});

// ✅ Check Payment Status and Update Balance
app.post("/payment/status", async (req, res) => {
  try {
    const { transactionId } = req.body;
    if (!transactionId) return res.status(400).json({ success: false, message: "Transaction ID is required." });

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
    if (!transaction) return res.status(404).json({ success: false, message: "Transaction not found." });

    let balance = await Balance.findOne();
    if (!balance) {
      balance = new Balance({ balance: 0 });
      await balance.save();
    }

    const paymentStatus = response.data.code;

    if (paymentStatus === "PAYMENT_SUCCESS") {
      if (transaction.status === "Success") return res.json({ success: true, message: "Payment already processed." });

      balance.balance += transaction.amount;
      await balance.save();

      transaction.status = "Success";
      await transaction.save();

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
    res.status(500).json({ success: false, message: "Error checking payment status." });
  }
});

// ✅ Start Server
const serverPort = PORT || 5000;
server.listen(serverPort, () => console.log(`🚀 Server running on port ${serverPort}`));
