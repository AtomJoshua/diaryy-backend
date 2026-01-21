const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const entryRoutes = require("./routes/entries");
const path = require("path");


const app = express();
const PORT = process.env.PORT || 4000;
const allowedOrigins = [
    "https://localhost:5173",
    "https://diaryy.vercel.app"
];

app.use(express.json());

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)){
            return callback(null, true);
        }
        return callback(new Error("Not allowed by CORS"));
        }
    }));
app.use("/api/auth", authRoutes);
app.use("/api/entries", entryRoutes);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/", (req, res) => {
	res.send("Diary backend works");
	});
app.listen(PORT, () => {
	console.log(`Server running on http://localhost:${PORT}`);
	});
