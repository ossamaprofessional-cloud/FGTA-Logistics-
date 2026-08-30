const express = require("express");
const db = require("../db");
const { requireAdmin } = require("../middleware/auth");
const { findMatchingEmployee } = require("../services/faceMatch");

const router = express.Router();

// ---------------------------------------------------------------------------
// PUBLIC — one-time employee registration
// ---------------------------------------------------------------------------

router.post("/register", async (req, res) => {
  try {
    const { fullName, customId, faceDescriptor } = req.body;

    if (!fullName || !fullName.trim()) {
      return res.status(400).json({ error: "Please enter a name." });
    }
    if (!Array.isArray(faceDescriptor) || faceDescriptor.length < 64) {
      return res.status(400).json({ error: "Face capture failed. Please retake the photo." });
    }

    // Prevent accidentally registering the same face twice under a new name.
    const existingMatch = await findMatchingEmployee(faceDescriptor);
    if (existingMatch) {
      return res.status(409).json({
        error: `This face already appears to be registered as "${existingMatch.fullName}". If this is a mistake, ask an administrator to reset the profile.`,
      });
    }

    const { rows } = await db.query(
      `INSERT INTO employees (full_name, custom_id, face_descriptor)
       VALUES ($1, $2, $3) RETURNING employee_id`,
      [fullName.trim(), (customId || "").trim() || null, JSON.stringify(faceDescriptor)]
    );

    res.json({
      success: true,
      employeeId: rows[0].employee_id,
      message: "Registration Complete. You do not need to register again.",
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Something went wrong saving your registration. Please try again." });
  }
});

// ---------------------------------------------------------------------------
// ADMIN — manage employees
// ---------------------------------------------------------------------------

router.get("/", requireAdmin, async (req, res) => {
  try {
    const { search } = req.query;
    let result;
    if (search) {
      result = await db.query(
        `SELECT employee_id, full_name, custom_id, registration_date, active_status
         FROM employees
         WHERE full_name ILIKE $1 OR custom_id ILIKE $1
         ORDER BY full_name`,
        [`%${search}%`]
      );
    } else {
      result = await db.query(
        `SELECT employee_id, full_name, custom_id, registration_date, active_status
         FROM employees ORDER BY full_name`
      );
    }
    res.json(result.rows);
  } catch (err) {
    console.error("List employees error:", err);
    res.status(500).json({ error: "Could not load employees." });
  }
});

// Reset (deactivate) an employee's face profile so they can re-register.
router.post("/:id/reset-face", requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM employees WHERE employee_id = $1", [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "Employee not found." });

    await db.query("UPDATE employees SET active_status = false WHERE employee_id = $1", [req.params.id]);
    res.json({ success: true, message: `${rows[0].full_name}'s face profile has been reset. They can register again.` });
  } catch (err) {
    console.error("Reset face error:", err);
    res.status(500).json({ error: "Could not reset face profile." });
  }
});

// Reactivate a deactivated employee
router.post("/:id/reactivate", requireAdmin, async (req, res) => {
  try {
    await db.query("UPDATE employees SET active_status = true WHERE employee_id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Reactivate error:", err);
    res.status(500).json({ error: "Could not reactivate employee." });
  }
});

module.exports = router;
