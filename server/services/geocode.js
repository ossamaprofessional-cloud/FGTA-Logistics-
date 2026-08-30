/**
 * Reverse geocoding using OpenStreetMap's Nominatim service.
 * Free, no API key required. Please respect their usage policy
 * (max ~1 request/second) — fine for an attendance app's traffic pattern.
 * https://operations.osmfoundation.org/policies/nominatim/
 *
 * If you'd rather use Google Maps Geocoding API (faster, more accurate,
 * needs a billing-enabled API key), swap the fetch URL below and read
 * response.results[0].formatted_address / address_components instead.
 */

async function reverseGeocode(latitude, longitude) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`;

  try {
    const res = await fetch(url, {
      headers: {
        // Nominatim requires a descriptive User-Agent identifying the app.
        "User-Agent": "TransportAttendanceApp/1.0 (internal company tool)",
      },
    });

    if (!res.ok) throw new Error(`Nominatim responded ${res.status}`);

    const data = await res.json();
    const addr = data.address || {};

    const city =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.county ||
      addr.state_district ||
      addr.state ||
      "Unknown location";

    const country = addr.country || "";

    return {
      city: country ? `${city}, ${country}` : city,
      raw: data.display_name || null,
    };
  } catch (err) {
    console.error("Reverse geocoding failed:", err.message);
    // Never block attendance just because geocoding failed — fall back gracefully.
    return { city: "Unknown location", raw: null };
  }
}

module.exports = { reverseGeocode };
