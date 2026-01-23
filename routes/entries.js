const express = require("express");
const authMiddleware = require("../middleware/auth");
const db = require("../db/database");
const { voiceUpload } = require("../middleware/voiceUpload");
const multer = require("multer");
const fs = require("fs");
const cloudinary = require("../config/cloudinary");

const router = express.Router();
const mediaUpload = multer({ dest: "uploads/" });

// 1. Upload Media (Images/Video)
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
      console.error("Media Upload Error:", err);
      if (req.file) fs.unlink(req.file.path, () => {});
      res.status(500).json({ message: "Upload failed" });
    }
  },
);

// 2. Create Text Entry
router.post("/", authMiddleware, async (req, res) => {
  const { title, content, media_urls } = req.body;
  const type = "text";
  const mediaJson = JSON.stringify(media_urls || []);

  if (!content && (!media_urls || media_urls.length === 0)) {
    return res.status(400).json({ message: "Entry must have content" });
  }

  try {
    const result = await db.query(
      `INSERT INTO entries (user_id, type, title, content, media_urls, createdAt)
       VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
      [req.user.id, type, title || "", content || "", mediaJson],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 3. Create Voice Entry (UPDATED: Now saves media_urls)
router.post(
  "/voice",
  authMiddleware,
  voiceUpload.single("audio"),
  async (req, res) => {
    if (!req.file)
      return res.status(400).json({ message: "Audio file is required" });

    const { title, duration, media_urls } = req.body;
    const mediaJson = media_urls ? media_urls : "[]"; // media_urls comes as string from FormData

    let parsedDuration = 0;
    if (duration) parsedDuration = Math.floor(Number(duration));

    try {
      const uploadResult = await cloudinary.uploader.upload(req.file.path, {
        resource_type: "video",
        folder: "diary/voices",
      });
      fs.unlink(req.file.path, () => {});

      // FIX: Added media_urls to the insert
      const result = await db.query(
        `INSERT INTO entries (user_id, type, title, content, media_urls, duration, createdAt)
       VALUES ($1, 'voice', $2, $3, $4, $5, NOW()) RETURNING *`,
        [
          req.user.id,
          title || "Voice Note",
          uploadResult.secure_url,
          mediaJson,
          parsedDuration,
        ],
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  },
);

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

// 5. NEW: Get Single Entry (For View Page)
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
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 6. Update Entry (UPDATED: Allows title/media edits)
router.put("/:id", authMiddleware, async (req, res) => {
  const { title, content, media_urls } = req.body;
  const entryId = req.params.id;

  try {
    // Dynamic update query
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

// 7. Delete Entry
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
    console.error(err);
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
