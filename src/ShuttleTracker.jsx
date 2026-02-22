import { useState, useEffect, useRef} from "react";
import L from 'leaflet';
import { io } from "socket.io-client";
import 'leaflet/dist/leaflet.css';
import styles from "./styles/shuttle.css.js";
import {
  DEFAULT_STOP,
  DEFAULT_ETA,
} from "./constants";
import { useLeafletMap } from "./hooks/useLeafletMap";
import AvailabilityCard from "./components/AvailabilityCard";
import StopInfoCard from "./components/StopInfoCard";
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


  // ── Map initialisation ─────────────────────────────────────
  const { mapRef, LRef } = useLeafletMap();

  // ── Live tracking ──────────────────────────────────────────


    const vehiclesRef = useRef({});
    const prevPositionsRef = useRef({});
    const routePathRef = useRef([]);
    const socketRef = useRef(null);
    

    function shouldMove(oldPos, newPos) {
      const dx = oldPos[0] - newPos[0];
      const dy = oldPos[1] - newPos[1];
      const distance = Math.sqrt(dx * dx + dy * dy);
    
      return distance > 0.00005; // กัน jitter เล็กๆ (~5-6 เมตร)
    }

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
      iconUrl: 'icons/stop.png', // เปลี่ยนเป็น URL รูปของคุณ
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
          `${process.env.REACT_APP_BACKEND_URL}/api/admin/route-stops/R01`
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
        routePathRef.current = latlngs;
        
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

// eslint-disable-next-line react-hooks/exhaustive-deps
function animateMove(marker, start, end, duration = 1000) {
  const startTime = performance.now();

  function step(currentTime) {
    const progress = Math.min(
      (currentTime - startTime) / duration,
      1
    );

    const lat =
      start[0] + (end[0] - start[0]) * progress;

    const lng =
      start[1] + (end[1] - start[1]) * progress;

    marker.setLatLng([lat, lng]);

    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

function findNearestPointIndex(path, lat, lng) {
  let minDist = Infinity;
  let nearestIndex = 0;

  path.forEach((point, index) => {
    const dx = point[0] - lat;
    const dy = point[1] - lng;
    const dist = dx * dx + dy * dy;

    if (dist < minDist) {
      minDist = dist;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}

function animateAlongRoute(marker, path, startIndex, endIndex) {
  let i = startIndex;

  function step() {
    if (i >= endIndex) return;

    const current = path[i];
    const next = path[i + 1];

    if (!current || !next) return;

    animateMove(marker, current, next, 200);

    i++;
    setTimeout(step, 200);
  }

  step();
}

// ของจริง
useEffect(() => {
  const socket = io(process.env.REACT_APP_BACKEND_URL);

  socket.on("connect", () => {
    console.log("Connected:", socket.id);
  });

  socket.on("location-update", (data) => {
    const id = data.vehicleId;
    const newPos = [Number(data.lat), Number(data.lng)];
  
    const path = routePathRef.current;
    if (!path.length) return;
  
    const newIndex = findNearestPointIndex(
      path,
      newPos[0],
      newPos[1]
    );
  
    if (!vehiclesRef.current[id]) {
      const marker = L.marker(path[newIndex], {
        icon: L.icon({
          iconUrl: "/icons/bus.png",
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
      }).addTo(mapRef.current);
  
      vehiclesRef.current[id] = {
        marker,
        index: newIndex,
      };
  
      return;
    }
  
    const vehicle = vehiclesRef.current[id];
    const currentIndex = vehicle.index;
  
    if (newIndex === currentIndex) return;
  
    animateAlongRoute(
      vehicle.marker,
      path,
      currentIndex,
      newIndex
    );
  
    vehicle.index = newIndex;
  });

  return () => socket.disconnect();
}, []);

  // ── Derived display values ─────────────────────────────────
  const availableCount = 0;
  const topStatus = "live";

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
          Version: Beta 6.7
        </div>
      </div>

      {/* ── Bottom gradient bar ── */}
      <div className="rsu-bar" />
    </div>
  );
}
