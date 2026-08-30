/**
 * Run this once to create your first admin login:
 *   npm run create-admin -- "Full Name" "username" "password" "owner"
 *
 * Role is optional (defaults to "admin") — use owner | manager | hr | supervisor | admin.
 *
 * This connects using POSTGRES_URL/DATABASE_URL from your .env file, so it
 * works whether that points at a local Postgres or your live cloud database
 * (e.g. run `npx vercel env pull .env` first to grab your live database's
 * connection string, then run this script to create an admin in the cloud).
 */
require("dotenv").config();
const bcrypt = require("bcryptjs");
const db = require("../db");

async function main() {
  const [, , name, username, password, role] = process.argv;

  if (!name || !username || !password) {
    console.log('Usage: npm run create-admin -- "Full Name" "username" "password" "role(optional)"');
    process.exit(1);
  }

  await db.ensureSchema();

  const existing = await db.query("SELECT * FROM admin_users WHERE username = $1", [username.toLowerCase()]);
  if (existing.rows[0]) {
    console.log(`An admin with username "${username}" already exists.`);
    process.exit(1);
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  await db.query(
    `INSERT INTO admin_users (name, username, password_hash, role) VALUES ($1, $2, $3, $4)`,
    [name, username.toLowerCase(), passwordHash, role || "admin"]
  );

  console.log(`✅ Admin user "${username}" created. You can now log in at /admin/login.html`);
  await db.pool.end();
}

main().catch((err) => {
  console.error("Failed to create admin:", err.message);
  process.exit(1);
});
