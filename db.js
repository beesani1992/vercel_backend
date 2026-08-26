// backend/db.js
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'app_data.db');
const db = new Database(dbPath);

// Create table with credits column
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    credits INTEGER DEFAULT 100,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Migration safeguard: add credits column if table already exists
try {
  db.exec(`ALTER TABLE users ADD COLUMN credits INTEGER DEFAULT 70`);
} catch (err) {
  // Column already exists, ignore
}

export default db;