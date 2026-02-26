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
  
  let minEtaMinutes = Infinity;
  
  Object.keys(vehiclesRef.current).forEach(id => {
    const route = vehicleRouteMapRef.current[id];
    const marker = vehiclesRef.current[id];
    
    if (route === routeId && mapRef.current?.hasLayer(marker)) {
      const pos = prevPositionsRef.current[id];
      if (pos && coords && coords.length > 0) {
        
        // 🚀 1. ดึง Index ของรถ (แบบล็อกทิศทางไม่ให้วาร์ปข้ามเลน)
        const lastIdx = vehicleLastIndexRef.current[id] ?? -1;
        const busIdx = getDirectionalPointIndex(pos, coords, lastIdx);
        vehicleLastIndexRef.current[id] = busIdx; 

        // 🚀 2. ดึง Index ของป้าย ที่เรา Mapping ไว้แล้วอย่างถูกต้อง
        const stopIdx = stop.polyIndex !== undefined ? stop.polyIndex : getNearestPointIndex([stop.lat, stop.lng], coords);
        
        let pathDist = 0;

        // 🚀 3. คำนวณระยะทางตาม Polyline เพียวๆ (ตัดเรื่องระยะห่าง 50m ทิ้ง)
        if (busIdx <= stopIdx) {
          // รถกำลังวิ่งไปหาป้าย
          for (let i = busIdx; i < stopIdx; i++) {
            pathDist += L.latLng(coords[i]).distanceTo(L.latLng(coords[i+1]));
          }
        } else {
          // รถวิ่งเลยป้ายไปแล้ว 
          // เช็คว่าถ้าเพิ่งเลยไปนิดเดียว (ไม่เกิน 15 จุดบนถนน ~ 50 เมตร) ถือว่าชดเชย GPS คลาดเคลื่อน
          if (busIdx - stopIdx <= 15) {
            pathDist = 0; 
          } else {
            // ถ้าเลยไปไกลแล้ว แปลว่าต้องวิ่งวนลูปกลับมาใหม่
            for (let i = busIdx; i < coords.length - 1; i++) {
              pathDist += L.latLng(coords[i]).distanceTo(L.latLng(coords[i+1]));
            }
            for (let i = 0; i < stopIdx; i++) {
              pathDist += L.latLng(coords[i]).distanceTo(L.latLng(coords[i+1]));
            }
          }
        }

        // 🚀 4. คำนวณ Average Speed
        const history = vehicleSpeedHistoryRef.current[id] || [];
        let speedKmh = 15; // ค่าเริ่มต้น

        if (history.length > 0) {
          speedKmh = history.reduce((a, b) => a + b, 0) / history.length;
        }
        if (speedKmh < 5) speedKmh = 5;

        const speedMpm = speedKmh * (1000 / 60);
        const etaMinutes = Math.floor(pathDist / speedMpm);

        if (etaMinutes < minEtaMinutes) minEtaMinutes = etaMinutes;
      }
    }
  });

  setRealEta(minEtaMinutes === Infinity ? null : minEtaMinutes);
}, []);

  const updateAvailableCount = useCallback(() => {
    if (!mapRef.current) return;
    let count = 0;
    Object.values(vehiclesRef.current).forEach(marker => {
      if (mapRef.current?.hasLayer(marker)) count++;
    });
    setAvailableCount(count);
    calculateETA(); 
  }, [calculateETA]);

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
      mapRef.current.flyTo([nearest.lat, nearest.lng], 18, { animate: true });
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
        mapRef.current.flyTo(RSU_CENTER, 17, { animate: true, duration: 1.2 });
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

              // 🚀 SEQUENTIAL STOP MAPPING: Map ป้ายเข้ากับถนนแบบไล่ลำดับ!
              let currentSearchIdx = 0;
              stops.forEach(stop => {
                let bestIdx = currentSearchIdx;
                let minDst = Infinity;
                
                // หาจุดถนนที่ใกล้ที่สุด โดยเริ่มหาจากป้ายก่อนหน้าเสมอ (ป้ายหลังๆ จะไม่เด้งกลับมาต้นสาย)
                for (let i = currentSearchIdx; i < coords.length; i++) {
                  const dst = L.latLng(stop.lat, stop.lng).distanceTo(L.latLng(coords[i][0], coords[i][1]));
                  if (dst < minDst) {
                    minDst = dst;
                    bestIdx = i;
                  }
                }
                stop.polyIndex = bestIdx;
                currentSearchIdx = bestIdx; // ป้ายถัดไปต้องอยู่ไกลกว่าป้ายนี้
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

          // อัปเดต state และ marker ให้ป้าย หลังจากทำการ Map เสร็จแล้ว
          stopsByRouteRef.current[routeId] = stops;

          stops.forEach((stop) => {
            const marker = L.marker([stop.lat, stop.lng], { icon: stopIcon }).addTo(stopLayer);
            marker.on("click", () => {
              setTargetStop(stop);
              targetStopRef.current = stop;
              calculateETA();
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
    updateAvailableCount();
  }

  /* === WebSocket Tracking === */
  useEffect(() => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "";
    const socket: Socket = io(backendUrl);

    socket.on("location-update", async (data: LocationUpdateData) => { // สังเกตว่าเติม async เข้ามา
      if (!mapRef.current) return;

      const id = String(data.vehicleId || data.id); 
      
      // 🚀 1. อัปเดต Average Speed
      let currentSpeed = 15;
      if (data.speed !== undefined) currentSpeed = Number(data.speed);
      else if (data.velocity !== undefined) currentSpeed = Number(data.velocity);

      if (!vehicleSpeedHistoryRef.current[id]) vehicleSpeedHistoryRef.current[id] = [];
      vehicleSpeedHistoryRef.current[id].push(currentSpeed);
      // เก็บย้อนหลังแค่ 5-10 วินาทีล่าสุด
      if (vehicleSpeedHistoryRef.current[id].length > 5) {
        vehicleSpeedHistoryRef.current[id].shift(); 
      }

      // 🚀 2. ดึงพิกัดตั้งต้น
      let newPos: [number, number] = [Number(data.lat), Number(data.lng)];

      // 🚀 3. Map Matching (Snap to Road) แบบไม่ต้องพึ่ง Polyline 
      // คำเตือน: ถ้า User เปิดหน้าเว็บพร้อมกัน 100 คน การยิง OSRM แบบ Public รัวๆ อาจจะโดนบล็อกได้ 
      // (ทางที่ดีที่สุดควรให้ Backend เป็นคนยิง API นี้ แล้วส่งพิกัดที่ Snap แล้วมาให้ Frontend แทน)
      try {
        const osrmUrl = `https://router.project-osrm.org/nearest/v1/driving/${newPos[1]},${newPos[0]}?number=1`;
        const res = await fetch(osrmUrl);
        const osrmData = await res.json();
        if (osrmData.code === "Ok" && osrmData.waypoints.length > 0) {
          // OSRM คืนค่าเป็น [lng, lat] ต้องสลับกลับเป็น [lat, lng]
          newPos = [osrmData.waypoints[0].location[1], osrmData.waypoints[0].location[0]];
        }
      } catch (e) {
        console.error("OSRM Snapping failed", e);
        // ถ้า API พัง ก็ใช้พิกัดจาก GPS เพียวๆ ไปก่อน
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