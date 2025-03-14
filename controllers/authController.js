const bcrypt = require("bcryptjs");

const User = require("../models/User");
const twilio = require("twilio");

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// ✅ Send OTP
exports.sendOTP = async (req, res) => {
    const { phoneNumber } = req.body;
  
    if (!phoneNumber) {
      console.log("❌ Missing phone number");
      return res.status(400).json({ success: false, message: "Phone number is required" });
    }
  
    try {
      console.log(`📡 Sending OTP request for: ${phoneNumber}`);
  
      const otpResponse = await client.verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID)
        .verifications.create({ to: phoneNumber, channel: "sms" });
  
      console.log("✅ OTP Sent Successfully:", otpResponse);
      res.json({ success: true, message: "OTP sent successfully", sid: otpResponse.sid });
    } catch (error) {
      console.error("❌ Twilio API Error:", error);
      res.status(500).json({ success: false, message: "Error sending OTP", error: error.message });
    }
  };
  
// ✅ Verify OTP
exports.verifyOTP = async (req, res) => {
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
};
