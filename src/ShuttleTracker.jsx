import { useState, useEffect } from "react";
import L from 'leaflet';

import 'leaflet/dist/leaflet.css';
import styles from "./styles/shuttle.css.js";
import {
  DEFAULT_STOP,
  DEFAULT_ETA,
  DEFAULT_ENDPOINT,
  DEFAULT_POLL_SEC,
} from "./constants";

import { useLeafletMap } from "./hooks/useLeafletMap";
import { useShuttleTracker } from "./hooks/useShuttleTracker";

import AvailabilityCard from "./components/AvailabilityCard";
import StopInfoCard from "./components/StopInfoCard";
import ConfigPanel from "./components/ConfigPanel";

// Inject stylesheet once
function useGlobalStyles() {
  useEffect(() => {
    if (document.getElementById("rsu-styles")) return;
    const el = document.createElement("style");
    el.id = "rsu-styles";
    el.textContent = styles;
    document.head.appendChild(el);
  }, []);
}

export default function ShuttleTracker() {
  useGlobalStyles();

  // ── Config state ───────────────────────────────────────────
  const [showCfg, setShowCfg] = useState(false);
  const [endpoint, setEndpoint] = useState(DEFAULT_ENDPOINT);
  const [pollSec, setPollSec] = useState(DEFAULT_POLL_SEC);

  // ── Map initialisation ─────────────────────────────────────
  const { mapRef, LRef, markersRef } = useLeafletMap();

  // ── Live tracking ──────────────────────────────────────────
  const { tracking, shuttles, startTracking, stopTracking } =
    useShuttleTracker({
      endpoint,
      pollSec,
      LRef,
      mapRef,
      markersRef,
    });

  // ── Load Stops from Backend ───────────────────────────────
  useEffect(() => {
    let interval;
  
    function waitForMap() {
      if (mapRef.current && LRef.current) {
        clearInterval(interval);
        loadStops();
      }
    }
  
    const customIcon = L.icon({
      iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png', // เปลี่ยนเป็น URL รูปของคุณ
      iconSize: [32, 32], // ขนาด [กว้าง, สูง]
      iconAnchor: [16, 32], // จุดที่วางลงบนพิกัด (กึ่งกลางฐานรูป)
      popupAnchor: [0, -32] // จุดที่ Popup จะเด้งออกมา
    });
    
    async function loadStops() {
      try {
        console.log("Loading stops...");
        const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/admin/stops`);
        const stops = await res.json();
    
        stops.forEach((stop) => {
          // 2. เปลี่ยนจาก L.circleMarker เป็น L.marker
          LRef.current.marker([stop.lat, stop.lng], {
            icon: customIcon // 3. ใส่ icon ที่เราสร้างไว้
          })
          .addTo(mapRef.current)
          .bindPopup(stop.nameTh);
        });
    
      } catch (err) {
        console.error(err);
      }
    }
  
    interval = setInterval(waitForMap, 200);
  
    return () => clearInterval(interval);
  
  }, []);

  useEffect(() => {
    let interval;
  
    function waitForMap() {
      if (mapRef.current && LRef.current) {
        clearInterval(interval);
        loadRoute();
      }
    }
  
    async function loadRoute() {
      try {
        const res = await fetch(
          `${process.env.REACT_APP_BACKEND_URL}/api/admin/routes/R01/path`
        );
        const data = await res.json();
    
        // แปลงเป็น format OSRM ต้อง lng,lat
        const points = data.map(p => `${p.lng},${p.lat}`);

// เอาจุดแรกไปต่อท้าย
        points.push(points[0]);

        const coordinates = points.join(";");
    
        const osrmRes = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`
        );
    
        const osrmData = await osrmRes.json();
    
        const routeGeo = osrmData.routes[0].geometry.coordinates;
    
        const latlngs = routeGeo.map(coord => [
          coord[1], // lat
          coord[0], // lng
        ]);
    
        LRef.current.polyline(latlngs, {
          color: "#FC9186",
          weight: 4,
        }).addTo(mapRef.current);
    
      } catch (err) {
        console.error(err);
      }
    }
  
    interval = setInterval(waitForMap, 200);
  
    return () => clearInterval(interval);
  
  }, []);
  
  
  

  // ── Derived display values ─────────────────────────────────
  const availableCount = shuttles.filter(
    (s) => s.status !== "busy"
  ).length;

  const topStatus = shuttles[0]?.status ?? "idle";

  function handleStart() {
    startTracking();
    setShowCfg(false);
  }

  return (
    <div className="rsu-app">
      {/* ── Header ── */}
      <header className="rsu-hdr">
        <h1>Rangsit University</h1>
        <p>Shuttle Bus Map</p>
      </header>

      {/* ── Map area ── */}
      <div className="rsu-map-wrap">
        {/* Leaflet renders into this div */}
        <div id="rsu-map" />

        {/* Config button + slide-down panel */}
        <ConfigPanel
          show={showCfg}
          onToggle={() => setShowCfg((v) => !v)}
          tracking={tracking}
          endpoint={endpoint}
          onEndpoint={setEndpoint}
          pollSec={pollSec}
          onPollSec={setPollSec}
          onStart={handleStart}
          onStop={stopTracking}
          shuttles={shuttles}
        />

        {/* Top-right availability */}
        <AvailabilityCard count={availableCount} />

        {/* Bottom-left stop info */}
        <StopInfoCard
          stopName={DEFAULT_STOP}
          eta={DEFAULT_ETA}
          status={topStatus}
        />

        {/* Watermark */}
        <div className="rsu-wm">
          Made in Rangsit University
          <br />
          Version: Beta 0.2
        </div>
      </div>

      {/* ── Bottom gradient bar ── */}
      <div className="rsu-bar" />
    </div>
  );
}
