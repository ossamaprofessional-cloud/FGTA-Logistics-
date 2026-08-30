const db = require("../db");

const THRESHOLD = parseFloat(process.env.FACE_MATCH_THRESHOLD || "0.5");

function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Compares a live face descriptor (128 floats from face-api.js) against
 * every registered, active employee and returns the closest match if it's
 * within FACE_MATCH_THRESHOLD. Returns null if nobody matches closely
 * enough — the caller should treat that as "face not recognized".
 */
async function findMatchingEmployee(liveDescriptor) {
  const { rows } = await db.query(
    "SELECT employee_id, full_name, custom_id, face_descriptor FROM employees WHERE active_status = true"
  );

  let best = null;

  for (const emp of rows) {
    const stored = JSON.parse(emp.face_descriptor);
    const distance = euclideanDistance(liveDescriptor, stored);
    if (!best || distance < best.distance) {
      best = { employee: emp, distance };
    }
  }

  if (best && best.distance <= THRESHOLD) {
    return {
      employeeId: best.employee.employee_id,
      fullName: best.employee.full_name,
      customId: best.employee.custom_id,
      distance: best.distance,
    };
  }

  return null;
}

module.exports = { findMatchingEmployee, euclideanDistance, THRESHOLD };
