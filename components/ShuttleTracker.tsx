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

// 🚀 ย้ายการประกาศ Icon ออกมาข้างนอก เพื่อไม่ให้ React สร้างใหม่ทุกครั้งที่เรนเดอร์
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

  // === State (สิ่งที่เปลี่ยนแล้วกระทบหน้าจอ) ===
  const [selectedRoute, setSelectedRoute] = useState<string>("R01");
  const [availableCount, setAvailableCount] = useState<number>(0);
  const [userLoc, setUserLoc] = useState<[number, number] | null>(null);
  const [targetStop, setTargetStop] = useState<Stop | null>(null);
  const [realEta, setRealEta] = useState<number | null>(null);
  // 🚀 State สำหรับล็อคหน้าจอตอนซูม
  const [isAppLocked, setIsAppLocked] = useState<boolean>(false);

  // === Refs (ตัวแปรเก็บข้อมูลหลังบ้าน ไม่ทำให้จอรีเฟรช) ===
  const selectedRouteRef = useRef<string>("R01");
  const targetStopRef = useRef<Stop | null>(null);
  const stopsByRouteRef = useRef<Record<string, Stop[]>>({});
  const routeGeometryRef = useRef<Record<string, [number, number][]>>({});
  const vehiclesRef = useRef<Record<string, L.Marker>>({});
  const prevPositionsRef = useRef<Record<string, [number, number]>>({});
  const vehicleSpeedHistoryRef = useRef<Record<string, number[]>>({});
  const vehicleLastIndexRef = useRef<Record<string, number>>({});
  const activeStopMarkerRef = useRef<L.Marker | null>(null);
  const stopMarkersMapRef = useRef<Record<string, L.Marker>>({});
  const vehicleActualStationRef = useRef<Record<string, string | number>>({});
  const routeLayersRef = useRef<Record<string, L.LayerGroup>>({});
  const stopLayersRef = useRef<Record<string, L.LayerGroup>>({});
  const vehicleRouteMapRef = useRef<Record<string, string>>({});
  const userMarkerRef = useRef<L.Marker | null>(null);
  
  // 🚀 Ref สำหรับจัดการคิวข้อมูลตอนซูม
  const isZoomingRef = useRef<boolean>(false);
  const pendingUpdatesRef = useRef<Record<string, any>>({});
  const processLocationUpdateRef = useRef<(data: any) => void>(() => {});
  
  // 🚀 เพิ่ม Ref สำหรับจำค่าป้ายล่าสุดที่ถูกต้อง (จำเป็นสำหรับแก้บั๊ก Next Stop ไม่ขึ้น)
  const vehicleLastValidIndexRef = useRef<Record<string, number>>({});

  // === 1. ฟังก์ชันคำนวณ ETA ===
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

      const history = vehicleSpeedHistoryRef.current[id] || [];
      const speedKmh = Math.max(5, history.length > 0 ? history.reduce((a, b) => a + b, 0) / history.length : 15);
      const drivingTimeMinutes = pathDist / (speedKmh * (1000 / 60));

      const etaMinutes = Math.floor(drivingTimeMinutes);
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

  // === 2. โหลดรถบัสตั้งต้น ===
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/public/active-vehicles`)
      .then(res => res.json())
      .then((vehicles: Vehicle[]) => {
        vehicles.forEach(v => {
          vehicleRouteMapRef.current[String(v.id)] = v.assigned_route_id;
          if (v.actualStation) vehicleActualStationRef.current[String(v.id)] = v.actualStation;
        });
      })
      .catch(err => console.error("Failed to load vehicles", err));
  }, []);

  // === 3. โหลดแผนที่และเส้นทาง (โหลดเร็วขึ้นด้วย Promise.all) ===
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    async function loadRoutesAndStops() {
      const routeIds = ["R01", "R02"];
      // 🚀 โหลด 2 เส้นทางพร้อมกัน (Parallel) ทำให้เว็บไวขึ้น 2 เท่า
      await Promise.all(routeIds.map(async (routeId) => {
        try {
          const stopRes = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/public/routes/${routeId}/stops`);
          const stops = (await stopRes.json()) as Stop[];
          const stopLayer = L.layerGroup();
          const points = stops.map(p => `${p.lng},${p.lat}`);
          
          if (points.length > 0) {
            points.push(points[0]);
            const osrmRes = await fetch(`https://router.project-osrm.org/route/v1/driving/${points.join(";")}?overview=full&geometries=geojson`);
            const osrmData = await osrmRes.json();
            
            if (osrmData.routes?.[0]) {
              const coords: [number, number][] = osrmData.routes[0].geometry.coordinates.map((c: number[]) => [c[1], c[0]]);
              routeGeometryRef.current[routeId] = coords;

              let currentSearchIdx = 0;
              stops.forEach(stop => {
                let bestIdx = currentSearchIdx;
                let minDst = Infinity;
                for (let i = currentSearchIdx; i < coords.length; i++) {
                  const dst = L.latLng(stop.lat, stop.lng).distanceTo(L.latLng(coords[i][0], coords[i][1]));
                  if (dst < minDst) { minDst = dst; bestIdx = i; }
                }
                stop.polyIndex = bestIdx;
                currentSearchIdx = bestIdx;
              });

              const routeLayer = L.layerGroup();
              L.polyline(coords, { color: routeId === "R01" ? "#FF8169" : "#3B82F6", weight: 5 }).addTo(routeLayer);
              routeLayersRef.current[routeId] = routeLayer;
              if (routeId === selectedRouteRef.current) routeLayer.addTo(mapRef.current!);
            }
          }

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
          if (routeId === selectedRouteRef.current) stopLayer.addTo(mapRef.current!);
        } catch (err) {
          console.error(`Failed to load route ${routeId}`, err);
        }
      }));
    }

    function waitForMap() {
      if (mapRef.current && LRef.current) {
        clearInterval(interval);
        mapRef.current.flyTo(RSU_CENTER, 16.7, { animate: true, duration: 1.2 });

        // 🚀 ระบบล็อคหน้าจอและคิวข้อมูลเมื่อเริ่มซูม
        mapRef.current.on('zoomstart', () => {
          isZoomingRef.current = true;
          setIsAppLocked(true);
        });

        mapRef.current.on('zoomend', () => {
          isZoomingRef.current = false;
          setIsAppLocked(false);
          // โหลดข้อมูลรถที่ค้างในคิวมาแสดงผล
          Object.values(pendingUpdatesRef.current).forEach(data => {
            processLocationUpdateRef.current(data);
          });
          pendingUpdatesRef.current = {};
        });

        mapRef.current.on("click", () => {
          if (isZoomingRef.current) return;
          if (targetStopRef.current || activeStopMarkerRef.current) {
            setTargetStop(null);
            targetStopRef.current = null;
            if (activeStopMarkerRef.current) {
              activeStopMarkerRef.current.setIcon(DEFAULT_STOP_ICON);
              activeStopMarkerRef.current = null;
            }
            mapRef.current?.flyTo(RSU_CENTER, 16.7, { animate: true, duration: 0.8 });
          }
        });
        loadRoutesAndStops();
      }
    }

    interval = setInterval(waitForMap, 200);
    return () => clearInterval(interval);
  }, []);

  // === 4. GPS ผู้ใช้งาน (ปุ่มใกล้ฉัน) ===
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

  const handleFindNearestStop = () => {
    if (!userLoc) return alert("กรุณาเปิดการเข้าถึงตำแหน่งที่ตั้ง (GPS) ในเบราว์เซอร์ของคุณ");
    const currentStops = stopsByRouteRef.current[selectedRouteRef.current] || [];
    if (currentStops.length === 0) return;

    let nearest: Stop | null = null;
    let minDst = Infinity;
    for (const stop of currentStops)  {
      const dst = L.latLng(userLoc[0], userLoc[1]).distanceTo(L.latLng(stop.lat, stop.lng));
      if (dst < minDst) { minDst = dst; nearest = stop; }
    };

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

  // === 5. เปลี่ยนเส้นทาง (R01/R02) ===
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

  // === 6. ฟังก์ชันหลักสำหรับอัปเดตตำแหน่งรถ (แยกออกมาเพื่อให้เรียกตอนซูมเสร็จได้) ===
  const processLocationUpdate = useCallback((data: any) => { // 🚀 ใช้ any ชั่วคราวเพื่อให้รับ data.station ได้
    if (!mapRef.current) return;

    const id = String(data.vehicleId || data.id);
    
    // 🚀 1. ดึงข้อมูลสถานีที่ถูกต้อง (เช็คทั้ง station และ actualStation)
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

    // 🚀 2. Popup รถบัส แก้ไขบั๊ก Next Stop
    const routeId = vehicleRouteMapRef.current[id];
    const routeStops = stopsByRouteRef.current[routeId] || [];
    
    // 🚀 ดึงชื่อป้ายจาก Memory เพื่อความชัวร์
    const currentActualId = String(vehicleActualStationRef.current[id] || "");
    
    let currentIndex = routeStops.findIndex(s =>
      String(s.id) === currentActualId ||
      String(s.name) === currentActualId ||
      String((s as any).nameTh) === currentActualId
    );

    // 🚀 สำรองข้อมูลไว้ เผื่อ Backend ส่ง En Route มา
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

    // === 🚀 Popup สไตล์เดียวกับ StopInfoCard ===
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
    // ===========================================

    const oldPos = prevPositionsRef.current[id];
    if (shouldMove(oldPos, newPos)) {
      animateMove(marker, oldPos, newPos);
      prevPositionsRef.current[id] = newPos;
    }
    updateAvailableCount();
  }, [updateAvailableCount]);

  // อัปเดต Reference ให้เป็นฟังก์ชันล่าสุดเสมอ
  useEffect(() => {
    processLocationUpdateRef.current = processLocationUpdate;
  }, [processLocationUpdate]);

  // === 7. รับข้อมูล WebSocket ===
  useEffect(() => {
    const socket: Socket = io(process.env.NEXT_PUBLIC_BACKEND_URL || "");

    socket.on("location-update", (data: any) => { // 🚀 ใช้ any ชั่วคราวเพื่อให้รับ data.station ได้
      if (!mapRef.current) return;

      // 🚀 ถ้ากำลังซูมอยู่ ให้ยัดข้อมูลใส่คิวแทน
      if (isZoomingRef.current) {
        const id = String(data.vehicleId || data.id);
        pendingUpdatesRef.current[id] = data;
        return;
      }

      processLocationUpdateRef.current(data);
    });

    return () => { socket.disconnect(); };
  }, [updateAvailableCount]);

  return (
    <div className="rsu-app">
      {/* 🚀 แผ่นใสบังหน้าจอ ป้องกันการรัวคลิก/ลากมั่วตอนกำลังซูม */}
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