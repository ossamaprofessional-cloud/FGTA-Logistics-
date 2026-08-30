const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");

const router = express.Router();

router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  try {
    const { rows } = await db.query(
      "SELECT * FROM admin_users WHERE username = $1 AND active_status = true",
      [username.trim().toLowerCase()]
    );
    const admin = rows[0];

    if (!admin) {
      // Same generic message whether the username or password was wrong.
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const ok = bcrypt.compareSync(password, admin.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const token = jwt.sign(
      { adminId: admin.admin_id, username: admin.username, name: admin.name, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.json({
      token,
      admin: { name: admin.name, username: admin.username, role: admin.role },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Something went wrong logging in. Please try again." });
  }
});

module.exports = router;
