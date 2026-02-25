import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { io } from "socket.io-client";
import "leaflet/dist/leaflet.css";
import styles from "./styles/shuttle.css.js";
import { RSU_CENTER, DEFAULT_STOP, DEFAULT_ETA } from "./constants";
import { useLeafletMap } from "./hooks/useLeafletMap";
import AvailabilityCard from "./components/AvailabilityCard";
import StopInfoCard from "./components/StopInfoCard";

/* ===============================
  Inject Global Styles
================================ */
function useGlobalStyles() {
  useEffect(() => {
    if (document.getElementById("rsu-styles")) return;
    const el = document.createElement("style");
    el.id = "rsu-styles";
    el.textContent = styles;
    document.head.appendChild(el);
  }, []);
}

/* ===============================
  Main Component
================================ */
export default function ShuttleTracker() {
  useGlobalStyles();

  const { mapRef, LRef } = useLeafletMap();

  /* ===============================
    States & Refs
  ================================= */
  const [selectedRoute, setSelectedRoute] = useState("R01");
  const vehiclesRef = useRef({});
  const prevPositionsRef = useRef({});
  const routeLayersRef = useRef({}); 
  const stopLayersRef = useRef({});

  /* ===============================
    Utility: Anti-jitter
  ================================= */
  function shouldMove(oldPos, newPos) {
    const dx = oldPos[0] - newPos[0];
    const dy = oldPos[1] - newPos[1];
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance > 0.00003;
  }

  /* ===============================
    Smooth Animation
  ================================= */
  function animateMove(marker, start, end, duration = 800) {
    const startTime = performance.now();

    function step(currentTime) {
      const progress = Math.min(
        (currentTime - startTime) / duration,
        1
      );

      const lat = start[0] + (end[0] - start[0]) * progress;
      const lng = start[1] + (end[1] - start[1]) * progress;

      marker.setLatLng([lat, lng]);

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }

    requestAnimationFrame(step);
  }

  /* ===============================
    Load Stops
  ================================= */
  useEffect(() => {
    let interval;
  
    function waitForMap() {
      if (mapRef.current && LRef.current) {
        clearInterval(interval);

        mapRef.current.flyTo(RSU_CENTER, 17, {
          animate: true,
          duration: 1.2,
        });

        loadStopsByRoute();
      }
    }
  
    async function loadStopsByRoute() {
      const routeIds = ["R01", "R02"];
  
      for (const routeId of routeIds) {
        try {
          const res = await fetch(
            `${process.env.REACT_APP_BACKEND_URL}/api/admin/route-stops/${routeId}`
          );
  
          const stops = await res.json();
  
          const layer = L.layerGroup();
  
          const stopIcon = L.icon({
            iconUrl: "icons/stop.png",
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32],
          });
  
          stops.forEach((stop) => {
            L.marker([stop.lat, stop.lng], {
              icon: stopIcon,
            })
              .bindPopup(stop.nameTh)
              .addTo(layer);
          });
  
          stopLayersRef.current[routeId] = layer;
  
          // แสดงเฉพาะ route ที่เลือก
          if (routeId === selectedRoute) {
            layer.addTo(mapRef.current);
          }
  
        } catch (err) {
          console.error("Stop load error:", err);
        }
      }
    }
  
    interval = setInterval(waitForMap, 200);
    return () => clearInterval(interval);
  }, []);

  /* ===============================
    Load Multiple Routes
  ================================= */
  useEffect(() => {
    let interval;

    function waitForMap() {
      if (mapRef.current && LRef.current) {
        clearInterval(interval);
        loadRoutes();
      }
    }

    async function loadRoutes() {
      const routeIds = ["R01", "R02"];

      for (const routeId of routeIds) {
        try {
          const res = await fetch(
            `${process.env.REACT_APP_BACKEND_URL}/api/admin/route-stops/${routeId}`
          );
          const data = await res.json();

          const points = data.map(p => `${p.lng},${p.lat}`);
          points.push(points[0]);
          const coordinates = points.join(";");

          const osrmRes = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`
          );

          const osrmData = await osrmRes.json();
          const routeGeo = osrmData.routes[0].geometry.coordinates;

          const latlngs = routeGeo.map(coord => [
            coord[1],
            coord[0],
          ]);

          const layer = L.layerGroup();

          L.polyline(latlngs, {
            color: routeId === "R01" ? "#FC9186" : "#3B82F6",
            weight: 5,
          }).addTo(layer);

          routeLayersRef.current[routeId] = layer;

          if (routeId === selectedRoute) {
            layer.addTo(mapRef.current);
          }

        } catch (err) {
          console.error("Route load error:", err);
        }
      }
    }

    interval = setInterval(waitForMap, 200);
    return () => clearInterval(interval);
  }, []);

  /* ===============================
    Route Switcher
  ================================= */
  function handleRouteChange(routeId) {
    if (!mapRef.current) return;
  
    // ลบ route layer ทั้งหมด
    Object.values(routeLayersRef.current).forEach(layer => {
      mapRef.current.removeLayer(layer);
    });
  
    // ลบ stop layer ทั้งหมด
    Object.values(stopLayersRef.current).forEach(layer => {
      mapRef.current.removeLayer(layer);
    });
  
    // แสดงเฉพาะ route ที่เลือก
    routeLayersRef.current[routeId]?.addTo(mapRef.current);
    stopLayersRef.current[routeId]?.addTo(mapRef.current);
  
    setSelectedRoute(routeId);
  }
  /* ===============================
    WebSocket Tracking
  ================================= */
  useEffect(() => {
    const socket = io(process.env.REACT_APP_BACKEND_URL);

    socket.on("connect", () => {
      console.log("Connected:", socket.id);
    });

    socket.on("location-update", (data) => {
      if (!mapRef.current) return;

      const id = data.vehicleId;
      const newPos = [Number(data.lat), Number(data.lng)];

      if (!vehiclesRef.current[id]) {
        const marker = L.marker(newPos, {
          icon: L.icon({
            iconUrl: "/icons/bus.png",
            iconSize: [26, 26],
            iconAnchor: [13, 13],
          }),
        }).addTo(mapRef.current);

        vehiclesRef.current[id] = marker;
        prevPositionsRef.current[id] = newPos;
        return;
      }

      const oldPos = prevPositionsRef.current[id];

      if (!shouldMove(oldPos, newPos)) return;

      animateMove(
        vehiclesRef.current[id],
        oldPos,
        newPos
      );

      prevPositionsRef.current[id] = newPos;
    });

    return () => socket.disconnect();
  }, []);

  /* ===============================
    UI
  ================================= */
  return (
    <div className="rsu-app">
      <header className="rsu-hdr">
        <h1>Rangsit University</h1>
        <p>Shuttle Bus Map</p>
      </header>

      <div className="rsu-map-wrap">
        <div id="rsu-map" />

        {/* Route Selector */}
        <div className="route-selector">
          {["R01", "R02"].map(route => (
            <button
              key={route}
              className={`route-btn ${selectedRoute === route ? "active" : ""}`}
              onClick={() => handleRouteChange(route)}
            >
              {route}
            </button>
          ))}
        </div>

        <AvailabilityCard count={0} />

        <StopInfoCard
          stopName={DEFAULT_STOP}
          eta={DEFAULT_ETA}
          status="live"
        />

        <div className="rsu-wm">
          Made in Rangsit University
          <br />
          Version: Beta 8.0
        </div>
      </div>

      <div className="rsu-bar" />
    </div>
  );
}