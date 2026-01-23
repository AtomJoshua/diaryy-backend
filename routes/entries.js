const express = require("express");
const authMiddleware = require("../middleware/auth");
const db = require("../db/database");
const { voiceUpload } = require("../middleware/voiceUpload"); // Keep using this for audio files
const multer = require("multer");
const fs = require("fs");
const cloudinary = require("../config/cloudinary");

const router = express.Router();
const mediaUpload = multer({ dest: "uploads/" });

// 1. Upload Images/Video
router.post(
  "/upload-media",
  authMiddleware,
  mediaUpload.single("file"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    try {
      const uploadResult = await cloudinary.uploader.upload(req.file.path, {
        resource_type: "auto",
        folder: "diary/media",
      });
      fs.unlink(req.file.path, () => {});
      res.json({
        url: uploadResult.secure_url,
        type: uploadResult.resource_type,
      });
    } catch (err) {
      if (req.file) fs.unlink(req.file.path, () => {});
      res.status(500).json({ message: "Upload failed" });
    }
  },
);

// 2. NEW: Upload Audio Only (Helper Endpoint)
router.post(
  "/upload-audio",
  authMiddleware,
  voiceUpload.single("audio"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No audio file" });
    try {
      const uploadResult = await cloudinary.uploader.upload(req.file.path, {
        resource_type: "video", // Cloudinary treats audio as 'video' type
        folder: "diary/voices",
      });
      fs.unlink(req.file.path, () => {});
      res.json({
        url: uploadResult.secure_url,
        duration: req.body.duration || 0,
      });
    } catch (err) {
      if (req.file) fs.unlink(req.file.path, () => {});
      res.status(500).json({ message: "Audio upload failed" });
    }
  },
);

// 3. Unified Create Entry (Handles EVERYTHING)
router.post("/", authMiddleware, async (req, res) => {
  // Now accepts audio_url separate from content
  const { title, content, media_urls, audio_url, duration } = req.body;

  // Logic: If it has audio, mark as 'voice', otherwise 'text' (just for UI styling)
  const type = audio_url ? "voice" : "text";
  const mediaJson = JSON.stringify(media_urls || []);

  try {
    const result = await db.query(
      `INSERT INTO entries (user_id, type, title, content, media_urls, audio_url, duration, createdAt)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [
        req.user.id,
        type,
        title || "",
        content || "",
        mediaJson,
        audio_url || null,
        duration || 0,
      ],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 4. Get All Entries
router.get("/", authMiddleware, async (req, res) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const offset = (page - 1) * limit;

  try {
    const result = await db.query(
      `SELECT * FROM entries WHERE user_id = $1 ORDER BY createdAt DESC LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset],
    );
    res.json({ page, limit, entries: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 5. Get Single Entry
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM entries WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id],
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: "Not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
});

// 6. Update Entry (Unified)
router.put("/:id", authMiddleware, async (req, res) => {
  const { title, content, media_urls, audio_url } = req.body;
  const entryId = req.params.id;

  try {
    let query = "UPDATE entries SET ";
    const params = [];
    let idx = 1;

    if (title !== undefined) {
      query += `title = $${idx++}, `;
      params.push(title);
    }
    if (content !== undefined) {
      query += `content = $${idx++}, `;
      params.push(content);
    }
    if (media_urls !== undefined) {
      query += `media_urls = $${idx++}, `;
      params.push(JSON.stringify(media_urls));
    }
    if (audio_url !== undefined) {
      query += `audio_url = $${idx++}, `;
      params.push(audio_url);
    } // Allow updating audio

    query = query.slice(0, -2); // Remove trailing comma
    query += ` WHERE id = $${idx++} AND user_id = $${idx++} RETURNING *`;
    params.push(entryId, req.user.id);

    const result = await db.query(query, params);
    if (result.rows.length === 0)
      return res.status(404).json({ message: "Not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 7. Delete
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      "DELETE FROM entries WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id],
    );
    if (result.rowCount === 0)
      return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
});

// Error handling
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError)
    return res.status(400).json({ message: err.message });
  next(err);
});

module.exports = router;
