const { Pool } = require("pg");

// 1. Connect to Supabase
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// 2. Initialize Tables (Run automatically on startup)
const initDb = async () => {
  try {
    // Create Users Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        username TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create Entries Table with NEW columns: title and media_urls
    // We use JSONB for media_urls to store an array of links efficiently.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS entries (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        title TEXT, 
        content TEXT,
        media_urls JSONB DEFAULT '[]',
        duration INTEGER,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("✅ Connected to Supabase (PostgreSQL) & Tables Ready");
  } catch (err) {
    console.error("❌ Database Connection Error:", err);
  }
};

// Run the function above immediately
initDb();

// Export the connection pool so other files can use it
module.exports = pool;
