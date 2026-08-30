const { google } = require("googleapis");

const ENABLED = String(process.env.GOOGLE_SHEETS_ENABLED).toLowerCase() === "true";
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const TAB_NAME = process.env.GOOGLE_SHEET_TAB_NAME || "Attendance";

// On serverless hosts (Vercel) there's no persistent disk to read a key
// file from, so credentials are passed as a single environment variable
// containing the entire service-account JSON as text. See README for how
// to get this value from Google Cloud.
let sheetsClient = null;

async function getClient() {
  if (sheetsClient) return sheetsClient;

  const rawCredentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!rawCredentials) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON environment variable is not set. See .env.example for setup steps.");
  }

  const credentials = JSON.parse(rawCredentials);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const authClient = await auth.getClient();
  sheetsClient = google.sheets({ version: "v4", auth: authClient });
  return sheetsClient;
}

/**
 * Ensures the target tab has a header row. Safe to call often — it only
 * writes the header if row 1 is empty.
 */
async function ensureHeader() {
  const sheets = await getClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TAB_NAME}!A1:I1`,
  });

  if (!res.data.values || res.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${TAB_NAME}!A1:I1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [
          [
            "Employee Name",
            "Employee ID",
            "Truck Number",
            "Date",
            "Time",
            "City",
            "Latitude",
            "Longitude",
            "Status",
          ],
        ],
      },
    });
  }
}

/**
 * Appends one attendance row to the Google Sheet. Never throws to the
 * caller — a Sheets outage should never block or fail an attendance
 * record, since the database is the source of truth.
 */
async function appendAttendanceRow(record) {
  if (!ENABLED) return { skipped: true, reason: "Google Sheets sync disabled" };
  if (!SHEET_ID) return { skipped: true, reason: "GOOGLE_SHEET_ID not set" };

  try {
    await ensureHeader();
    const sheets = await getClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${TAB_NAME}!A1`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [
          [
            record.employeeName,
            record.employeeCustomId || "",
            record.truckNumber,
            record.date,
            record.time,
            record.city,
            record.latitude,
            record.longitude,
            record.status,
          ],
        ],
      },
    });
    return { skipped: false };
  } catch (err) {
    console.error("Google Sheets sync failed (attendance was still saved):", err.message);
    return { skipped: true, reason: err.message };
  }
}

module.exports = { appendAttendanceRow, ENABLED };
