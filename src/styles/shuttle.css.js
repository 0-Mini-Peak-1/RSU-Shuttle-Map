const styles = `
/* ── App shell ─────────────────────────────────────────── */
.rsu-app {
  font-family: 'Prompt', sans-serif;
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #dfe3ee;
}

/* ── Header ─────────────────────────────────────────────── */
.rsu-hdr {
  background: linear-gradient(120deg, #e91e8c 0%, #c2185b 28%, #7c3aed 65%, #4a90d9 100%);
  padding: 18px 28px 14px;
  text-align: center;
  flex-shrink: 0;
  box-shadow: 0 2px 16px rgba(0,0,0,0.2);
}
.rsu-hdr h1 {
  font-size: 1.3rem;
  font-weight: 700;
  color: #fff;
  margin: 0 0 2px;
  letter-spacing: 0.01em;
}
.rsu-hdr p {
  font-size: 0.8rem;
  font-weight: 400;
  color: rgba(255,255,255,0.88);
  margin: 0;
}

/* ── Map wrapper ─────────────────────────────────────────── */
.rsu-map-wrap { flex: 1; position: relative; }
#rsu-map      { width: 100%; height: 100%; }

/* Leaflet overrides */
.leaflet-control-attribution { display: none !important; }
.leaflet-control-zoom a {
  font-family: 'Prompt', sans-serif !important;
  border-radius: 8px !important;
  color: #444 !important;
  box-shadow: 0 2px 8px rgba(0,0,0,0.14) !important;
}
.leaflet-popup-content-wrapper {
  border-radius: 12px !important;
  box-shadow: 0 4px 20px rgba(0,0,0,0.15) !important;
  padding: 0 !important;
}
.leaflet-popup-content       { margin: 12px 16px !important; }
.leaflet-popup-tip-container { display: none !important; }

/* ── Availability card (top-right) ───────────────────────── */
.rsu-avail {
  position: absolute;
  top: 16px;
  right: 16px;
  background: #fff;
  border-radius: 16px;
  padding: 14px 20px 12px;
  text-align: center;
  box-shadow: 0 4px 20px rgba(0,0,0,0.13);
  z-index: 500;
  min-width: 115px;
}
.rsu-avail-lbl { font-size: 0.7rem;  font-weight: 500; color: #999; margin-bottom: 1px; }
.rsu-avail-num { font-size: 2.9rem;  font-weight: 700; color: #1a1a2e; line-height: 1; margin-bottom: 1px; }
.rsu-avail-sub { font-size: 0.7rem;  font-weight: 500; color: #666; line-height: 1.35; }

/* ── Stop info card (bottom-left) ────────────────────────── */
.rsu-stop-wrap { position: absolute; bottom: 28px; left: 16px; z-index: 500; }

.rsu-stop-chip {
  display: inline-flex;
  align-items: center;
  background: #fff;
  border-radius: 99px;
  padding: 6px 18px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #1a1a2e;
  box-shadow: 0 2px 10px rgba(0,0,0,0.12);
  margin-bottom: 8px;
}

.rsu-stop-info {
  background: #fff;
  border-radius: 12px;
  padding: 10px 18px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.12);
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.8rem;
  font-weight: 500;
  color: #333;
}

/* Status dot */
.rsu-sdot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  display: inline-block;
  margin-left: 4px;
  flex-shrink: 0;
}
.rsu-sdot.busy   { background: #e53935; box-shadow: 0 0 0 3px rgba(229,57,53,0.2); }
.rsu-sdot.active { background: #43a047; box-shadow: 0 0 0 3px rgba(67,160,71,0.2); }
.rsu-sdot.idle   { background: #fb8c00; box-shadow: 0 0 0 3px rgba(251,140,0,0.2); }

/* ── Watermark ────────────────────────────────────────────── */
.rsu-wm {
  position: absolute;
  bottom: 8px;
  right: 12px;
  z-index: 500;
  font-size: 0.6rem;
  color: #aaa;
  text-align: right;
  line-height: 1.6;
  pointer-events: none;
}

/* ── Configure button (top-left) ──────────────────────────── */
.rsu-cfg-btn {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 600;
  background: #fff;
  border: none;
  border-radius: 10px;
  padding: 8px 14px;
  font-family: 'Prompt', sans-serif;
  font-size: 0.75rem;
  font-weight: 600;
  color: #555;
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(0,0,0,0.13);
  display: flex;
  align-items: center;
  gap: 7px;
  transition: box-shadow 0.18s;
}
.rsu-cfg-btn:hover { box-shadow: 0 4px 18px rgba(0,0,0,0.18); }

.rsu-live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #43a047;
  box-shadow: 0 0 0 3px rgba(67,160,71,0.25);
  animation: livePulse 2s infinite;
}
@keyframes livePulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }

/* ── Config panel ─────────────────────────────────────────── */
.rsu-cfg-panel {
  position: absolute;
  top: 54px;
  left: 16px;
  z-index: 600;
  background: #fff;
  border-radius: 14px;
  padding: 18px;
  box-shadow: 0 6px 28px rgba(0,0,0,0.15);
  width: 248px;
  animation: cfgIn 0.18s ease;
}
@keyframes cfgIn {
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: none; }
}

.rsu-cfg-title {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #bbb;
  margin-bottom: 12px;
}

.rsu-cfg-label {
  display: block;
  font-size: 0.72rem;
  font-weight: 600;
  color: #555;
  margin-bottom: 4px;
}

.rsu-cfg-input {
  width: 100%;
  border: 1.5px solid #eee;
  border-radius: 8px;
  padding: 7px 10px;
  font-family: 'Prompt', sans-serif;
  font-size: 0.72rem;
  color: #333;
  outline: none;
  box-sizing: border-box;
  margin-bottom: 10px;
  transition: border-color 0.2s;
}
.rsu-cfg-input:focus    { border-color: #e91e8c; }
.rsu-cfg-input:disabled { background: #fafafa; color: #bbb; }

.rsu-action {
  width: 100%;
  padding: 9px;
  border: none;
  border-radius: 8px;
  font-family: 'Prompt', sans-serif;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  margin-bottom: 6px;
  transition: opacity 0.15s;
}
.rsu-action:hover            { opacity: 0.88; }
.rsu-action:disabled         { opacity: 0.35; cursor: not-allowed; }
.rsu-action.primary          { background: linear-gradient(90deg,#e91e8c,#7c3aed); color: #fff; }
.rsu-action.ghost            { background: #f5f5f5; color: #888; }

.rsu-div { height: 1px; background: #f2f2f2; margin: 10px 0; }

/* Shuttle list inside config panel */
.rsu-bus-list { display: flex; flex-direction: column; gap: 5px; max-height: 100px; overflow-y: auto; }
.rsu-bus-row  {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.72rem;
  color: #444;
  padding: 3px 0;
}
.rsu-bus-badge {
  font-size: 0.62rem;
  font-weight: 600;
  padding: 2px 9px;
  border-radius: 99px;
  text-transform: capitalize;
}

/* ── Bottom gradient bar ──────────────────────────────────── */
.rsu-bar {
  height: 5px;
  flex-shrink: 0;
  background: linear-gradient(90deg, #e91e8c, #7c3aed, #4a90d9);
}
/* ── Select button ──────────────────────────────────── */
.route-selector {
  position: absolute;
  top: 90px;
  left: 20px;
  z-index: 999;
  display: flex;
  gap: 10px;
}

.route-btn {
  padding: 8px 16px;
  border-radius: 20px;
  border: none;
  background: white;
  cursor: pointer;
  font-weight: 600;
  box-shadow: 0 4px 10px rgba(0,0,0,0.15);
  transition: 0.3s;
}

.route-btn:hover {
  transform: translateY(-2px);
}

.route-btn.active {
  background: #FC9186;
  color: white;
}

/* ========================================================
   NEW STOP INFO CARD (Glassmorphism - NO Dropdown)
======================================================== */
.rsu-stop-card-new {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  max-width: 400px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  padding: 16px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 1px solid rgba(255, 255, 255, 0.5);
}

.sc-header {
  display: flex;
  gap: 8px;
  align-items: stretch;
}

.sc-selected-stop {
  flex: 1;
  display: flex;
  align-items: center;
  background: #f4f5f7;
  border-radius: 12px;
  padding: 12px 14px;
  border: 1px solid #e1e4e8;
  overflow: hidden;
}

.sc-icon { font-size: 1.1rem; margin-right: 10px; flex-shrink: 0; }

.sc-stop-name {
  font-family: 'Prompt', sans-serif;
  font-size: 0.85rem;
  font-weight: 600;
  color: #1a1a2e;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sc-gps-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #4a90d9, #7c3aed);
  border: none;
  border-radius: 12px;
  padding: 8px 12px;
  color: white;
  font-family: 'Prompt', sans-serif;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3);
  flex-shrink: 0;
}
.sc-gps-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(124, 58, 237, 0.4); }
.sc-gps-btn:active { transform: translateY(0); }
.sc-gps-btn .gps-icon { font-size: 1.1rem; margin-bottom: 2px; }
.sc-gps-btn span { font-size: 0.65rem; font-weight: 600; }

.sc-body {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fff;
  border-radius: 14px;
  padding: 12px 16px;
  border: 1px solid #eee;
}

.sc-eta-container { display: flex; flex-direction: column; }
.sc-eta-label { font-size: 0.7rem; font-weight: 500; color: #888; margin-bottom: 2px; }
.sc-eta-value { display: flex; align-items: baseline; gap: 4px; }
.sc-number { font-size: 1.8rem; font-weight: 700; color: #1a1a2e; line-height: 1; }
.sc-unit { font-size: 0.9rem; font-weight: 600; color: #555; }
.sc-placeholder { font-size: 1.2rem; color: #ccc; font-weight: 600; }

.sc-status-container {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #f8f9fa;
  padding: 6px 12px;
  border-radius: 99px;
}
.sc-status-text { font-size: 0.75rem; font-weight: 600; color: #444; }

/* จุดของผู้ใช้ (สีฟ้ากระพริบ) บนแผนที่ */
.user-loc-marker { display: flex; justify-content: center; align-items: center; }
.user-pulse {
  width: 14px;
  height: 14px;
  background-color: #2196F3;
  border-radius: 50%;
  border: 2px solid white;
  box-shadow: 0 0 0 0 rgba(33, 150, 243, 0.7);
  animation: pulse 1.5s infinite;
}
@keyframes pulse {
  0%   { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(33, 150, 243, 0.7); }
  70%  { transform: scale(1); box-shadow: 0 0 0 10px rgba(33, 150, 243, 0); }
  100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(33, 150, 243, 0); }
}
`;



export default styles;