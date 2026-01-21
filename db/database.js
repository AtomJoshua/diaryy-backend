const Database = require("better-sqlite3");
const db = new Database("db/diary.db");

// users table
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    createdAt TEXT NOT NULL
  )
`).run();

// entries table
db.prepare(`
  CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    audioUrl TEXT,
    duration INTEGER,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`).run();

module.exports = db;
