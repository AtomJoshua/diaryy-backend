const express = require("express");
const authMiddleware = require("../middleware/auth");
const db = require("../db/database"); // This is now the Postgres pool
const { voiceUpload } = require("../middleware/voiceUpload");
const multer = require("multer");
const fs = require("fs");
const cloudinary = require("../config/cloudinary");

const router = express.Router();

// Create text entry
router.post("/", authMiddleware, async (req, res) => {
  const { content } = req.body;
  const type = "text";

  if (!content) {
    return res.status(400).json({ message: "Content is required" });
  }

  try {
    // PG CHANGE: One step insert + return
    const result = await db.query(
      `INSERT INTO entries (user_id, type, content, createdAt)
       VALUES ($1, $2, $3, NOW())
       RETURNING *`,
      [req.user.id, type, content],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Create voice entry (Cloudinary)
router.post(
  "/voice",
  authMiddleware,
  voiceUpload.single("audio"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "Audio file is required" });
    }

    const { duration } = req.body;
    let parsedDuration = null;

    if (duration !== undefined) {
      const d = Number(duration);
      if (Number.isNaN(d) || d <= 0) {
        return res.status(400).json({ message: "Invalid duration" });
      }
      parsedDuration = Math.floor(d);
    }

    try {
      // 🔹 Upload to Cloudinary
      const uploadResult = await cloudinary.uploader.upload(req.file.path, {
        resource_type: "video",
        folder: "diary/voices",
      });

      // 🔹 Remove local temp file
      fs.unlink(req.file.path, () => {});

      // 🔹 Save to Postgres
      // PG CHANGE: Insert Cloudinary URL and return the new row immediately
      const result = await db.query(
        `INSERT INTO entries (user_id, type, content, duration, createdAt)
         VALUES ($1, 'voice', $2, $3, NOW())
         RETURNING *`,
        [req.user.id, uploadResult.secure_url, parsedDuration],
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  },
);

// Read entries (unified feed)
router.get("/", authMiddleware, async (req, res) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const offset = (page - 1) * limit;

  try {
    // PG CHANGE: Use $1, $2, $3 and .rows
    const result = await db.query(
      `SELECT id, type, content, duration, createdAt
       FROM entries
       WHERE user_id = $1
       ORDER BY createdAt DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset],
    );

    res.json({ page, limit, entries: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Update text entry
router.put("/:id", authMiddleware, async (req, res) => {
  const { content } = req.body;
  const entryId = req.params.id;

  if (!content) {
    return res.status(400).json({ message: "Content is required" });
  }

  try {
    // PG CHANGE: Update and Return in one shot
    const result = await db.query(
      `UPDATE entries
       SET content = $1
       WHERE id = $2 AND user_id = $3 AND type = 'text'
       RETURNING *`,
      [content, entryId, req.user.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Entry not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Delete entry
router.delete("/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    // PG CHANGE: Delete and check rowCount
    const result = await db.query(
      `DELETE FROM entries
       WHERE id = $1 AND user_id = $2`,
      [id, req.user.id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Entry not found" });
    }

    res.json({ message: "Entry deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Multer error handler
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: err.message });
  }

  if (err) {
    return res.status(400).json({ message: err.message });
  }

  next();
});

module.exports = router;
