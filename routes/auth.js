const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const router = express.Router();
const db = require("../db/database");
const authMiddleware = require("../middleware/auth");
const {JWT_SECRET} = require("../config/jwt");

//Register
router.post("/register", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      message: "Email and password are required"
    });
  }

  try {
    // Check if user exists
    const existingUser = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(email);

    if (existingUser) {
      return res.status(409).json({
        message: "User already exists"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    db.prepare(`
      INSERT INTO users (email, password, createdAt)
      VALUES (?, ?, ?)
    `).run(email, hashedPassword, new Date().toISOString() );

    res.status(201).json({
      message: "User registered successfully"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Internal server error"
    });
  }
});

//Login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      message: "Email and password are required"
    });
  }

  try {
    const user = db
      .prepare("SELECT id, email, password FROM users WHERE email = ?")
      .get(email);

    if (!user) {
      return res.status(401).json({
        message: "Invalid credentials"
      });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({
        message: "Invalid credentials"
      });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      "supersecretkey",
      { expiresIn: "1h" }
    );

    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Internal server error"
    });
  }
});

//Me jwt test
router.get("/me", authMiddleware, (req, res) => {
  res.json({
    user: req.user
  });
});

//Logout
router.post("/logout", (req, res) => {
    return res.json({message: "Logged out successfully!" });
});
module.exports = router;
