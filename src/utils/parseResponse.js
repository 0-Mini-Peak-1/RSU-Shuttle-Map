/**
 * Parses a raw API response from RSUBusTrackerApp (or the Prisma backend)
 * into the normalized shuttle shape used across the app.
 *
 * Supports:
 *  - Flat JSON:   { latitude, longitude, ... }
 *  - PostGIS GeoJSON location:  { location: { type:"Point", coordinates:[lng,lat] }, ... }
 *  - Short-hand:  { lat, lng / lon }
 *
 * @param {object|object[]} data - Raw API response body
 * @returns {object[]} Normalized shuttle array
 */
export function parseShuttleResponse(data) {
  const items = Array.isArray(data) ? data : [data];

  return items
    .map((d, i) => {
      const [lat, lng] = extractCoords(d);

      return {
        id:     d.vehicle_id ?? d.vehicleId ?? `SH-0${i + 1}`,
        name:   d.vehicle_id ?? d.name      ?? `Shuttle ${i + 1}`,
        lat,
        lng,
        speed:  d.speed  ?? 0,
        status: d.status ?? "active",
        route:  d.route  ?? "Campus Loop",
        tripId: d.trip_id ?? d.tripId ?? null,
        recordedAt: d.recorded_at ?? d.recordedAt ?? null,
      };
    })
    .filter((s) => !isNaN(s.lat) && !isNaN(s.lng));
}

/**
 * Extracts [lat, lng] from a single data object.
 * Tries PostGIS GeoJSON first, then flat fields.
 *
 * @param {object} d
 * @returns {[number, number]} [lat, lng]
 */
function extractCoords(d) {
  // PostGIS GeoJSON: coordinates are [lng, lat]
  if (d.location?.coordinates) {
    const [lng, lat] = d.location.coordinates;
    return [lat, lng];
  }

  // PostGIS x/y object
  if (d.location?.x !== undefined) {
    return [d.location.y, d.location.x];
  }

  // Flat fields
  const lat = parseFloat(d.latitude  ?? d.lat ?? d.coords?.latitude);
  const lng = parseFloat(d.longitude ?? d.lng ?? d.lon ?? d.coords?.longitude);
  return [lat, lng];
}