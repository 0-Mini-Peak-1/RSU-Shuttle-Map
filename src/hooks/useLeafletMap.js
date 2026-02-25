import { useEffect, useRef } from "react";
import { RSU_CENTER, MAP_OPTIONS } from "../constants";
import { loadLeaflet, injectLeafletDeps } from "../utils/leaflet";

/**
 * useLeafletMap
 *
 * Initialises a Leaflet map inside a DOM element with id="rsu-map",
 * locks it to the RSU campus.
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


      const map = L.map("rsu-map", {
        ...MAP_OPTIONS,
        center:    RSU_CENTER,

      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);

      mapRef.current = map;

    });

    return () => {
      cancelled = true;
    };
  }, []);

  return { mapRef, LRef, markersRef };
}