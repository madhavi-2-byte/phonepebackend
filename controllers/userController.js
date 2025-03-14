const bcrypt = require("bcrypt");
const User = require("../models/User");

// Register User
exports.createPassword = async (req, res) => {
  try {
    const { phone, password, confirmPassword } = req.body;

    if (!phone || !password || !confirmPassword) {
      return res.status(400).json({ success: false, message: "All fields are required." });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: "Passwords do not match." });
    }

    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "User already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ phone, password: hashedPassword });
    await newUser.save();

    res.json({ success: true, message: "Password created successfully!" });

  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Login User
exports.login = async (req, res) => {
  try {
    const { phone, password } = req.body;
    const user = await User.findOne({ phone });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }

    res.json({ success: true, message: "Login successful!" });

  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};
