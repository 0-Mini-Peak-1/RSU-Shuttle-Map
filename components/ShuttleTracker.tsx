"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import { io, Socket } from "socket.io-client";
import "leaflet/dist/leaflet.css";

import { RSU_CENTER } from "../constants";
import { useLeafletMap } from "../hooks/useLeafletMap";
import AvailabilityCard from "./AvailabilityCard";
import StopInfoCard from "./StopInfoCard";
import { shouldMove, animateMove, getNearestPointIndex, getDirectionalPointIndex } from "../utils/MapHelpers";
import { Stop, Vehicle, LocationUpdateData } from "../types";

const DEFAULT_STOP_ICON = L.icon({
  iconUrl: "/icons/stop.png",
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

const ACTIVE_STOP_ICON = L.icon({
  iconUrl: "/icons/stop.png",
  iconSize: [48, 48],
  iconAnchor: [24, 48],
  popupAnchor: [0, -48],
});

export default function ShuttleTracker() {
  const { mapRef, LRef } = useLeafletMap();

  // === 1. State ===
  const [selectedRoute, setSelectedRoute] = useState<string>("R01");
  const [availableCount, setAvailableCount] = useState<number>(0);
  const [userLoc, setUserLoc] = useState<[number, number] | null>(null);
  const [targetStop, setTargetStop] = useState<Stop | null>(null);
  const [realEta, setRealEta] = useState<number | null>(null);
  const [isAppLocked, setIsAppLocked] = useState<boolean>(false);

  // === 2. Refs (ข้อมูลเบื้องหลัง) ===
  const selectedRouteRef = useRef<string>("R01");
  const targetStopRef = useRef<Stop | null>(null);
  const stopsByRouteRef = useRef<Record<string, Stop[]>>({});
  const routeGeometryRef = useRef<Record<string, [number, number][]>>({});
  
  // Vehicles Refs
  const vehiclesRef = useRef<Record<string, L.Marker>>({});
  const prevPositionsRef = useRef<Record<string, [number, number]>>({});
  const vehicleSpeedHistoryRef = useRef<Record<string, number[]>>({});
  const vehicleLastIndexRef = useRef<Record<string, number>>({});
  const vehicleActualStationRef = useRef<Record<string, string | number>>({});
  const vehicleRouteMapRef = useRef<Record<string, string>>({});
  const vehicleLastValidIndexRef = useRef<Record<string, number>>({});
  
  // Layers & Map Refs
  const activeStopMarkerRef = useRef<L.Marker | null>(null);
  const stopMarkersMapRef = useRef<Record<string, L.Marker>>({});
  const routeLayersRef = useRef<Record<string, L.LayerGroup>>({});
  const stopLayersRef = useRef<Record<string, L.LayerGroup>>({});
  const userMarkerRef = useRef<L.Marker | null>(null);
  
  // Zoom & Update Queue Refs
  const isZoomingRef = useRef<boolean>(false);
  const pendingUpdatesRef = useRef<Record<string, any>>({});
  const processLocationUpdateRef = useRef<(data: any) => void>(() => {});

  // === 3. Functions ===
  const calculateETA = useCallback(() => {
    if (!targetStopRef.current || !mapRef.current) {
      setRealEta(null);
      return;
    }

    const stop = targetStopRef.current;
    const routeId = selectedRouteRef.current;
    const coords = routeGeometryRef.current[routeId];
    const stops = stopsByRouteRef.current[routeId] || [];
    let minEtaMinutes = Infinity;

    Object.keys(vehiclesRef.current).forEach((id) => {
      if (vehicleRouteMapRef.current[id] !== routeId || !mapRef.current?.hasLayer(vehiclesRef.current[id])) return;

      const pos = prevPositionsRef.current[id];
      if (!pos || !coords || coords.length === 0) return;

      const busIdx = getDirectionalPointIndex(pos, coords, vehicleLastIndexRef.current[id] ?? -1);
      vehicleLastIndexRef.current[id] = busIdx;
      const stopIdx = stop.polyIndex ?? getNearestPointIndex([stop.lat, stop.lng], coords);

      const actualStationId = String(vehicleActualStationRef.current[id]);
      const busStationSequence = stops.findIndex(s => String(s.id) === actualStationId || String(s.name) === actualStationId);
      const targetStopSequence = stops.findIndex(s => String(s.id) === String(stop.id));

      let indexDiff = busIdx - stopIdx;
      if (indexDiff < -(coords.length / 2)) indexDiff += coords.length;
      else if (indexDiff > (coords.length / 2)) indexDiff -= coords.length;

      const distanceFromStop = L.latLng(pos[0], pos[1]).distanceTo(L.latLng(stop.lat, stop.lng));
      let isPassed = false;

      if (busStationSequence !== -1 && targetStopSequence !== -1) {
        if (busStationSequence > targetStopSequence) isPassed = true;
        else if (busStationSequence === targetStopSequence && indexDiff > 0 && distanceFromStop > 15) isPassed = true;
      } else {
        if (indexDiff > 3 && distanceFromStop > 15) isPassed = true;
      }

      let pathDist = 0;
      if (!isPassed) {
        if (busIdx <= stopIdx) {
          for (let i = busIdx; i < stopIdx; i++) pathDist += L.latLng(coords[i]).distanceTo(L.latLng(coords[i + 1]));
        } else {
          for (let i = busIdx; i < coords.length - 1; i++) pathDist += L.latLng(coords[i]).distanceTo(L.latLng(coords[i + 1]));
          for (let i = 0; i < stopIdx; i++) pathDist += L.latLng(coords[i]).distanceTo(L.latLng(coords[i + 1]));
        }
        if (pathDist < distanceFromStop) pathDist = distanceFromStop;
      } else {
        if (busIdx <= stopIdx) {
          let fullLoopDist = 0;
          for (let i = 0; i < coords.length - 1; i++) fullLoopDist += L.latLng(coords[i]).distanceTo(L.latLng(coords[i + 1]));
          let normalDist = 0;
          for (let i = busIdx; i < stopIdx; i++) normalDist += L.latLng(coords[i]).distanceTo(L.latLng(coords[i + 1]));
          pathDist = fullLoopDist + normalDist;
        } else {
          for (let i = busIdx; i < coords.length - 1; i++) pathDist += L.latLng(coords[i]).distanceTo(L.latLng(coords[i + 1]));
          for (let i = 0; i < stopIdx; i++) pathDist += L.latLng(coords[i]).distanceTo(L.latLng(coords[i + 1]));
        }
      }

      // ==========================================
      // 🚀 อัลกอริทึมคำนวณ ETA แบบมืออาชีพ (ลดอาการเวลาแกว่ง)
      // ==========================================
      
      // 1. กำหนดความเร็วเฉลี่ยของรถบัสใน มหาลัย (ประมาณ 15 กม./ชม.)
      // เราจะไม่ใช้ speed จาก GPS แล้ว เพราะมันทำให้เวลาแกว่งไปมาตอนรถเบรก
      const AVERAGE_BUS_SPEED_KMH = 15; 
      const METERS_PER_MIN = AVERAGE_BUS_SPEED_KMH * (1000 / 60); // แปลงเป็น เมตร/นาที
      const pureDrivingTime = pathDist / METERS_PER_MIN;

      // 2. นับจำนวนป้ายรถเมล์ที่คั่นอยู่ระหว่าง "รถ" ถึง "ป้ายเป้าหมาย"
      let stopsBetween = 0;
      if (!isPassed) {
        if (busIdx <= stopIdx) {
           stopsBetween = stops.filter(s => (s.polyIndex ?? 0) > busIdx && (s.polyIndex ?? 0) < stopIdx).length;
        } else {
           stopsBetween = stops.filter(s => (s.polyIndex ?? 0) > busIdx || (s.polyIndex ?? 0) < stopIdx).length;
        }
      } else {
        // ถ้ารถเลยไปแล้ว ต้องวนรอบใหม่ ตีว่าต้องผ่านเกือบทุกป้าย
        stopsBetween = Math.max(0, stops.length - 2); 
      }

      // 3. บวกเวลาเผื่อจอดรับ-ส่งผู้โดยสาร (ป้ายละ 30 วินาที หรือ 0.5 นาที)
      const stopDwellTime = stopsBetween * 0.5;

      // 4. รวมเวลาทั้งหมด และปัดเศษขึ้น (เผื่อเวลาให้ผู้ใช้เสมอ)
      // ใช้ Math.max(1, ...) เพื่อป้องกันไม่ให้ขึ้น 0 นาที ถ้ารถอยู่ใกล้มากๆ
      const etaMinutes = Math.max(1, Math.ceil(pureDrivingTime + stopDwellTime));

      if (etaMinutes < minEtaMinutes) minEtaMinutes = etaMinutes;
    });

    setRealEta(minEtaMinutes === Infinity ? null : minEtaMinutes);
  }, []);

  const updateAvailableCount = useCallback(() => {
    if (!mapRef.current) return;
    const count = Object.values(vehiclesRef.current).filter(marker => mapRef.current?.hasLayer(marker)).length;
    setAvailableCount(count);
    calculateETA();
  }, [calculateETA]);

  const handleFindNearestStop = () => {
    if (!userLoc) return alert("กรุณาเปิดการเข้าถึงตำแหน่งที่ตั้ง (GPS) ในเบราว์เซอร์ของคุณ");
    const currentStops = stopsByRouteRef.current[selectedRouteRef.current] || [];
    if (currentStops.length === 0) return;

    let nearest: Stop | null = null;
    let minDst = Infinity;
    for (const stop of currentStops)  {
      const dst = L.latLng(userLoc[0], userLoc[1]).distanceTo(L.latLng(stop.lat, stop.lng));
      if (dst < minDst) { minDst = dst; nearest = stop; }
    }

    if (nearest && mapRef.current) {
      setTargetStop(nearest);
      targetStopRef.current = nearest;
      calculateETA();
      mapRef.current.flyTo([nearest.lat, nearest.lng], 19, { animate: true });

      if (activeStopMarkerRef.current) activeStopMarkerRef.current.setIcon(DEFAULT_STOP_ICON);
      const nearestMarker = stopMarkersMapRef.current[String(nearest.id)];
      if (nearestMarker) {
        nearestMarker.setIcon(ACTIVE_STOP_ICON);
        activeStopMarkerRef.current = nearestMarker;
      }
    }
  };

  function handleRouteChange(routeId: string) {
    if (!mapRef.current) return;
    setSelectedRoute(routeId);
    selectedRouteRef.current = routeId;

    Object.values(routeLayersRef.current).forEach(layer => mapRef.current?.removeLayer(layer));
    routeLayersRef.current[routeId]?.addTo(mapRef.current);

    Object.values(stopLayersRef.current).forEach(layer => mapRef.current?.removeLayer(layer));
    stopLayersRef.current[routeId]?.addTo(mapRef.current);

    Object.keys(vehiclesRef.current).forEach(id => {
      const marker = vehiclesRef.current[id];
      if (vehicleRouteMapRef.current[id] === routeId) {
        if (!mapRef.current?.hasLayer(marker)) marker.addTo(mapRef.current!);
      } else {
        if (mapRef.current?.hasLayer(marker)) mapRef.current.removeLayer(marker);
      }
    });

    setTargetStop(null);
    targetStopRef.current = null;
    if (activeStopMarkerRef.current) {
      activeStopMarkerRef.current.setIcon(DEFAULT_STOP_ICON);
      activeStopMarkerRef.current = null;
    }
    updateAvailableCount();
  }

  const processLocationUpdate = useCallback((data: any) => {
    if (!mapRef.current) return;

    const id = String(data.vehicleId || data.id);
    const currentStation = data.station || data.actualStation;
    if (currentStation !== undefined) {
      vehicleActualStationRef.current[id] = currentStation;
    }

    const currentSpeed = Number(data.speed ?? data.velocity ?? 15);
    if (!vehicleSpeedHistoryRef.current[id]) vehicleSpeedHistoryRef.current[id] = [];
    vehicleSpeedHistoryRef.current[id].push(currentSpeed);
    if (vehicleSpeedHistoryRef.current[id].length > 5) vehicleSpeedHistoryRef.current[id].shift();

    const newPos: [number, number] = [Number(data.lat), Number(data.lng)];

    if (!vehicleRouteMapRef.current[id]) vehicleRouteMapRef.current[id] = selectedRouteRef.current;

    if (!vehiclesRef.current[id]) {
      const marker = L.marker(newPos, { icon: L.icon({ iconUrl: "/icons/bus.png", iconSize: [26, 26], iconAnchor: [13, 13] }) });
      vehiclesRef.current[id] = marker;
      prevPositionsRef.current[id] = newPos;
      if (vehicleRouteMapRef.current[id] === selectedRouteRef.current) marker.addTo(mapRef.current);
      updateAvailableCount();
      return;
    }

    const marker = vehiclesRef.current[id];
    if (vehicleRouteMapRef.current[id] === selectedRouteRef.current) {
      if (!mapRef.current.hasLayer(marker)) marker.addTo(mapRef.current);
    } else {
      if (mapRef.current.hasLayer(marker)) { mapRef.current.removeLayer(marker); return; }
    }

    // Popup Logic
    const routeId = vehicleRouteMapRef.current[id];
    const routeStops = stopsByRouteRef.current[routeId] || [];
    const currentActualId = String(vehicleActualStationRef.current[id] || "");
    
    let currentIndex = routeStops.findIndex(s =>
      String(s.id) === currentActualId ||
      String(s.name) === currentActualId ||
      String((s as any).nameTh) === currentActualId
    );

    if (currentIndex === -1) {
      currentIndex = vehicleLastValidIndexRef.current[id] ?? -1;
    } else {
      vehicleLastValidIndexRef.current[id] = currentIndex;
    }

    let nextStopName = "กำลังประเมิน...";
    if (currentIndex !== -1 && routeStops.length > 0) {
      const nextIndex = (currentIndex + 1) % routeStops.length;
      nextStopName = (routeStops[nextIndex] as any).nameTh || routeStops[nextIndex].name || "ไม่ทราบชื่อป้าย";
    }

    const popupHtml = `
      <div class="sc-next-stop-bar" style="margin-bottom: 0;">
        <div class="sc-next-row" style="margin-top: 4px;">
          <span class="sc-next-label" style="min-width: 40px;">ถัดไป:</span>
          <span class="sc-next-name" style="font-size: 0.85rem;">➡️ ${nextStopName}</span>
        </div>
      </div>
    `;

    if (!marker.getPopup()) {
      marker.bindPopup(popupHtml, { closeButton: false, offset: [0, -10], className: 'custom-bus-popup' });
    } else {
      marker.setPopupContent(popupHtml);
    }

    const oldPos = prevPositionsRef.current[id];
    if (shouldMove(oldPos, newPos)) {
      animateMove(marker, oldPos, newPos);
      prevPositionsRef.current[id] = newPos;
    }
    updateAvailableCount();
  }, [updateAvailableCount]);

  // === 4. Effects ===
  useEffect(() => {
    processLocationUpdateRef.current = processLocationUpdate;
  }, [processLocationUpdate]);

  // Fetch Map & Routes (Optimized Loading)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const loadRouteData = async (routeId: string) => {
      try {
        // 1. ดึงข้อมูลป้ายจาก Backend (ดึงไวมาก)
        const stopRes = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/public/routes/${routeId}/stops`);
        const stops = (await stopRes.json()) as Stop[];
        const stopLayer = L.layerGroup();
        stopsByRouteRef.current[routeId] = stops;

        // วาดป้ายลงแผนที่ทันที
        stops.forEach((stop) => {
          const marker = L.marker([stop.lat, stop.lng], { icon: DEFAULT_STOP_ICON }).addTo(stopLayer);
          stopMarkersMapRef.current[String(stop.id)] = marker;

          marker.on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            if (activeStopMarkerRef.current) activeStopMarkerRef.current.setIcon(DEFAULT_STOP_ICON);
            marker.setIcon(ACTIVE_STOP_ICON);
            activeStopMarkerRef.current = marker;
            setTargetStop(stop);
            targetStopRef.current = stop;
            calculateETA();
            mapRef.current?.flyTo([stop.lat, stop.lng], 19, { animate: true, duration: 0.8 });
          });
        });

        stopLayersRef.current[routeId] = stopLayer;
        if (routeId === selectedRouteRef.current && mapRef.current) stopLayer.addTo(mapRef.current);

        // ==========================================
        // ดึงเส้นทางแบบเร็วๆ
        // ==========================================
        const stopsSignature = stops.map(s => s.id).join(',');
        const cacheKey = `rsu-route-cache-${routeId}`;
        const cachedDataStr = localStorage.getItem(cacheKey);

        let finalCoords: [number, number][] = [];
        let needToFetchOSRM = false;
        
        if (cachedDataStr) {
          // 1. เช็คความจำเบราว์เซอร์ก่อน ถ้าลายเซ็นตรงกัน แปลว่าป้ายไม่ได้เปลี่ยน ดึงมาใช้เลย
          const cachedData = JSON.parse(cachedDataStr);
          if (cachedData.signature === stopsSignature && cachedData.coords.length > 0) {
            finalCoords = cachedData.coords; 
          } else {
            needToFetchOSRM = true; // ป้ายเปลี่ยน ต้องคำนวณใหม่
          }
        } else {
          // 2. ถ้าเข้าเว็บครั้งแรกในชีวิต ให้ดึงเส้นทางสำรอง (Default Route) จากไฟล์ในโฟลเดอร์ public
          try {
            const defaultRouteRes = await fetch(`/data/route-${routeId}.json`);
            if (defaultRouteRes.ok) {
              finalCoords = await defaultRouteRes.json();
              // แอบจำลายเซ็นปัจจุบันไว้เลย รอบหน้าจะได้ไม่ต้องดึงไฟล์อีก
              localStorage.setItem(cacheKey, JSON.stringify({ signature: stopsSignature, coords: finalCoords }));
            } else {
              needToFetchOSRM = true;
            }
          } catch (e) {
            needToFetchOSRM = true;
          }
        }

        // 3. ถ้าไม่มีทางเลือกอื่นจริงๆ (ป้ายถูกเปลี่ยน หรือ ไฟล์พัง) ค่อยยิง OSRM ซึ่งจะช้าแค่รอบนี้รอบเดียว
        if (needToFetchOSRM || finalCoords.length === 0) {
          console.log(`[${routeId}] Detect stop changes or no cache. Fetching from OSRM...`);
          const points = stops.map(p => `${p.lng},${p.lat}`);
          if (points.length > 0) {
            points.push(points[0]);
            const osrmRes = await fetch(`https://router.project-osrm.org/route/v1/driving/${points.join(";")}?overview=full&geometries=geojson`);
            const osrmData = await osrmRes.json();

            if (osrmData.routes?.[0]) {
              finalCoords = osrmData.routes[0].geometry.coordinates.map((c: number[]) => [c[1], c[0]]);
              // อัปเดตความจำใหม่ให้เบราว์เซอร์
              localStorage.setItem(cacheKey, JSON.stringify({ signature: stopsSignature, coords: finalCoords }));
            }
          }
        }

        // === วาดเส้นถนนจริงลงแผนที่ ===
        if (finalCoords.length > 0) {
          routeGeometryRef.current[routeId] = finalCoords;

          let currentSearchIdx = 0;
          stops.forEach(stop => {
            let bestIdx = currentSearchIdx;
            let minDst = Infinity;
            for (let i = currentSearchIdx; i < finalCoords.length; i++) {
              const dst = L.latLng(stop.lat, stop.lng).distanceTo(L.latLng(finalCoords[i][0], finalCoords[i][1]));
              if (dst < minDst) { minDst = dst; bestIdx = i; }
            }
            stop.polyIndex = bestIdx;
            currentSearchIdx = bestIdx;
          });

          const routeLayer = L.layerGroup();
          L.polyline(finalCoords, { color: routeId === "R01" ? "#FF8169" : "#3B82F6", weight: 5, smoothFactor: 1.5, className: 'neon-path' }).addTo(routeLayer);
          routeLayersRef.current[routeId] = routeLayer;
          
          if (routeId === selectedRouteRef.current && mapRef.current) {
            routeLayer.addTo(mapRef.current);
          }
        }

      } catch (err) {
        console.error(`Failed to load route ${routeId}`, err);
      }
    };

    function waitForMap() {
      if (mapRef.current && LRef.current) {
        clearInterval(interval);
        mapRef.current.flyTo(RSU_CENTER, 16.7, { animate: true, duration: 1.2 });

        // ... เหตุการณ์ zoom start / end เหมือนเดิม ...
        mapRef.current.on('zoomstart', () => { isZoomingRef.current = true; setIsAppLocked(true); });
        mapRef.current.on('zoomend', () => { 
          isZoomingRef.current = false; setIsAppLocked(false);
          Object.values(pendingUpdatesRef.current).forEach(data => processLocationUpdateRef.current(data));
          pendingUpdatesRef.current = {};
        });
        mapRef.current.on("click", () => {
          if (isZoomingRef.current) return;
          if (targetStopRef.current || activeStopMarkerRef.current) {
            setTargetStop(null); targetStopRef.current = null;
            if (activeStopMarkerRef.current) { activeStopMarkerRef.current.setIcon(DEFAULT_STOP_ICON); activeStopMarkerRef.current = null; }
            mapRef.current?.flyTo(RSU_CENTER, 16.7, { animate: true, duration: 0.8 });
          }
        });
        
        loadRouteData("R01");
        loadRouteData("R02");
        
      }
      
    }

    interval = setInterval(waitForMap, 200);
    return () => clearInterval(interval);
  }, [calculateETA]);
  

  // GPS Handling
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos: GeolocationPosition) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setUserLoc(coords);
        if (!mapRef.current) return;
        
        if (!userMarkerRef.current) {
          const userIcon = L.divIcon({ className: "user-loc-marker", html: `<div class="user-pulse"></div>`, iconSize: [20, 20], iconAnchor: [10, 10] });
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

  // Socket Connection
  useEffect(() => {
    const socket: Socket = io(process.env.NEXT_PUBLIC_BACKEND_URL || "");

    socket.on("location-update", (data: any) => {
      if (!mapRef.current) return;
      if (isZoomingRef.current) {
        const id = String(data.vehicleId || data.id);
        pendingUpdatesRef.current[id] = data;
        return;
      }
      processLocationUpdateRef.current(data);
    });

    return () => { socket.disconnect(); };
  }, []);

  return (
    <div className="rsu-app">
      {isAppLocked && <div style={{ position: 'fixed', inset: 0, zIndex: 99999, cursor: 'wait' }} />}

      <header className="rsu-hdr">
        <h1>Rangsit University</h1>
        <p>Shuttle Bus Map</p>
      </header>
      <div className="rsu-map-wrap">
        <div id="rsu-map" />
        <div className="route-selector">
          {["R01", "R02"].map(route => (
            <button key={route} className={`route-btn ${selectedRoute === route ? "active" : ""}`} onClick={() => handleRouteChange(route)}>
              {route}
            </button>
          ))}
        </div>
        <AvailabilityCard count={availableCount} />
        <StopInfoCard targetStop={targetStop} eta={realEta} onFindNearest={handleFindNearestStop} />
      </div>
      <div className="rsu-bar" />
    </div>
  );
}