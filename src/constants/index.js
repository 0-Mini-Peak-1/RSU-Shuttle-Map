// ── Map configuration ──────────────────────────────────────
export const RSU_CENTER = [13.966927, 100.584509];

export const RSU_BOUNDS = [
  [13.956, 100.574], // SW
  [13.978, 100.595], // NE
];

export const MAP_OPTIONS = {
  zoom: 16,
  minZoom: 15,
  maxZoom: 18,
  maxBoundsViscosity: 1.0, // hard-locked to RSU campus
  zoomControl: false,
  attributionControl: false,
};

// ── Mock shuttle data (used before real API is connected) ──
export const MOCK_SHUTTLES = [
  {
    id: "SH-01",
    name: "Shuttle A",
    lat: 13.7558,
    lng: 100.6155,
    speed: 12,
    status: "busy",
    route: "Campus Loop",
  },
  {
    id: "SH-02",
    name: "Shuttle B",
    lat: 13.7572,
    lng: 100.6188,
    speed: 0,
    status: "idle",
    route: "Campus Loop",
  },
];

// ── Status color maps ──────────────────────────────────────
export const STATUS_COLOR = {
  busy:   "#e91e8c",
  idle:   "#fb8c00",
  active: "#43a047",
};

export const STATUS_BG = {
  busy:   "#fce4ec",
  idle:   "#fff3e0",
  active: "#e8f5e9",
};

export const STATUS_TEXT = {
  busy:   "#c62828",
  idle:   "#e65100",
  active: "#2e7d32",
};

// ── Default UI state ───────────────────────────────────────
export const DEFAULT_STOP = "Building 17";
export const DEFAULT_ETA  = "2 Min";
export const DEFAULT_ENDPOINT = "http://192.168.1.100:8080/api/location/latest";
export const DEFAULT_POLL_SEC = 3;