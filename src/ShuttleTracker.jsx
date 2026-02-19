import { useState, useEffect } from "react";

import styles            from "./styles/shuttle.css.js";
import { DEFAULT_STOP, DEFAULT_ETA, DEFAULT_ENDPOINT, DEFAULT_POLL_SEC } from "./constants";
import { useLeafletMap }     from "./hooks/useLeafletMap";
import { useShuttleTracker } from "./hooks/useShuttleTracker";

import AvailabilityCard from "./components/AvailabilityCard";
import StopInfoCard     from "./components/StopInfoCard";
import ConfigPanel      from "./components/ConfigPanel";

// Inject stylesheet once
function useGlobalStyles() {
  useEffect(() => {
    if (document.getElementById("rsu-styles")) return;
    const el = document.createElement("style");
    el.id          = "rsu-styles";
    el.textContent = styles;
    document.head.appendChild(el);
  }, []);
}

export default function ShuttleTracker() {
  useGlobalStyles();

  // ── Config state ───────────────────────────────────────────
  const [showCfg,   setShowCfg]   = useState(false);
  const [endpoint,  setEndpoint]  = useState(DEFAULT_ENDPOINT);
  const [pollSec,   setPollSec]   = useState(DEFAULT_POLL_SEC);

  // ── Map initialisation ─────────────────────────────────────
  const { mapRef, LRef, markersRef } = useLeafletMap();

  // ── Live tracking ──────────────────────────────────────────
  const { tracking, shuttles, startTracking, stopTracking } = useShuttleTracker({
    endpoint,
    pollSec,
    LRef,
    mapRef,
    markersRef,
  });

  // ── Derived display values ─────────────────────────────────
  const availableCount = shuttles.filter((s) => s.status !== "busy").length;
  const topStatus      = shuttles[0]?.status ?? "idle";

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
          Made in Rangsit University<br />
          Version: Beta 0.2
        </div>

      </div>

      {/* ── Bottom gradient bar ── */}
      <div className="rsu-bar" />

    </div>
  );
}