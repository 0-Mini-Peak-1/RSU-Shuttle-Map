import { useState, useRef, useEffect, useCallback } from "react";
import { MOCK_SHUTTLES } from "../constants";
import { parseShuttleResponse } from "../utils/parseResponse";
import { placeMarkers } from "../utils/leaflet";

/**
 * useShuttleTracker
 *
 * Manages live shuttle tracking state: polling the RSUBusTrackerApp API,
 * parsing responses, updating shuttle data, and syncing markers on the map.
 *
 * @param {object} params
 * @param {string}        params.endpoint   - API endpoint URL
 * @param {number}        params.pollSec    - Poll interval in seconds
 * @param {React.Ref}     params.LRef       - Ref to Leaflet instance
 * @param {React.Ref}     params.mapRef     - Ref to Leaflet map instance
 * @param {React.Ref}     params.markersRef - Ref to marker registry { [id]: L.Marker }
 *
 * @returns {{
 *   tracking:      boolean,
 *   shuttles:      object[],
 *   startTracking: () => void,
 *   stopTracking:  () => void,
 * }}
 */
export function useShuttleTracker({ endpoint, pollSec, LRef, mapRef, markersRef }) {
  const [tracking, setTracking] = useState(false);
  const [shuttles, setShuttles] = useState(MOCK_SHUTTLES);

  const timerRef = useRef(null);

  const syncMarkers = useCallback((data) => {
    if (LRef.current && mapRef.current) {
      placeMarkers(LRef.current, mapRef.current, data, markersRef);
    }
  }, [LRef, mapRef, markersRef]);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(endpoint.trim(), { headers: { Accept: "application/json" } });
      if (!res.ok) return;
      const data   = await res.json();
      const parsed = parseShuttleResponse(data);
      if (!parsed.length) return;
      setShuttles(parsed);
      syncMarkers(parsed);
    } catch {
      // Network errors are silent — mock data stays visible
    }
  }, [endpoint, syncMarkers]);

  const startTracking = useCallback(() => {
    if (timerRef.current) return;
    setTracking(true);
    poll();
    timerRef.current = setInterval(poll, Math.max(1, pollSec) * 1000);
  }, [poll, pollSec]);

  const stopTracking = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = null;
    setTracking(false);
    setShuttles(MOCK_SHUTTLES);
    syncMarkers(MOCK_SHUTTLES);
  }, [syncMarkers]);

  // Cleanup on unmount
  useEffect(() => () => clearInterval(timerRef.current), []);

  return { tracking, shuttles, startTracking, stopTracking };
}