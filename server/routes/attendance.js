const express = require("express");
const db = require("../db");
const { requireAdmin } = require("../middleware/auth");
const { findMatchingEmployee } = require("../services/faceMatch");
const { reverseGeocode } = require("../services/geocode");
const { appendAttendanceRow } = require("../services/sheets");

const router = express.Router();

const TIMEZONE = process.env.TIMEZONE || "Asia/Karachi";

// Server decides "today's date" and "now" — never trust the client's clock,
// since that would make duplicate-prevention and reporting easy to spoof.
function serverDateAndTime() {
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(now); // YYYY-MM-DD
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(now);
  return { date, time };
}

// ---------------------------------------------------------------------------
// PUBLIC — identify an employee from a live face descriptor, without yet
// recording attendance. Lets the employee be greeted by name before
// entering the truck number, and reports up front if today's attendance
// is already marked.
// ---------------------------------------------------------------------------

router.post("/identify", async (req, res) => {
  try {
    const { faceDescriptor } = req.body;

    if (!Array.isArray(faceDescriptor) || faceDescriptor.length < 64) {
      return res.status(400).json({ error: "Face not recognized. Please try again or contact your supervisor." });
    }

    const match = await findMatchingEmployee(faceDescriptor);
    if (!match) {
      return res.status(404).json({ error: "Face not recognized. Please try again or contact your supervisor." });
    }

    const { date } = serverDateAndTime();
    const { rows } = await db.query(
      "SELECT attendance_id FROM attendance WHERE employee_id = $1 AND date = $2",
      [match.employeeId, date]
    );

    res.json({
      employeeName: match.fullName,
      alreadyMarkedToday: rows.length > 0,
    });
  } catch (err) {
    console.error("Identify error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// ---------------------------------------------------------------------------
// PUBLIC — mark daily attendance
// ---------------------------------------------------------------------------

router.post("/mark", async (req, res) => {
  try {
    const { faceDescriptor, truckNumber, latitude, longitude } = req.body;

    if (!Array.isArray(faceDescriptor) || faceDescriptor.length < 64) {
      return res.status(400).json({ error: "Face not recognized. Please try again or contact your supervisor." });
    }
    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return res.status(400).json({ error: "Location is required. Please allow Location to continue." });
    }
    if (!truckNumber || !truckNumber.trim()) {
      return res.status(400).json({ error: "Please enter the truck number." });
    }

    const match = await findMatchingEmployee(faceDescriptor);
    if (!match) {
      return res.status(404).json({ error: "Face not recognized. Please try again or contact your supervisor." });
    }

    const { date, time } = serverDateAndTime();

    const already = await db.query(
      "SELECT attendance_id FROM attendance WHERE employee_id = $1 AND date = $2",
      [match.employeeId, date]
    );
    if (already.rows.length > 0) {
      return res.status(409).json({ error: "Your attendance has already been marked today." });
    }

    const geo = await reverseGeocode(latitude, longitude);
    const truck = truckNumber.trim().toUpperCase();

    let insertResult;
    try {
      insertResult = await db.query(
        `INSERT INTO attendance
          (employee_id, truck_number, date, time, latitude, longitude, city, status, match_distance)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'Present', $8)
         RETURNING attendance_id`,
        [match.employeeId, truck, date, time, latitude, longitude, geo.city, match.distance]
      );
    } catch (err) {
      if (err.code === "23505") {
        // Unique constraint violation (employee_id, date) — a race condition
        // double-submit, not a real error.
        return res.status(409).json({ error: "Your attendance has already been marked today." });
      }
      throw err;
    }

    // Never blocks or fails the attendance itself if Sheets sync has trouble.
    appendAttendanceRow({
      employeeName: match.fullName,
      employeeCustomId: match.customId,
      truckNumber: truck,
      date,
      time,
      city: geo.city,
      latitude,
      longitude,
      status: "Present",
    });

    res.json({
      success: true,
      message: "Attendance Marked Successfully",
      attendanceId: insertResult.rows[0].attendance_id,
      employeeName: match.fullName,
      truckNumber: truck,
      date,
      time,
      city: geo.city,
    });
  } catch (err) {
    console.error("Mark attendance error:", err);
    res.status(500).json({ error: "Something went wrong saving your attendance. Please try again." });
  }
});

// ---------------------------------------------------------------------------
// ADMIN — view / filter / correct attendance
// ---------------------------------------------------------------------------

router.get("/", requireAdmin, async (req, res) => {
  try {
    const { employeeId, truck, date, dateFrom, dateTo, city, status, search } = req.query;

    let sql = `
      SELECT a.attendance_id, a.truck_number, a.date, a.time, a.latitude, a.longitude,
             a.city, a.status, a.match_distance, e.employee_id, e.full_name, e.custom_id
      FROM attendance a
      JOIN employees e ON e.employee_id = a.employee_id
      WHERE 1=1
    `;
    const params = [];
    let i = 1;

    if (employeeId) { sql += ` AND a.employee_id = $${i++}`; params.push(employeeId); }
    if (truck) { sql += ` AND a.truck_number ILIKE $${i++}`; params.push(`%${truck}%`); }
    if (date) { sql += ` AND a.date = $${i++}`; params.push(date); }
    if (dateFrom) { sql += ` AND a.date >= $${i++}`; params.push(dateFrom); }
    if (dateTo) { sql += ` AND a.date <= $${i++}`; params.push(dateTo); }
    if (city) { sql += ` AND a.city ILIKE $${i++}`; params.push(`%${city}%`); }
    if (status) { sql += ` AND a.status = $${i++}`; params.push(status); }
    if (search) {
      sql += ` AND (e.full_name ILIKE $${i} OR e.custom_id ILIKE $${i})`;
      params.push(`%${search}%`);
      i++;
    }

    sql += " ORDER BY a.date DESC, a.time DESC";

    const { rows } = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("History error:", err);
    res.status(500).json({ error: "Could not load attendance history." });
  }
});

// Today's attendance, quick view for the dashboard home screen.
router.get("/today", requireAdmin, async (req, res) => {
  try {
    const { date } = serverDateAndTime();
    const { rows } = await db.query(
      `SELECT a.attendance_id, a.truck_number, a.time, a.city, a.status, e.full_name, e.custom_id
       FROM attendance a JOIN employees e ON e.employee_id = a.employee_id
       WHERE a.date = $1 ORDER BY a.time DESC`,
      [date]
    );
    res.json({ date, rows });
  } catch (err) {
    console.error("Today error:", err);
    res.status(500).json({ error: "Could not load today's attendance." });
  }
});

// Monthly Present/Absent grid: employees as rows, each day of the given
// month as a column. "Absent" is inferred — no record for that day.
router.get("/monthly-summary", requireAdmin, async (req, res) => {
  try {
    const { year, month } = req.query; // month = 1-12
    if (!year || !month) return res.status(400).json({ error: "year and month query params are required." });

    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    const daysInMonth = new Date(y, m, 0).getDate();
    const monthPrefix = `${y}-${String(m).padStart(2, "0")}`;

    const employeesResult = await db.query(
      "SELECT employee_id, full_name, custom_id FROM employees WHERE active_status = true ORDER BY full_name"
    );
    const recordsResult = await db.query("SELECT employee_id, date FROM attendance WHERE date LIKE $1", [`${monthPrefix}-%`]);

    const presentSet = new Set(recordsResult.rows.map((r) => `${r.employee_id}_${r.date}`));
    const days = Array.from({ length: daysInMonth }, (_, i) => `${monthPrefix}-${String(i + 1).padStart(2, "0")}`);

    const grid = employeesResult.rows.map((emp) => ({
      employeeId: emp.employee_id,
      fullName: emp.full_name,
      customId: emp.custom_id,
      days: days.map((d) => (presentSet.has(`${emp.employee_id}_${d}`) ? "Present" : "Absent")),
    }));

    res.json({ days, grid });
  } catch (err) {
    console.error("Monthly summary error:", err);
    res.status(500).json({ error: "Could not load monthly summary." });
  }
});

// Correct/delete an incorrect attendance record.
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM attendance WHERE attendance_id = $1", [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "Record not found." });
    await db.query("DELETE FROM attendance WHERE attendance_id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: "Could not delete record." });
  }
});

// Edit truck number or status on a record (e.g. fix a typo'd truck number).
router.patch("/:id", requireAdmin, async (req, res) => {
  try {
    const { truckNumber, status } = req.body;
    const { rows } = await db.query("SELECT * FROM attendance WHERE attendance_id = $1", [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "Record not found." });

    await db.query(
      "UPDATE attendance SET truck_number = COALESCE($1, truck_number), status = COALESCE($2, status) WHERE attendance_id = $3",
      [truckNumber ? truckNumber.trim().toUpperCase() : null, status || null, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Patch error:", err);
    res.status(500).json({ error: "Could not update record." });
  }
});

// CSV export
router.get("/export/csv", requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT e.full_name AS "Employee Name", e.custom_id AS "Employee ID", a.truck_number AS "Truck Number",
              a.date AS "Date", a.time AS "Time", a.city AS "City", a.latitude AS "Latitude",
              a.longitude AS "Longitude", a.status AS "Status"
       FROM attendance a JOIN employees e ON e.employee_id = a.employee_id
       ORDER BY a.date DESC, a.time DESC`
    );

    const headers = Object.keys(rows[0] || { "Employee Name": "" });
    const csvLines = [headers.join(",")];
    for (const row of rows) {
      csvLines.push(headers.map((h) => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).join(","));
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=attendance-export.csv");
    res.send(csvLines.join("\n"));
  } catch (err) {
    console.error("Export error:", err);
    res.status(500).json({ error: "Could not export attendance." });
  }
});

module.exports = router;
