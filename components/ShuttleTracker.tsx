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

// === Constants & Icons ===
const AVERAGE_BUS_SPEED_KMH = 15;
const METERS_PER_MIN = AVERAGE_BUS_SPEED_KMH * (1000 / 60);

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
  const [isAppLocked, setIsAppLocked] = useState<boolean>(true);

  // === 2. Refs (Background Data) ===
  const selectedRouteRef = useRef<string>("R01");
  const targetStopRef = useRef<Stop | null>(null);
  
  // Data Storage
  const stopsByRouteRef = useRef<Record<string, Stop[]>>({});
  const routeGeometryRef = useRef<Record<string, [number, number][]>>({});
  
  // Vehicles Tracking
  const vehiclesRef = useRef<Record<string, L.Marker>>({});
  const prevPositionsRef = useRef<Record<string, [number, number]>>({});
  const vehicleSpeedHistoryRef = useRef<Record<string, number[]>>({});
  const vehicleLastIndexRef = useRef<Record<string, number>>({});
  const vehicleActualStationRef = useRef<Record<string, string | number>>({});
  const vehicleRouteMapRef = useRef<Record<string, string>>({});
  const vehicleLastValidIndexRef = useRef<Record<string, number>>({});
  
  // Map Layers
  const activeStopMarkerRef = useRef<L.Marker | null>(null);
  const stopMarkersMapRef = useRef<Record<string, L.Marker>>({});
  const routeLayersRef = useRef<Record<string, L.LayerGroup>>({});
  const stopLayersRef = useRef<Record<string, L.LayerGroup>>({});
  const userMarkerRef = useRef<L.Marker | null>(null);
  
  // Event Queues
  const isZoomingRef = useRef<boolean>(false);
  const pendingUpdatesRef = useRef<Record<string, any>>({});
  const processLocationUpdateRef = useRef<(data: any) => void>(() => {});

  // === 3. Core Functions ===

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

      // เช็คว่ารถวิ่งเลยป้ายไปหรือยัง
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

      const calcDist = (startIdx: number, endIdx: number) => {
        let d = 0;
        for (let i = startIdx; i < endIdx; i++) {
          d += L.latLng(coords[i]).distanceTo(L.latLng(coords[i + 1]));
        }
        return d;
      };

      let pathDist = 0;
      if (!isPassed) {
        if (busIdx <= stopIdx) {
          pathDist = calcDist(busIdx, stopIdx);
        } else {
          pathDist = calcDist(busIdx, coords.length - 1) + calcDist(0, stopIdx);
        }
        pathDist = Math.max(pathDist, distanceFromStop);
      } else {
        if (busIdx <= stopIdx) {
          const fullLoopDist = calcDist(0, coords.length - 1);
          pathDist = fullLoopDist + calcDist(busIdx, stopIdx);
        } else {
          pathDist = calcDist(busIdx, coords.length - 1) + calcDist(0, stopIdx);
        }
      }
      
      // นับจำนวนป้ายรถเมล์ที่คั่นอยู่เพื่อเผื่อเวลาจอด
      let stopsBetween = 0;
      if (!isPassed) {
        stopsBetween = (busIdx <= stopIdx) 
          ? stops.filter(s => (s.polyIndex ?? 0) > busIdx && (s.polyIndex ?? 0) < stopIdx).length
          : stops.filter(s => (s.polyIndex ?? 0) > busIdx || (s.polyIndex ?? 0) < stopIdx).length;
      } else {
        stopsBetween = Math.max(0, stops.length - 2); 
      }

      // คำนวณเวลา (ขับรถล้วน + เวลาแวะป้ายละ 0.5 นาที)
      const pureDrivingTime = pathDist / METERS_PER_MIN;
      const stopDwellTime = stopsBetween * 0.5;
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

  const handleRouteChange = (routeId: string) => {
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
  };

  const processLocationUpdate = useCallback((data: any) => {
    if (!mapRef.current) return;

    const id = String(data.vehicleId || data.id);
    const currentStation = data.station || data.actualStation;
    if (currentStation !== undefined) vehicleActualStationRef.current[id] = currentStation;

    const currentSpeed = Number(data.speed ?? data.velocity ?? 15);
    if (!vehicleSpeedHistoryRef.current[id]) vehicleSpeedHistoryRef.current[id] = [];
    vehicleSpeedHistoryRef.current[id].push(currentSpeed);
    if (vehicleSpeedHistoryRef.current[id].length > 5) vehicleSpeedHistoryRef.current[id].shift();

    // เปลี่ยนจาก const เป็น let เพื่อให้สามารถปรับแก้พิกัดเพื่อดูดเข้าถนนได้
    let newPos: [number, number] = [Number(data.lat), Number(data.lng)];

    if (!vehicleRouteMapRef.current[id]) vehicleRouteMapRef.current[id] = selectedRouteRef.current;
    
    const routeId = vehicleRouteMapRef.current[id];

    // ==========================================
    // ดูดรถเข้าหาเส้นถนน (Snap to road)
    // ==========================================
    const coords = routeGeometryRef.current[routeId];
    if (coords && coords.length > 0) {
      const nearestIdx = getNearestPointIndex(newPos, coords);
      if (nearestIdx !== -1) {
        newPos = coords[nearestIdx]; // บังคับพิกัดรถให้อยู่บนจุดที่ใกล้ที่สุดของถนน
      }
    }
    // ==========================================

    // สร้าง Marker ถ้ารถเพิ่งเข้าสู่ระบบ
    if (!vehiclesRef.current[id]) {
      const marker = L.marker(newPos, { icon: L.icon({ iconUrl: "/icons/bus.png", iconSize: [26, 26], iconAnchor: [13, 13] }) });
      vehiclesRef.current[id] = marker;
      prevPositionsRef.current[id] = newPos;
      if (vehicleRouteMapRef.current[id] === selectedRouteRef.current) marker.addTo(mapRef.current);
      updateAvailableCount();
      return;
    }

    // อัปเดต Marker เดิม
    const marker = vehiclesRef.current[id];
    if (vehicleRouteMapRef.current[id] === selectedRouteRef.current) {
      if (!mapRef.current.hasLayer(marker)) marker.addTo(mapRef.current);
    } else {
      if (mapRef.current.hasLayer(marker)) { mapRef.current.removeLayer(marker); return; }
    }

    // Popup Logic (แสดงป้ายถัดไป)
    const routeStops = stopsByRouteRef.current[routeId] || [];
    const currentActualId = String(vehicleActualStationRef.current[id] || "");
    
    let currentIndex = routeStops.findIndex(s =>
      String(s.id) === currentActualId || String(s.name) === currentActualId || String((s as any).nameTh) === currentActualId
    );

    if (currentIndex === -1) currentIndex = vehicleLastValidIndexRef.current[id] ?? -1;
    else vehicleLastValidIndexRef.current[id] = currentIndex;

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

    if (!marker.getPopup()) marker.bindPopup(popupHtml, { closeButton: false, offset: [0, -10], className: 'custom-bus-popup' });
    else marker.setPopupContent(popupHtml);

    // เลื่อนขยับรถแบบมี Animation
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

  // 4.1 โหลดข้อมูล Map & Routes (Progressive Loading + Cache)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const loadRouteData = async (routeId: string) => {
      try {
        // วาดป้ายรถเมล์ทันที (ไม่รอเส้นทาง)
        const stopRes = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/public/routes/${routeId}/stops`);
        const stops = (await stopRes.json()) as Stop[];
        const stopLayer = L.layerGroup();
        stopsByRouteRef.current[routeId] = stops;

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

        // ดึงเส้นทางอัจฉริยะ (Local JSON -> Cache -> OSRM)
        const stopsSignature = stops.map(s => s.id).join(',');
        const cacheKey = `rsu-route-cache-${routeId}`;
        const cachedDataStr = localStorage.getItem(cacheKey);
        
        let finalCoords: [number, number][] = [];
        let needToFetchOSRM = false;
        
        if (cachedDataStr) {
          const cachedData = JSON.parse(cachedDataStr);
          if (cachedData.signature === stopsSignature && cachedData.coords.length > 0) finalCoords = cachedData.coords; 
          else needToFetchOSRM = true;
        } else {
          try {
            const defaultRouteRes = await fetch(`/data/route-${routeId}.json`);
            if (defaultRouteRes.ok) {
              finalCoords = await defaultRouteRes.json();
              localStorage.setItem(cacheKey, JSON.stringify({ signature: stopsSignature, coords: finalCoords }));
            } else needToFetchOSRM = true;
          } catch {
            needToFetchOSRM = true;
          }
        }

        // กรณีฉุกเฉิน: ดึงจาก OSRM สดๆ
        if (needToFetchOSRM || finalCoords.length === 0) {
          console.log(`[${routeId}] Fetching from OSRM...`);
          const points = stops.map(p => `${p.lng},${p.lat}`);
          if (points.length > 0) {
            points.push(points[0]);
            const osrmRes = await fetch(`https://router.project-osrm.org/route/v1/driving/${points.join(";")}?overview=full&geometries=geojson`);
            const osrmData = await osrmRes.json();

            if (osrmData.routes?.[0]) {
              finalCoords = osrmData.routes[0].geometry.coordinates.map((c: number[]) => [c[1], c[0]]);
              localStorage.setItem(cacheKey, JSON.stringify({ signature: stopsSignature, coords: finalCoords }));
            }
          }
        }

        // วาดเส้นถนน
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
          
          if (routeId === selectedRouteRef.current && mapRef.current) routeLayer.addTo(mapRef.current);
        }
      } catch (err) {
        console.error(`Failed to load route ${routeId}`, err);
      }
    };

    // 4.2 จัดการตัวแผนที่หลักตอนเริ่มต้น
    function waitForMap() {
      if (mapRef.current && LRef.current) {
        clearInterval(interval);
        mapRef.current.flyTo(RSU_CENTER, 16.7, { animate: true, duration: 1.2 });

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
  
  // 4.3 จัดการ GPS (ปุ่มใกล้ฉัน)
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

  // 4.4 Socket Connection (รับพิกัดรถบัส)
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