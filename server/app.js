require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");

const { ensureSchema } = require("./db");
const authRoutes = require("./routes/auth");
const employeeRoutes = require("./routes/employees");
const attendanceRoutes = require("./routes/attendance");

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" })); // face descriptors + coordinates are small JSON, no photo uploads

// Make sure the database tables exist before handling API requests if DB is configured.
app.use("/api", async (req, res, next) => {
  if (req.path === "/health") return next();
  try {
    const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    if (connectionString) {
      await ensureSchema();
    }
    next();
  } catch (err) {
    console.error("Database connection/schema error:", err);
    res.status(500).json({
      error: "Could not connect to the database. Check that POSTGRES_URL/DATABASE_URL is set correctly.",
    });
  }
});

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------
app.use("/api/auth", authRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/attendance", attendanceRoutes);

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Only used for local development (`npm start`). On Vercel, static files in
// /public are served directly by the platform, not through this app.
if (process.env.SERVE_STATIC === "true") {
  app.use(express.static(path.join(__dirname, "..", "public")));
  app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "index.html"));
  });
}

app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

module.exports = app;
