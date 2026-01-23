const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const router = express.Router();
const db = require("../db/database"); // This is now the Postgres pool
const authMiddleware = require("../middleware/auth");
const { JWT_SECRET } = require("../config/jwt");

// Register
router.post("/register", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      message: "Email and password are required",
    });
  }

  try {
    // Check if user exists
    // PG CHANGE: Use query() instead of prepare().get()
    // PG CHANGE: Use $1 instead of ?
    const userCheck = await db.query("SELECT id FROM users WHERE email = $1", [
      email,
    ]);

    if (userCheck.rows.length > 0) {
      return res.status(409).json({
        message: "User already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // PG CHANGE: Use query() instead of prepare().run()
    // PG CHANGE: Use $1, $2, $3 syntax
    await db.query(
      `INSERT INTO users (email, password, createdAt)
       VALUES ($1, $2, $3)`,
      [email, hashedPassword, new Date().toISOString()],
    );

    res.status(201).json({
      message: "User registered successfully",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Internal server error",
    });
  }
});

// Login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      message: "Email and password are required",
    });
  }

  try {
    // PG CHANGE: Use query() instead of prepare().get()
    const result = await db.query(
      "SELECT id, email, password FROM users WHERE email = $1",
      [email],
    );

    // Postgres returns an array in .rows
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: "1h",
    });

    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Internal server error",
    });
  }
});

// Me jwt test
router.get("/me", authMiddleware, (req, res) => {
  res.json({
    user: req.user,
  });
});

// Logout
router.post("/logout", (req, res) => {
  return res.json({ message: "Logged out successfully!" });
});

module.exports = router;
