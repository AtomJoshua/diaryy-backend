const express = require("express");
const cors = require("cors");
const path = require("path");
const authRoutes = require("./routes/auth");
const entryRoutes = require("./routes/entries");

const app = express();
const PORT = process.env.PORT || 4000;

// --- 1. PARSERS (MUST BE FIRST) ---
// This ensures the body is parsed before ANY request hits ANY route
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 2. ALLOWED ORIGINS ---
const allowedOrigins = [
  "http://localhost:5173",
  "https://diaryy.vercel.app",
  "https://diaryy-backend.onrender.com", // Allow the backend to talk to itself for testing
];

// --- 3. CORS (STRICT SETUP) ---
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Optional: Log blocked origins to help debugging
      console.log("Blocked by CORS:", origin);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// --- 4. DEBUGGING LOG ---
// This will print every request to your Render logs
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log("Body Content:", req.body); // <--- WATCH THIS IN RENDER LOGS
  next();
});

// --- 5. TEST ROUTE (The Truth Teller) ---
// We will use this to verify the fix immediately
app.post("/api/ping", (req, res) => {
  res.json({
    message: "Pong!",
    receivedData: req.body,
  });
});

// --- 6. ROUTES ---
app.use("/api/auth", authRoutes);
app.use("/api/entries", entryRoutes);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/", (req, res) => {
  res.send("Diary backend works");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
