const { Pool } = require("pg");

// Vercel's built-in Postgres storage (Storage tab -> Create Database) injects
// POSTGRES_URL automatically. Other providers (Neon, Supabase) usually call
// it DATABASE_URL, so we check both to make setup easier regardless of which
// one you connect.
const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.warn(
    "WARNING: No POSTGRES_URL or DATABASE_URL environment variable set. " +
    "Database calls will fail until you connect a Postgres database in Vercel's Storage tab."
  );
}

const pool = new Pool({
  connectionString,
  // Managed Postgres providers (Neon, Supabase, Vercel Postgres) require SSL.
  // Local Postgres on your own machine typically doesn't use/need it.
  ssl: connectionString && connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
});

function query(text, params) {
  return pool.query(text, params);
}

// ---------------------------------------------------------------------------
// Schema (idempotent — safe to run on every cold start)
// ---------------------------------------------------------------------------

let schemaReady = null;

async function ensureSchema() {
  if (schemaReady) return schemaReady;

  schemaReady = query(`
    CREATE TABLE IF NOT EXISTS employees (
      employee_id       SERIAL PRIMARY KEY,
      full_name         TEXT NOT NULL,
      custom_id         TEXT,
      face_descriptor   TEXT NOT NULL,
      registration_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      active_status     BOOLEAN NOT NULL DEFAULT TRUE
    );

    CREATE TABLE IF NOT EXISTS attendance (
      attendance_id  SERIAL PRIMARY KEY,
      employee_id    INTEGER NOT NULL REFERENCES employees(employee_id),
      truck_number   TEXT NOT NULL,
      date           TEXT NOT NULL,
      time           TEXT NOT NULL,
      latitude       DOUBLE PRECISION NOT NULL,
      longitude      DOUBLE PRECISION NOT NULL,
      city           TEXT,
      status         TEXT NOT NULL DEFAULT 'Present',
      match_distance DOUBLE PRECISION,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(employee_id, date)
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      admin_id      SERIAL PRIMARY KEY,
      name          TEXT NOT NULL,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'admin',
      active_status BOOLEAN NOT NULL DEFAULT TRUE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
    CREATE INDEX IF NOT EXISTS idx_attendance_truck ON attendance(truck_number);
    CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance(employee_id);
  `).then(() => true);

  return schemaReady;
}

module.exports = { query, ensureSchema, pool };
