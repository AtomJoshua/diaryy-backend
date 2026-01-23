const express = require("express");
const cors = require("cors");
const path = require("path");
const authRoutes = require("./routes/auth");
const entryRoutes = require("./routes/entries");

const app = express();
const PORT = process.env.PORT || 4000;

// --- 1. PARSERS (MUST BE FIRST) ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 2. DYNAMIC ALLOWED ORIGINS ---
// This logic handles both your local dev AND the comma-separated list from Render
const getAllowedOrigins = () => {
  // If we are in production and have the env var set
  if (process.env.CLIENT_URL) {
    // Split the string by comma to support multiple URLs
    return process.env.CLIENT_URL.split(",").map((url) => url.trim());
  }

  // Fallback for local development if no env var is set
  return ["http://localhost:5173", "http://localhost:3000"];
};

const allowedOrigins = getAllowedOrigins();
console.log("✅ Allowed CORS Origins:", allowedOrigins); // Debugging log

// --- 3. CORS (STRICT SETUP) ---
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, Postman)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        console.log("⛔ Blocked by CORS:", origin);
        return callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// --- 4. DEBUGGING LOG ---
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  // Only log body if it exists and isn't huge (good for privacy/perf)
  if (req.body && Object.keys(req.body).length > 0) {
    console.log("📦 Body Content:", JSON.stringify(req.body, null, 2));
  }
  next();
});

// --- 5. ROUTES ---
app.use("/api/auth", authRoutes);
app.use("/api/entries", entryRoutes);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Test Route
app.post("/api/ping", (req, res) => {
  res.json({ message: "Pong!", receivedData: req.body });
});

app.get("/", (req, res) => {
  res.send("Sanctuary API is secure and running.");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
