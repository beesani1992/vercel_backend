import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

// Log during startup to see what Vercel is actually passing
console.log('Connecting to DB Host:', process.env.DATABASE_URL ? process.env.DATABASE_URL.split('@')[1] : 'DATABASE_URL IS UNDEFINED');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default pool;
