import { useEffect, useRef } from "react";
import L from "leaflet";
import { RSU_CENTER } from "../constants";

export function useLeafletMap() {
  const mapRef = useRef<L.Map | null>(null);
  const LRef = useRef<typeof L | null>(null);

  useEffect(() => {
    // โหลด Leaflet เฉพาะตอนรันบน Browser เท่านั้น
    if (typeof window !== "undefined" && !mapRef.current) {
      LRef.current = L;
      const map = L.map("rsu-map", {
        zoomControl: false,
        attributionControl: false,
      }).setView(RSU_CENTER, 17);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);

      mapRef.current = map;
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return { mapRef, LRef };
}