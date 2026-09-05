import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

// Debug log: Prints host portion without exposing password
if (connectionString) {
  const hostPart = connectionString.split('@')[1] || 'invalid-format';
  console.log('ACTIVE DB HOST:', hostPart);
} else {
  console.log('ACTIVE DB HOST: DATABASE_URL IS UNDEFINED');
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

export default pool;
