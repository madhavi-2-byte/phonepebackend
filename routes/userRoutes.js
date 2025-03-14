const express = require("express");
const { createPassword, login } = require("../controllers/userController");

const router = express.Router();

router.post("/create-password", createPassword);
router.post("/login", login);

module.exports = router;
