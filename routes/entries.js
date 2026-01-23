const express = require("express");
const authMiddleware = require("../middleware/auth");
const db = require("../db/database");
const { voiceUpload } = require("../middleware/voiceUpload");
const multer = require("multer");
const fs = require("fs");
const cloudinary = require("../config/cloudinary");

const router = express.Router();

// Configure Multer for general media upload (images & videos)
const mediaUpload = multer({ dest: "uploads/" });

// --- NEW ENDPOINT: Upload Media File ---
router.post(
  "/upload-media",
  authMiddleware,
  mediaUpload.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    try {
      // Upload to Cloudinary, letting it auto-detect the type (image/video)
      const uploadResult = await cloudinary.uploader.upload(req.file.path, {
        resource_type: "auto",
        folder: "diary/media",
      });

      // Remove local temp file
      fs.unlink(req.file.path, () => {});

      // Return the secure URL to the frontend
      res.json({
        url: uploadResult.secure_url,
        type: uploadResult.resource_type,
      });
    } catch (err) {
      console.error("Media upload error:", err);
      // Try to clean up temp file even on error
      if (req.file) fs.unlink(req.file.path, () => {});
      res.status(500).json({ message: "Failed to upload media" });
    }
  },
);

// --- UPDATED: Create text/media entry ---
router.post("/", authMiddleware, async (req, res) => {
  // Now accepts title and media_urls array
  const { title, content, media_urls } = req.body;
  const type = "text";

  // Content is optional now if they just want to post media/title
  // But let's require at least one of title, content, or media.
  if (!title && !content && (!media_urls || media_urls.length === 0)) {
    return res.status(400).json({ message: "Entry must have some content" });
  }

  // Ensure media_urls is a proper JSON array string for Postgres
  const mediaJson = media_urls ? JSON.stringify(media_urls) : "[]";

  try {
    const result = await db.query(
      `INSERT INTO entries (user_id, type, title, content, media_urls, createdAt)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [req.user.id, type, title || null, content || null, mediaJson],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// --- UPDATED: Create voice entry ---
router.post(
  "/voice",
  authMiddleware,
  voiceUpload.single("audio"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "Audio file is required" });
    }

    // Now accepts a title
    const { duration, title } = req.body;
    let parsedDuration = null;

    if (duration !== undefined) {
      const d = Number(duration);
      if (Number.isNaN(d) || d <= 0) {
        return res.status(400).json({ message: "Invalid duration" });
      }
      parsedDuration = Math.floor(d);
    }

    try {
      const uploadResult = await cloudinary.uploader.upload(req.file.path, {
        resource_type: "video",
        folder: "diary/voices",
      });

      fs.unlink(req.file.path, () => {});

      const result = await db.query(
        `INSERT INTO entries (user_id, type, title, content, duration, createdAt)
         VALUES ($1, 'voice', $2, $3, $4, NOW())
         RETURNING *`,
        [req.user.id, title || null, uploadResult.secure_url, parsedDuration],
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  },
);

// Read entries (unified feed) - No changes needed here
router.get("/", authMiddleware, async (req, res) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const offset = (page - 1) * limit;

  try {
    // Select all new columns
    const result = await db.query(
      `SELECT id, type, title, content, media_urls, duration, createdAt
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

// --- UPDATED: Update entry ---
router.put("/:id", authMiddleware, async (req, res) => {
  // Now allows updating title and content
  const { title, content } = req.body;
  const entryId = req.params.id;

  if (!title && !content) {
    return res.status(400).json({ message: "Nothing to update" });
  }

  try {
    // Dynamically build the update query
    let query = "UPDATE entries SET ";
    const params = [];
    let paramCount = 1;

    if (title !== undefined) {
      query += `title = $${paramCount}, `;
      params.push(title);
      paramCount++;
    }
    if (content !== undefined) {
      query += `content = $${paramCount}, `;
      params.push(content);
      paramCount++;
    }

    // Remove trailing comma and space
    query = query.slice(0, -2);

    query += ` WHERE id = $${paramCount} AND user_id = $${paramCount + 1} RETURNING *`;
    params.push(entryId, req.user.id);

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Entry not found or not authorized" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Delete entry - No changes needed here
router.delete("/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
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
