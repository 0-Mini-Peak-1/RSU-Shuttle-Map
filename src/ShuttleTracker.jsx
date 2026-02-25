import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import { io } from "socket.io-client";
import "leaflet/dist/leaflet.css";
import styles from "./styles/shuttle.css.js";
import { RSU_CENTER } from "./constants";
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
  
  const [userLoc, setUserLoc] = useState(null);
  const [targetStop, setTargetStop] = useState(null);
  const [realEta, setRealEta] = useState(null);

  const selectedRouteRef = useRef("R01"); 
  const targetStopRef = useRef(null);
  const stopsByRouteRef = useRef({});
  const routeGeometryRef = useRef({}); 

  const vehiclesRef = useRef({});
  const prevPositionsRef = useRef({});
  const vehicleSpeedsRef = useRef({}); // 🚀 เก็บความเร็วของรถแต่ละคัน (km/h)
  const routeLayersRef = useRef({});
  const stopLayersRef = useRef({});
  const vehicleRouteMapRef = useRef({});
  const userMarkerRef = useRef(null);

  /* ===============================
    Utility
  ================================ */
  function shouldMove(oldPos, newPos) {
    const dx = oldPos[0] - newPos[0];
    const dy = oldPos[1] - newPos[1];
    return Math.sqrt(dx * dx + dy * dy) > 0.00003;
  }

  function animateMove(marker, start, end, duration = 800) {
    const startTime = performance.now();
    function step(currentTime) {
      const progress = Math.min((currentTime - startTime) / duration, 1);
      const lat = start[0] + (end[0] - start[0]) * progress;
      const lng = start[1] + (end[1] - start[1]) * progress;
      marker.setLatLng([lat, lng]);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function getNearestPointIndex(pos, coords) {
    let minDst = Infinity;
    let minIdx = 0;
    const pt = L.latLng(pos[0], pos[1]);
    for (let i = 0; i < coords.length; i++) {
      const dst = pt.distanceTo(L.latLng(coords[i][0], coords[i][1]));
      if (dst < minDst) {
        minDst = dst;
        minIdx = i;
      }
    }
    return minIdx;
  }

  /* ===============================
    ETA Calculation (Along Polyline + Real Speed)
  ================================ */
  const calculateETA = useCallback(() => {
    if (!targetStopRef.current || !mapRef.current) {
      setRealEta(null);
      return;
    }

    const stop = targetStopRef.current;
    const routeId = selectedRouteRef.current;
    const stopLatLng = L.latLng(stop.lat, stop.lng);
    const coords = routeGeometryRef.current[routeId];
    
    let minEtaMinutes = Infinity;
    
    Object.keys(vehiclesRef.current).forEach(id => {
      const route = vehicleRouteMapRef.current[id];
      const marker = vehiclesRef.current[id];
      
      if (route === routeId && mapRef.current.hasLayer(marker)) {
        const pos = prevPositionsRef.current[id];
        if (pos) {
          const busLatLng = L.latLng(pos[0], pos[1]);
          const straightDist = stopLatLng.distanceTo(busLatLng);
          
          let pathDist = straightDist;

          // 1. หาระยะทางตามเส้นถนน
          if (straightDist < 50) {
            pathDist = straightDist;
          } else if (coords && coords.length > 0) {
            const busIdx = getNearestPointIndex(pos, coords);
            const stopIdx = getNearestPointIndex([stop.lat, stop.lng], coords);
            
            pathDist = 0;
            if (busIdx <= stopIdx) {
              for (let i = busIdx; i < stopIdx; i++) {
                pathDist += L.latLng(coords[i]).distanceTo(L.latLng(coords[i+1]));
              }
            } else {
              for (let i = busIdx; i < coords.length - 1; i++) {
                pathDist += L.latLng(coords[i]).distanceTo(L.latLng(coords[i+1]));
              }
              for (let i = 0; i < stopIdx; i++) {
                pathDist += L.latLng(coords[i]).distanceTo(L.latLng(coords[i+1]));
              }
            }
          }

          // 2. ดึงความเร็วจริงที่ได้จาก Backend
          // (ถ้าไม่มีข้อมูลให้ใช้ 15 km/h เป็นค่าตั้งต้น)
          let speedKmh = vehicleSpeedsRef.current[id];
          if (speedKmh === undefined || speedKmh === null) speedKmh = 15;

          // เซฟตี้: ถ้ารถจอดนิ่ง (0 km/h) หรือช้ามาก ให้ใช้ขั้นต่ำ 5 km/h เพื่อไม่ให้ ETA นานเวอร์เกินจริง
          if (speedKmh < 5) speedKmh = 5;

          // 3. แปลงความเร็ว km/h -> เมตร/นาที (m/min)
          const speedMpm = speedKmh * (1000 / 60);

          // 4. คำนวณเวลา = ระยะทาง / ความเร็ว
          const etaMinutes = Math.floor(pathDist / speedMpm);

          if (etaMinutes < minEtaMinutes) {
            minEtaMinutes = etaMinutes;
          }
        }
      }
    });

    if (minEtaMinutes === Infinity) {
      setRealEta(null);
    } else {
      setRealEta(minEtaMinutes);
    }
  }, []);

  const updateAvailableCount = useCallback(() => {
    if (!mapRef.current) return;
    let count = 0;
    Object.values(vehiclesRef.current).forEach(marker => {
      if (mapRef.current.hasLayer(marker)) count++;
    });
    setAvailableCount(count);
    calculateETA(); 
  }, [calculateETA]);

  /* ===============================
    GPS Tracking & Find Nearest
  ================================ */
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = [pos.coords.latitude, pos.coords.longitude];
        setUserLoc(coords);
        if (!mapRef.current) return;
        
        if (!userMarkerRef.current) {
          const userIcon = L.divIcon({
            className: "user-loc-marker",
            html: `<div class="user-pulse"></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          });
          userMarkerRef.current = L.marker(coords, { icon: userIcon }).addTo(mapRef.current);
        } else {
          userMarkerRef.current.setLatLng(coords);
        }
      },
      (err) => console.log("GPS Error:", err),
      { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [mapRef]);

  const handleFindNearestStop = () => {
    if (!userLoc) {
      alert("กรุณาเปิดการเข้าถึงตำแหน่งที่ตั้ง (GPS) ในเบราว์เซอร์ของคุณ");
      return;
    }
    const currentStops = stopsByRouteRef.current[selectedRouteRef.current] || [];
    if (currentStops.length === 0) return;

    const userLatLng = L.latLng(userLoc[0], userLoc[1]);
    let nearest = null;
    let minDst = Infinity;

    currentStops.forEach(stop => {
      const stopLatLng = L.latLng(stop.lat, stop.lng);
      const dst = userLatLng.distanceTo(stopLatLng);
      if (dst < minDst) {
        minDst = dst;
        nearest = stop;
      }
    });

    if (nearest) {
      handleStopSelect(nearest);
      mapRef.current.flyTo([nearest.lat, nearest.lng], 18, { animate: true });
    }
  };

  const handleStopSelect = (stop) => {
    setTargetStop(stop);
    targetStopRef.current = stop;
    calculateETA(); 
  };

  /* ===============================
    Load Initial Data
  ================================ */
  useEffect(() => {
    async function loadVehicles() {
      try {
        const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/admin/vehicles`);
        const vehicles = await res.json();
        vehicles.forEach(v => vehicleRouteMapRef.current[v.id] = v.assigned_route_id);
      } catch (err) {}
    }
    loadVehicles();
  }, []);

  useEffect(() => {
    let interval;
    function waitForMap() {
      if (mapRef.current && LRef.current) {
        clearInterval(interval);
        mapRef.current.flyTo(RSU_CENTER, 17, { animate: true, duration: 1.2 });
        loadRoutesAndStops();
      }
    }

    async function loadRoutesAndStops() {
      const routeIds = ["R01", "R02"];
      for (const routeId of routeIds) {
        try {
          const stopRes = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/admin/route-stops/${routeId}`);
          const stops = await stopRes.json();
          stopsByRouteRef.current[routeId] = stops;

          const stopLayer = L.layerGroup();
          const stopIcon = L.icon({
            iconUrl: "icons/stop.png",
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32],
          });

          stops.forEach((stop) => {
            const marker = L.marker([stop.lat, stop.lng], { icon: stopIcon }).addTo(stopLayer);
            marker.on("click", () => handleStopSelect(stop)); 
          });
          stopLayersRef.current[routeId] = stopLayer;

          if (routeId === selectedRouteRef.current) {
            stopLayersRef.current[routeId]?.addTo(mapRef.current);
          }

          const points = stops.map(p => `${p.lng},${p.lat}`);
          if (points.length > 0) {
            points.push(points[0]);
            const osrmRes = await fetch(`https://router.project-osrm.org/route/v1/driving/${points.join(";")}?overview=full&geometries=geojson`);
            const osrmData = await osrmRes.json();
            if (osrmData.routes?.[0]) {
              const coords = osrmData.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
              routeGeometryRef.current[routeId] = coords; 

              const routeLayer = L.layerGroup();
              L.polyline(coords, {
                color: routeId === "R01" ? "#FC9186" : "#3B82F6", weight: 5
              }).addTo(routeLayer);
              routeLayersRef.current[routeId] = routeLayer;
              if (routeId === selectedRouteRef.current) routeLayer.addTo(mapRef.current);
            }
          }
        } catch (err) {}
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
    selectedRouteRef.current = routeId;

    Object.values(routeLayersRef.current).forEach(layer => mapRef.current.removeLayer(layer));
    routeLayersRef.current[routeId]?.addTo(mapRef.current);

    Object.values(stopLayersRef.current).forEach(layer => mapRef.current.removeLayer(layer));
    stopLayersRef.current[routeId]?.addTo(mapRef.current);

    Object.keys(vehiclesRef.current).forEach(id => {
      const vehicleRoute = vehicleRouteMapRef.current[id];
      const marker = vehiclesRef.current[id];
      if (vehicleRoute === routeId) {
        if (!mapRef.current.hasLayer(marker)) marker.addTo(mapRef.current);
      } else {
        if (mapRef.current.hasLayer(marker)) mapRef.current.removeLayer(marker);
      }
    });

    handleStopSelect(null); 
    updateAvailableCount();
  }

  /* ===============================
    WebSocket Tracking
  ================================ */
  useEffect(() => {
    const socket = io(process.env.REACT_APP_BACKEND_URL);

    socket.on("location-update", (data) => {
      if (!mapRef.current) return;

      const id = String(data.vehicleId || data.id); 
      const newPos = [Number(data.lat), Number(data.lng)];
      
      // 🚀 บันทึกความเร็วจริงจาก Backend
      // (รองรับทั้ง key ชื่อ data.speed หรือ data.velocity)
      if (data.speed !== undefined) {
        vehicleSpeedsRef.current[id] = Number(data.speed);
      } else if (data.velocity !== undefined) {
        vehicleSpeedsRef.current[id] = Number(data.velocity);
      }

      let vehicleRoute = vehicleRouteMapRef.current[id];

      if (!vehicleRoute) {
        vehicleRoute = selectedRouteRef.current; 
        vehicleRouteMapRef.current[id] = vehicleRoute;
      }

      if (!vehiclesRef.current[id]) {
        const marker = L.marker(newPos, {
          icon: L.icon({
            iconUrl: "/icons/bus.png",
            iconSize: [26, 26],
            iconAnchor: [13, 13],
          }),
        });
        vehiclesRef.current[id] = marker;
        prevPositionsRef.current[id] = newPos;
        if (vehicleRoute === selectedRouteRef.current) marker.addTo(mapRef.current);
        updateAvailableCount();
        return;
      }

      const marker = vehiclesRef.current[id];
      if (vehicleRoute === selectedRouteRef.current) {
        if (!mapRef.current.hasLayer(marker)) marker.addTo(mapRef.current);
      } else {
        if (mapRef.current.hasLayer(marker)) {
          mapRef.current.removeLayer(marker);
          return;
        }
      }

      const oldPos = prevPositionsRef.current[id];
      if (shouldMove(oldPos, newPos)) {
        animateMove(marker, oldPos, newPos);
        prevPositionsRef.current[id] = newPos;
      }

      updateAvailableCount();
    });

    return () => socket.disconnect();
  }, [updateAvailableCount]);

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
          targetStop={targetStop}
          eta={realEta}
          onFindNearest={handleFindNearestStop}
        />

      </div>
      <div className="rsu-bar" />
    </div>
  );
}