const multer = require("multer");
const path = require("path");
const fs = require("fs");
const os = require("os");

// TEMP directory (Render-safe)
const uploadDir = path.join(os.tmpdir(), "voices");
fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED_MIME_TYPES = [
  "audio/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/ogg",
];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, filename);
  },
});

const voiceUpload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error("Invalid audio file type"));
    }
    cb(null, true);
  },
});

module.exports = {
  voiceUpload,
  uploadDir,
  ALLOWED_MIME_TYPES,
};
