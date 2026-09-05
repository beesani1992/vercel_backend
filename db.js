import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

// Checks every variable name injected by Vercel / Supabase integration
const connectionString = 
  process.env.POSTGRES_DATABASE_URL || 
  process.env.POSTGRES_URL || 
  process.env.SUPABASE_DATABASE_URL || 
  process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false } // Required for Supabase cloud connections
});

export default pool;
