import { useEffect, useRef } from "react";
import { RSU_BOUNDS, RSU_CENTER, MAP_OPTIONS, MOCK_SHUTTLES } from "../constants";
import { loadLeaflet, injectLeafletDeps, placeMarkers } from "../utils/leaflet";

/**
 * useLeafletMap
 *
 * Initialises a Leaflet map inside a DOM element with id="rsu-map",
 * locks it to the RSU campus bounds, and places the initial mock markers.
 *
 * @returns {{
 *   mapRef:     React.Ref,  - Leaflet map instance
 *   LRef:       React.Ref,  - Leaflet library instance
 *   markersRef: React.Ref,  - Marker registry { [id]: L.Marker }
 * }}
 */
export function useLeafletMap() {
  const mapRef     = useRef(null);
  const LRef       = useRef(null);
  const markersRef = useRef({});

  useEffect(() => {
    injectLeafletDeps();

    let cancelled = false;

    loadLeaflet().then((L) => {
      if (cancelled || mapRef.current) return;

      LRef.current = L;

      const bounds = L.latLngBounds(RSU_BOUNDS);

      const map = L.map("rsu-map", {
        ...MAP_OPTIONS,
        center:    RSU_CENTER,
        maxBounds: bounds,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);

      // Fit the view to the RSU campus boundary on load
      map.fitBounds(bounds, { padding: [24, 24] });

      mapRef.current = map;

      // Show mock shuttles immediately so the map isn't empty
      placeMarkers(L, map, MOCK_SHUTTLES, markersRef);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return { mapRef, LRef, markersRef };
}