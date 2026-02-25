import { useEffect, useRef, useState, useCallback } from "react";
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

  const [selectedRoute, setSelectedRoute] = useState("R01");
  const [availableCount, setAvailableCount] = useState(0);
  
  // ใช้ Ref เก็บค่า selectedRoute ปัจจุบัน เพื่อให้ Socket เรียกใช้ได้โดยไม่ต้อง re-connect
  const selectedRouteRef = useRef("R01"); 

  const vehiclesRef = useRef({});
  const prevPositionsRef = useRef({});
  const routeLayersRef = useRef({});
  const stopLayersRef = useRef({});
  const vehicleRouteMapRef = useRef({});

  /* ===============================
    Utility
  ================================ */
  function shouldMove(oldPos, newPos) {
    const dx = oldPos[0] - newPos[0];
    const dy = oldPos[1] - newPos[1];
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance > 0.00003;
  }

  function animateMove(marker, start, end, duration = 800) {
    const startTime = performance.now();

    function step(currentTime) {
      const progress = Math.min((currentTime - startTime) / duration, 1);
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
    Update Available Count
  ================================ */
  const updateAvailableCount = useCallback(() => {
    if (!mapRef.current) return;
    
    let count = 0;
    // ทริค: ให้นับจำนวนจาก Marker รถที่ "กำลังแสดงอยู่บนแผนที่จริงๆ" 
    Object.values(vehiclesRef.current).forEach(marker => {
      if (mapRef.current.hasLayer(marker)) {
        count++;
      }
    });
    
    setAvailableCount(count);
  }, []);

  /* ===============================
    Load Vehicle → Route Mapping
  ================================ */
  useEffect(() => {
    async function loadVehicles() {
      try {
        const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/admin/vehicles`);
        const vehicles = await res.json();
        vehicles.forEach(v => {
          vehicleRouteMapRef.current[v.id] = v.assigned_route_id;
        });
      } catch (err) {
        console.error("Vehicle mapping loaded error:", err);
      }
    }
    loadVehicles();
  }, []);

  /* ===============================
    Load Stops & Routes (รอ Map พร้อม)
  ================================ */
  useEffect(() => {
    let interval;

    function waitForMap() {
      if (mapRef.current && LRef.current) {
        clearInterval(interval);
        mapRef.current.flyTo(RSU_CENTER, 17, {
          animate: true,
          duration: 1.2,
        });
        loadRoutesAndStops();
      }
    }

    async function loadRoutesAndStops() {
      const routeIds = ["R01", "R02"];

      for (const routeId of routeIds) {
        try {
          // 1. โหลดป้ายรถเมล์
          const stopRes = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/admin/route-stops/${routeId}`);
          const stops = await stopRes.json();

          const stopLayer = L.layerGroup();
          const stopIcon = L.icon({
            iconUrl: "icons/stop.png",
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32],
          });

          stops.forEach((stop) => {
            L.marker([stop.lat, stop.lng], { icon: stopIcon })
              .bindPopup(stop.nameTh)
              .addTo(stopLayer);
          });
          stopLayersRef.current[routeId] = stopLayer;

          // 2. โหลดเส้นทาง (OSRM)
          const points = stops.map(p => `${p.lng},${p.lat}`);
          if (points.length > 0) {
            points.push(points[0]); // วนกลับจุดเริ่มต้น
            const coordinates = points.join(";");

            const osrmRes = await fetch(
              `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`
            );
            const osrmData = await osrmRes.json();
            
            if (osrmData.routes && osrmData.routes.length > 0) {
              const routeGeo = osrmData.routes[0].geometry.coordinates;
              const latlngs = routeGeo.map(coord => [coord[1], coord[0]]);
              
              const routeLayer = L.layerGroup();
              L.polyline(latlngs, {
                color: routeId === "R01" ? "#FC9186" : "#3B82F6",
                weight: 5,
              }).addTo(routeLayer);
              
              routeLayersRef.current[routeId] = routeLayer;
            }
          }

          // แสดงเฉพาะ Route ที่เลือกปัจจุบัน
          if (routeId === selectedRouteRef.current) {
            stopLayersRef.current[routeId]?.addTo(mapRef.current);
            routeLayersRef.current[routeId]?.addTo(mapRef.current);
          }

        } catch (err) {
          console.error("Route/Stop load error:", err);
        }
      }
    }

    interval = setInterval(waitForMap, 200);
    return () => clearInterval(interval);
  }, []);

  /* ===============================
    Route Switcher
  ================================ */
  function handleRouteChange(routeId) {
    if (!mapRef.current) return;

    setSelectedRoute(routeId);
    selectedRouteRef.current = routeId; // ซิงค์ Ref ทันที

    // สลับ Route Layers (เส้นทาง)
    Object.values(routeLayersRef.current).forEach(layer => mapRef.current.removeLayer(layer));
    routeLayersRef.current[routeId]?.addTo(mapRef.current);

    // สลับ Stop Layers (ป้ายรถเมล์)
    Object.values(stopLayersRef.current).forEach(layer => mapRef.current.removeLayer(layer));
    stopLayersRef.current[routeId]?.addTo(mapRef.current);

    // สลับ Vehicles (รถบัส)
    Object.keys(vehiclesRef.current).forEach(id => {
      const vehicleRoute = vehicleRouteMapRef.current[id];
      const marker = vehiclesRef.current[id];

      if (vehicleRoute === routeId) {
        if (!mapRef.current.hasLayer(marker)) marker.addTo(mapRef.current);
      } else {
        if (mapRef.current.hasLayer(marker)) mapRef.current.removeLayer(marker);
      }
    });

    updateAvailableCount();
  }

  /* ===============================
    WebSocket Tracking
  ================================ */
  useEffect(() => {
    const socket = io(process.env.REACT_APP_BACKEND_URL);

    // เช็คว่าเชื่อมต่อ Socket สำเร็จไหม
    socket.on("connect", () => console.log("🟢 Socket Connected:", socket.id));
    socket.on("disconnect", () => console.log("🔴 Socket Disconnected"));

    socket.on("location-update", (data) => {
      // 1. ลอง Print ดูว่าข้อมูลที่ยิงมา หน้าตาตรงกับ { vehicleId, lat, lng } ไหม
      console.log("📍 ข้อมูลยิงเข้า:", data); 

      if (!mapRef.current) return;

      // บังคับแปลงเป็น String และ Number เพื่อป้องกันปัญหา Type ไม่ตรง (เช่น 1 กับ "1")
      const id = String(data.vehicleId || data.id); 
      const newPos = [Number(data.lat), Number(data.lng)];
      
      let vehicleRoute = vehicleRouteMapRef.current[id];

      // 2. ถ้าหา Route ไม่เจอ (API อาจจะช้า หรือ ID ไม่ตรง) ให้แสดงผลไปก่อนเพื่อทดสอบ
      if (!vehicleRoute) {
        console.warn(` ไม่พบ Route ของรถ ID: ${id} -> บังคับแสดงในหน้า ${selectedRouteRef.current} ก่อน`);
        vehicleRoute = selectedRouteRef.current; 
        vehicleRouteMapRef.current[id] = vehicleRoute;
      }

      // ถ้ารถยังไม่มี Marker บนแผนที่
      if (!vehiclesRef.current[id]) {
        console.log(`🚌 กำลังสร้าง Marker ให้รถคันใหม่ ID: ${id}`);
        const marker = L.marker(newPos, {
          icon: L.icon({
            iconUrl: "/icons/bus.png",
            iconSize: [26, 26],
            iconAnchor: [13, 13],
          }),
        });

        vehiclesRef.current[id] = marker;
        prevPositionsRef.current[id] = newPos;

        if (vehicleRoute === selectedRouteRef.current) {
          marker.addTo(mapRef.current);
        }
        updateAvailableCount();
        return;
      }

      const marker = vehiclesRef.current[id];
      
      // จัดการแสดง/ซ่อน ตาม Route ที่เลือก
      if (vehicleRoute === selectedRouteRef.current) {
        if (!mapRef.current.hasLayer(marker)) marker.addTo(mapRef.current);
      } else {
        if (mapRef.current.hasLayer(marker)) {
          mapRef.current.removeLayer(marker);
          return;
        }
      }

      // ขยับรถ
      const oldPos = prevPositionsRef.current[id];
      if (shouldMove(oldPos, newPos)) {
        animateMove(marker, oldPos, newPos);
        prevPositionsRef.current[id] = newPos;
      }

      updateAvailableCount();
    });

    return () => socket.disconnect();
  }, [updateAvailableCount]); // เอา selectedRoute ออกจาก Dependency

  /* ===============================
    UI
  ================================ */
  return (
    <div className="rsu-app">
      <header className="rsu-hdr">
        <h1>Rangsit University</h1>
        <p>Shuttle Bus Map</p>
      </header>

      <div className="rsu-map-wrap">
        <div id="rsu-map" />

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

        <AvailabilityCard count={availableCount} />

        <StopInfoCard
          stopName={DEFAULT_STOP}
          eta={DEFAULT_ETA}
          status="live"
        />

        <div className="rsu-wm">
          Made in Rangsit University
          <br />
          Version: Beta 8.2 (Fixed)
        </div>
      </div>

      <div className="rsu-bar" />
    </div>
  );
}