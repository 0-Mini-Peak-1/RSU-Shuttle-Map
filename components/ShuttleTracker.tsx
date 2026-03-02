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

export default function ShuttleTracker() {
  const { mapRef, LRef } = useLeafletMap();

  const [selectedRoute, setSelectedRoute] = useState<string>("R01");
  const [availableCount, setAvailableCount] = useState<number>(0);
  
  const [userLoc, setUserLoc] = useState<[number, number] | null>(null);
  const [targetStop, setTargetStop] = useState<Stop | null>(null);
  const [realEta, setRealEta] = useState<number | null>(null);

  const selectedRouteRef = useRef<string>("R01"); 
  const targetStopRef = useRef<Stop | null>(null);
  const stopsByRouteRef = useRef<Record<string, Stop[]>>({});
  const routeGeometryRef = useRef<Record<string, [number, number][]>>({}); 

  const vehiclesRef = useRef<Record<string, L.Marker>>({});
  const prevPositionsRef = useRef<Record<string, [number, number]>>({});
  const vehicleSpeedsRef = useRef<Record<string, number>>({}); 
  const vehicleSpeedHistoryRef = useRef<Record<string, number[]>>({}); // เก็บประวัติความเร็ว 10 ครั้งล่าสุด
  const vehicleLastIndexRef = useRef<Record<string, number>>({}); // เก็บ Index ล่าสุดบนถนนป้องกันปัญหารถวาร์ปเลนสวน
  const activeStopMarkerRef = useRef<L.Marker | null>(null);
  const stopMarkersMapRef = useRef<Record<string, L.Marker>>({});
  
  // 🚀 เพิ่ม Ref สำหรับเก็บ actualStation ที่ส่งมาจาก Backend
  const vehicleActualStationRef = useRef<Record<string, string | number>>({});
  
  const routeLayersRef = useRef<Record<string, L.LayerGroup>>({});
  const stopLayersRef = useRef<Record<string, L.LayerGroup>>({});
  const vehicleRouteMapRef = useRef<Record<string, string>>({});
  const userMarkerRef = useRef<L.Marker | null>(null);

  /* === ETA Calculation === */
  const calculateETA = useCallback(() => {
    if (!targetStopRef.current || !mapRef.current) {
      setRealEta(null);
      return;
    }

    const stop = targetStopRef.current;
    const routeId = selectedRouteRef.current;
    const coords = routeGeometryRef.current[routeId];
    const stops = stopsByRouteRef.current[routeId] || []; // 🚀 ดึง Array ป้ายเพื่อเอาไว้เช็คลำดับ
    
    let minEtaMinutes = Infinity;
    
    Object.keys(vehiclesRef.current).forEach(id => {
      const route = vehicleRouteMapRef.current[id];
      const marker = vehiclesRef.current[id];
      
      if (route === routeId && mapRef.current?.hasLayer(marker)) {
        const pos = prevPositionsRef.current[id];
        if (pos && coords && coords.length > 0) {
          
          const lastIdx = vehicleLastIndexRef.current[id] ?? -1;
          const busIdx = getDirectionalPointIndex(pos, coords, lastIdx);
          vehicleLastIndexRef.current[id] = busIdx; 

          const stopIdx = stop.polyIndex !== undefined ? stop.polyIndex : getNearestPointIndex([stop.lat, stop.lng], coords);
          
          // 🚀 ใช้ actualStation มาเปรียบเทียบลำดับป้าย ป้องกันรถเลยป้ายแล้วเวลานับถอยหลัง
// 🚀 1. บังคับแปลงเป็น String ให้หมด ป้องกันปัญหา 1 !== "1"
const actualStationId = String(vehicleActualStationRef.current[id]);
          
const busStationSequence = stops.findIndex(s => 
  String(s.id) === actualStationId || String(s.name) === actualStationId
);
const targetStopSequence = stops.findIndex(s => String(s.id) === String(stop.id));

let isPassed = false;

// 🚀 2. คำนวณระยะห่าง (Index บนถนน) และป้องกันบัครถวนรอบใหม่ (Wrap-around)
let indexDiff = busIdx - stopIdx;
if (indexDiff < -(coords.length / 2)) indexDiff += coords.length;
else if (indexDiff > (coords.length / 2)) indexDiff -= coords.length;

// 🚀 3. วัดระยะห่างจริง (เมตร) จากตำแหน่งรถปัจจุบัน ถึง พิกัดป้ายเป้าหมาย
const distanceFromStop = L.latLng(pos[0], pos[1]).distanceTo(L.latLng(stop.lat, stop.lng));


if (busStationSequence !== -1 && targetStopSequence !== -1) {
  if (busStationSequence > targetStopSequence) {
    isPassed = true; 
  } else if (busStationSequence === targetStopSequence) {
    // 🚀 4. เปลี่ยนเงื่อนไข: ถ้ารถขยับไปข้างหน้า (indexDiff > 0) *และ* ห่างจากป้ายเกิน 15 เมตร ให้ตัดรอบเลย!
    if (indexDiff > 0 && distanceFromStop > 15) { 
      isPassed = true;
    }
  }
} else {
  // สำรอง (Fallback) กรณี actualStation ไม่มีข้อมูล
  if (indexDiff > 3 && distanceFromStop > 15) {
    isPassed = true;
  }
}

let pathDist = 0;

if (!isPassed) {
  // --- รถยังไม่เลยป้าย (กำลังวิ่งเข้าหา) ---
  if (busIdx <= stopIdx) {
    for (let i = busIdx; i < stopIdx; i++) {
      pathDist += L.latLng(coords[i]).distanceTo(L.latLng(coords[i+1]));
    }
  } else {
    // กรณีรถวนรอบใหม่ (Index รถ > Index ป้าย)
    for (let i = busIdx; i < coords.length - 1; i++) {
      pathDist += L.latLng(coords[i]).distanceTo(L.latLng(coords[i+1]));
    }
    for (let i = 0; i < stopIdx; i++) {
      pathDist += L.latLng(coords[i]).distanceTo(L.latLng(coords[i+1]));
    }
  }
  
  // 🚀 กันบัคถ้าระยะถนน polyline คำนวณได้สั้นกว่าระยะกระจัด
  if (pathDist < distanceFromStop) pathDist = distanceFromStop;

} else {
  // --- 🚀 รถเพิ่งขับออกจากป้ายไป! (คำนวณระยะทางวนกลับมาใหม่ 1 รอบ) ---
  if (busIdx <= stopIdx) {
     // ต้องวิ่งวน 1 รอบเต็ม
    let fullLoopDist = 0;
    for (let i = 0; i < coords.length - 1; i++) fullLoopDist += L.latLng(coords[i]).distanceTo(L.latLng(coords[i+1]));
    
    let normalDist = 0;
    for (let i = busIdx; i < stopIdx; i++) normalDist += L.latLng(coords[i]).distanceTo(L.latLng(coords[i+1]));
    
    pathDist = fullLoopDist + normalDist; 
  } else {
     // กรณีทั่วไป: วิ่งไปให้สุดถนน แล้ววนกลับมาต้นสายถึงป้ายเป้าหมาย
    for (let i = busIdx; i < coords.length - 1; i++) {
      pathDist += L.latLng(coords[i]).distanceTo(L.latLng(coords[i+1]));
    }
    for (let i = 0; i < stopIdx; i++) {
      pathDist += L.latLng(coords[i]).distanceTo(L.latLng(coords[i+1]));
    }
  }
}

// 🚀 คำนวณความเร็วเฉลี่ย
const history = vehicleSpeedHistoryRef.current[id] || [];
let speedKmh = 15; 

if (history.length > 0) {
  speedKmh = history.reduce((a, b) => a + b, 0) / history.length;
}
if (speedKmh < 5) speedKmh = 5;

const speedMpm = speedKmh * (1000 / 60);
const drivingTimeMinutes = pathDist / speedMpm; // เวลาขับรถเพียวๆ (ทศนิยม)

// 🚀 ระบบใหม่: นับจำนวนป้ายที่ต้องแวะจอดระหว่างทาง
let stopsInBetween = 0;
const dwellTimePerStop = 0.5; // ⏱️ ตั้งค่าเวลาจอด: ป้ายละ 0.5 นาที (30 วินาที) สามารถแก้เป็น 1 ได้

stops.forEach(s => {
  if (s.polyIndex === undefined || String(s.id) === String(stop.id)) return; // ไม่นับป้ายเป้าหมาย
  
  const sIdx = s.polyIndex;
  
  if (!isPassed) {
    if (busIdx <= stopIdx) {
      if (sIdx > busIdx && sIdx < stopIdx) stopsInBetween++;
    } else {
      if (sIdx > busIdx || sIdx < stopIdx) stopsInBetween++;
    }
  } else {
    // กรณีรถเพิ่งเลยป้ายไป ต้องวิ่งวนกลับมาใหม่ (ผ่านทุกป้าย)
    if (busIdx <= stopIdx) {
      stopsInBetween = stops.length - 1; 
    } else {
      if (sIdx > busIdx || sIdx < stopIdx) stopsInBetween++;
    }
  }
});

// แอบดูว่าระบบบวกเวลาจอดเพิ่มกี่นาที
console.log(`[ETA Debug] เวลาวิ่งเพียวๆ: ${drivingTimeMinutes.toFixed(2)} นาที, แวะอีก ${stopsInBetween} ป้าย (+${stopsInBetween * dwellTimePerStop} นาที)`);

// 🚀 เอาเวลาขับรถ + เวลาแวะจอดป้ายระหว่างทาง แล้วค่อยปัดเศษ
const etaMinutes = Math.floor(drivingTimeMinutes + (stopsInBetween * dwellTimePerStop));

if (etaMinutes < minEtaMinutes) minEtaMinutes = etaMinutes;
}
}
});

setRealEta(minEtaMinutes === Infinity ? null : minEtaMinutes);
}, []); // สิ้นสุดฟังก์ชัน calculateETA

  const updateAvailableCount = useCallback(() => {
    if (!mapRef.current) return;
    let count = 0;
    Object.values(vehiclesRef.current).forEach(marker => {
      if (mapRef.current?.hasLayer(marker)) count++;
    });
    setAvailableCount(count);
    calculateETA(); 
  }, [calculateETA]);

// 🚀 ตั้งค่า Icon 2 ขนาด
  const DEFAULT_STOP_ICON = L.icon({
    iconUrl: "/icons/stop.png",
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });

  const ACTIVE_STOP_ICON = L.icon({
    iconUrl: "/icons/stop.png",
    iconSize: [48, 48], // ขยายใหญ่ขึ้น!
    iconAnchor: [24, 48], // ต้องเลื่อนจุดศูนย์กลางตามด้วย
    popupAnchor: [0, -48],
  });

  /* === GPS Tracking === */
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos: GeolocationPosition) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
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
      (err: GeolocationPositionError) => console.log("GPS Error:", err),
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
    let nearest: Stop | null = null;
    let minDst = Infinity;

    for (const stop of currentStops) {
      const stopLatLng = L.latLng(stop.lat, stop.lng);
      const dst = userLatLng.distanceTo(stopLatLng);
      if (dst < minDst) {
        minDst = dst;
        nearest = stop;
      }
    }

    if (nearest && mapRef.current) {
      setTargetStop(nearest);
      targetStopRef.current = nearest;
      calculateETA();
      mapRef.current.flyTo([nearest.lat, nearest.lng], 19, { animate: true });

      // 🚀 ขยายไอคอนของป้ายที่ใกล้ที่สุด
      if (activeStopMarkerRef.current) {
        activeStopMarkerRef.current.setIcon(DEFAULT_STOP_ICON);
      }
      const nearestMarker = stopMarkersMapRef.current[String(nearest.id)];
      if (nearestMarker) {
        nearestMarker.setIcon(ACTIVE_STOP_ICON);
        activeStopMarkerRef.current = nearestMarker;
      }
    }
  };

  /* === Load Initial Data === */
  useEffect(() => {
    async function loadVehicles() {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/vehicles`);
        const vehicles: Vehicle[] = await res.json();
        vehicles.forEach(v => {
          vehicleRouteMapRef.current[String(v.id)] = v.assigned_route_id;
          // 🚀 เก็บ actualStation ตอนโหลดครั้งแรก
          if (v.actualStation !== undefined) {
            vehicleActualStationRef.current[String(v.id)] = v.actualStation;
          }
        });
      } catch (err) {
        console.error("Failed to load vehicles", err);
      }
    }
    loadVehicles();
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    function waitForMap() {
      if (mapRef.current && LRef.current) {
        clearInterval(interval);
        mapRef.current.flyTo(RSU_CENTER, 16.5, { animate: true, duration: 1.2 });

        // 🚀 ดักจับคลิกที่พื้นที่ว่างบนแผนที่
        // 🚀 ดักจับคลิกที่พื้นที่ว่างบนแผนที่
        mapRef.current.on("click", () => {
          
          // 🚀 เช็คก่อนว่ามีป้ายไหนถูกคลิกเปิดดูอยู่หรือเปล่า? 
          if (targetStopRef.current !== null || activeStopMarkerRef.current !== null) {
            
            // 1. เคลียร์ข้อมูลและซ่อน Card
            setTargetStop(null); 
            targetStopRef.current = null;
            
            // 2. หุบไอคอนที่ขยายอยู่ ให้กลับเป็นปกติ
            if (activeStopMarkerRef.current) {
              activeStopMarkerRef.current.setIcon(DEFAULT_STOP_ICON);
              activeStopMarkerRef.current = null;
            }

            // 3. 🚀 สั่งให้แผนที่บิน (Zoom out) กลับไปจุดศูนย์กลาง เฉพาะตอนที่ปิดป้ายเท่านั้น!
            mapRef.current?.flyTo(RSU_CENTER, 16.5, { animate: true, duration: 0.8 });
          }
          // ถ้าไม่มีป้ายเปิดอยู่ (ผู้ใช้แค่กดเล่นหรือลากแผนที่) โค้ดจะไม่ทำอะไรเลย
        });

        loadRoutesAndStops();
      }
    }

    async function loadRoutesAndStops() {
      const routeIds = ["R01", "R02"];
      for (const routeId of routeIds) {
        try {
          const stopRes = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/route-stops/${routeId}`);
          const stops = (await stopRes.json()) as Stop[];
          
          const stopLayer = L.layerGroup();
          const stopIcon = L.icon({
            iconUrl: "/icons/stop.png",
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32],
          });

          const points = stops.map(p => `${p.lng},${p.lat}`);
          if (points.length > 0) {
            points.push(points[0]);
            const osrmRes = await fetch(`https://router.project-osrm.org/route/v1/driving/${points.join(";")}?overview=full&geometries=geojson`);
            const osrmData = await osrmRes.json();
            
            if (osrmData.routes?.[0]) {
              const coords: [number, number][] = osrmData.routes[0].geometry.coordinates.map((c: number[]) => [c[1], c[0]]);
              routeGeometryRef.current[routeId] = coords; 

              // SEQUENTIAL STOP MAPPING
              let currentSearchIdx = 0;
              stops.forEach(stop => {
                let bestIdx = currentSearchIdx;
                let minDst = Infinity;
                
                for (let i = currentSearchIdx; i < coords.length; i++) {
                  const dst = L.latLng(stop.lat, stop.lng).distanceTo(L.latLng(coords[i][0], coords[i][1]));
                  if (dst < minDst) {
                    minDst = dst;
                    bestIdx = i;
                  }
                }
                stop.polyIndex = bestIdx;
                currentSearchIdx = bestIdx; 
              });

              const routeLayer = L.layerGroup();
              L.polyline(coords, {
                color: routeId === "R01" ? "#FC9186" : "#3B82F6", weight: 5
              }).addTo(routeLayer);
              routeLayersRef.current[routeId] = routeLayer;
              if (routeId === selectedRouteRef.current && mapRef.current) {
                routeLayer.addTo(mapRef.current);
              }
            }
          }

          stopsByRouteRef.current[routeId] = stops;

          stops.forEach((stop) => {
            const marker = L.marker([stop.lat, stop.lng], { icon: DEFAULT_STOP_ICON }).addTo(stopLayer);
            stopMarkersMapRef.current[String(stop.id)] = marker; // เก็บ Marker ไว้เผื่อใช้กับปุ่มใกล้ฉัน

            marker.on("click", (e) => {
              // 🚀 ป้องกันไม่ให้การคลิกทะลุไปโดนพื้นหลังแผนที่ (เดี๋ยวมันจะสั่งปิด Card ซ้อนกัน)
              L.DomEvent.stopPropagation(e);

              // 1. หุบไอคอนป้ายเก่าที่เคยเลือกไว้ (ถ้ามี)
              if (activeStopMarkerRef.current) {
                activeStopMarkerRef.current.setIcon(DEFAULT_STOP_ICON);
              }

              // 2. ขยายขนาดไอคอนป้ายนี้ให้ใหญ่ขึ้น
              marker.setIcon(ACTIVE_STOP_ICON);
              activeStopMarkerRef.current = marker;

              // 3. เซ็ตค่าเป้าหมายเพื่อโชว์ Card
              setTargetStop(stop);
              targetStopRef.current = stop;
              calculateETA();
              
              // 4. ซูมแผนที่เข้าไปหาป้าย (ระดับ 18)
              mapRef.current?.flyTo([stop.lat, stop.lng], 19, { animate: true, duration: 0.8 });
            }); 
          });
          stopLayersRef.current[routeId] = stopLayer;

          if (routeId === selectedRouteRef.current && mapRef.current) {
            stopLayersRef.current[routeId]?.addTo(mapRef.current);
          }

        } catch (err) {
          console.error(`Failed to load route ${routeId}`, err);
        }
      }
    }

    interval = setInterval(waitForMap, 200);
    return () => clearInterval(interval);
  }, []);

  /* === Route Switcher === */
  function handleRouteChange(routeId: string) {
    if (!mapRef.current) return;
    setSelectedRoute(routeId);
    selectedRouteRef.current = routeId;

    Object.values(routeLayersRef.current).forEach(layer => mapRef.current?.removeLayer(layer));
    routeLayersRef.current[routeId]?.addTo(mapRef.current);

    Object.values(stopLayersRef.current).forEach(layer => mapRef.current?.removeLayer(layer));
    stopLayersRef.current[routeId]?.addTo(mapRef.current);

    Object.keys(vehiclesRef.current).forEach(id => {
      const vehicleRoute = vehicleRouteMapRef.current[id];
      const marker = vehiclesRef.current[id];
      if (vehicleRoute === routeId) {
        if (!mapRef.current?.hasLayer(marker)) marker.addTo(mapRef.current!);
      } else {
        if (mapRef.current?.hasLayer(marker)) mapRef.current.removeLayer(marker);
      }
    });

    setTargetStop(null);
    targetStopRef.current = null;

    setTargetStop(null);
    targetStopRef.current = null;
    
    // 🚀 เคลียร์ไอคอนป้ายตอนสลับเส้นทาง
    if (activeStopMarkerRef.current) {
      activeStopMarkerRef.current.setIcon(DEFAULT_STOP_ICON);
      activeStopMarkerRef.current = null;
    }
    
    updateAvailableCount();
  }

  /* === WebSocket Tracking === */
  useEffect(() => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "";
    const socket: Socket = io(backendUrl);

    socket.on("location-update", async (data: LocationUpdateData) => {
      if (!mapRef.current) return;

      const id = String(data.vehicleId || data.id); 
      
      // 🚀 เก็บ actualStation จาก Socket 
      if (data.actualStation !== undefined) {
        vehicleActualStationRef.current[id] = data.actualStation;
      }

      let currentSpeed = 15;
      if (data.speed !== undefined) currentSpeed = Number(data.speed);
      else if (data.velocity !== undefined) currentSpeed = Number(data.velocity);

      if (!vehicleSpeedHistoryRef.current[id]) vehicleSpeedHistoryRef.current[id] = [];
      vehicleSpeedHistoryRef.current[id].push(currentSpeed);
      if (vehicleSpeedHistoryRef.current[id].length > 5) {
        vehicleSpeedHistoryRef.current[id].shift(); 
      }

      let newPos: [number, number] = [Number(data.lat), Number(data.lng)];

      try {
        const osrmUrl = `https://router.project-osrm.org/nearest/v1/driving/${newPos[1]},${newPos[0]}?number=1`;
        const res = await fetch(osrmUrl);
        const osrmData = await res.json();
        if (osrmData.code === "Ok" && osrmData.waypoints.length > 0) {
          newPos = [osrmData.waypoints[0].location[1], osrmData.waypoints[0].location[0]];
        }
      } catch (e) {
        console.error("OSRM Snapping failed", e);
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

    return () => {
      socket.disconnect();
    };
  }, [updateAvailableCount]);

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