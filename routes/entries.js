const express = require("express");
const authMiddleware = require("../middleware/auth");
const db = require("../db/database");
const { voiceUpload } = require("../middleware/voiceUpload");
const multer = require("multer");
const fs = require("fs");

const router = express.Router();


// Create text entry

router.post("/", authMiddleware, (req, res) => {
  const { content } = req.body;
  const type = "text";

  if (!content) {
    return res.status(400).json({ message: "Content is required" });
  }

  try {
    const result = db.prepare(`
      INSERT INTO entries (user_id, type, content, createdAt)
      VALUES (?, ?, ?, ?)
    `).run(
      req.user.id,
      type,
      content,
      new Date().toISOString()
    );

    const entry = db.prepare(`
      SELECT id, type, content, createdAt
      FROM entries
      WHERE id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(entry);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});


// Create voice entry

router.post(
  "/voice",
  authMiddleware,
  voiceUpload.single("audio"),
  (req, res) => {
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

    const audioUrl = `/uploads/voices/${req.file.filename}`;

    try {
      const result = db.prepare(`
        INSERT INTO entries (
          user_id,
          type,
          audioUrl,
          duration,
          createdAt
        )
        VALUES (?, 'voice', ?, ?, ?)
      `).run(
        req.user.id,
        audioUrl,
        parsedDuration,
        new Date().toISOString()
      );

      const entry = db.prepare(`
        SELECT id, type, audioUrl, duration, createdAt
        FROM entries
        WHERE id = ?
      `).get(result.lastInsertRowid);

      res.status(201).json(entry);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);


// read entries (unified feed + pagination)
router.get("/", authMiddleware, (req, res) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const offset = (page - 1) * limit;

  try {
    const entries = db.prepare(`
      SELECT id, type, content, duration, createdAt
      FROM entries
      WHERE user_id = ?
      ORDER BY createdAt DESC
      LIMIT ? OFFSET ?
    `).all(req.user.id, limit, offset);

    const normalized = entries.map(entry => {
      if (entry.type === "voice") {
        return {
          id: entry.id,
          type: entry.type,
          audioUrl: `/${entry.content}`,
          duration: entry.duration,
          createdAt: entry.createdAt
        };
      }

      return entry;
    });

    res.json({
      page,
      limit,
      entries: normalized
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Update text entry

router.put("/:id", authMiddleware, (req, res) => {
  const { content } = req.body;
  const entryId = req.params.id;

  if (!content) {
    return res.status(400).json({ message: "Content is required" });
  }

  try {
    const entry = db.prepare(`
      SELECT id
      FROM entries
      WHERE id = ? AND user_id = ? AND type = 'text'
    `).get(entryId, req.user.id);

    if (!entry) {
      return res.status(404).json({ message: "Entry not found" });
    }

    db.prepare(`
      UPDATE entries
      SET content = ?
      WHERE id = ? AND user_id = ?
    `).run(content, entryId, req.user.id);

    const updatedEntry = db.prepare(`
      SELECT id, type, content, createdAt
      FROM entries
      WHERE id = ?
    `).get(entryId);

    res.json(updatedEntry);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});


// Delete entry
router.delete("/:id", authMiddleware, (req, res) => {
  const { id } = req.params;

  try {
    // 1. Fetch the entry first
    const entry = db.prepare(`
      SELECT id, type, content
      FROM entries
      WHERE id = ? AND user_id = ?
    `).get(id, req.user.id);

    if (!entry) {
      return res.status(404).json({ message: "Entry not found" });
    }

    // 2. If it's a voice entry, delete the audio file
    if (entry.type === "voice" && entry.content) {
      fs.unlink(entry.content, (err) => {
        if (err) {
          // log but don't fail the request
          console.error("Failed to delete audio file:", err.message);
        }
      });
    }

    // 3. Delete the database row
    db.prepare(`
      DELETE FROM entries
      WHERE id = ? AND user_id = ?
    `).run(id, req.user.id);

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
