import { STATUS_COLOR } from "../constants";

/**
 * Injects Leaflet CSS and Google Fonts into <head> once.
 * Safe to call multiple times — runs only on first invocation.
 */
export const injectLeafletDeps = (() => {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const deps = [
      "https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap",
      "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
    ];
    deps.forEach((href) => {
      const link = document.createElement("link");
      link.rel  = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    });
  };
})();

/**
 * Dynamically loads the Leaflet JS bundle.
 * Resolves immediately if already loaded.
 * @returns {Promise<L>} Leaflet instance
 */
export function loadLeaflet() {
  return new Promise((resolve) => {
    if (window.L) return resolve(window.L);
    const script = document.createElement("script");
    script.src    = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => resolve(window.L);
    document.head.appendChild(script);
  });
}

/**
 * Builds the inner HTML for a shuttle map marker.
 * @param {string} color - CSS color string
 * @returns {string} HTML string
 */
export function buildMarkerHtml(color) {
  return `
    <div style="
      width:34px; height:34px; background:${color};
      border-radius:50% 50% 50% 0; transform:rotate(-45deg);
      border:2.5px solid #fff; box-shadow:0 3px 12px rgba(0,0,0,0.22);
      display:flex; align-items:center; justify-content:center; font-size:15px;
    ">
      <span style="transform:rotate(45deg); display:block">🚌</span>
    </div>
  `;
}

/**
 * Builds a Leaflet popup HTML string for a shuttle.
 * @param {object} shuttle
 * @returns {string} HTML string
 */
export function buildPopupHtml(shuttle) {
  const color = STATUS_COLOR[shuttle.status] ?? "#4a90d9";
  return `
    <div style="font-family:'Prompt',sans-serif; min-width:140px">
      <b style="font-size:.88rem; color:#1a1a2e">${shuttle.name}</b><br/>
      <span style="font-size:.72rem; color:#999">Route: ${shuttle.route}</span><br/>
      <span style="font-size:.72rem; color:#444">Speed: ${shuttle.speed} km/h</span><br/>
      <span style="font-size:.72rem; font-weight:600; color:${color}; text-transform:capitalize">
        ● ${shuttle.status}
      </span>
    </div>
  `;
}

/**
 * Clears existing markers from the map and places new ones.
 * Mutates the provided markersRef.current map.
 *
 * @param {L}        L          - Leaflet instance
 * @param {L.Map}    map        - Leaflet map instance
 * @param {object[]} shuttles   - Array of shuttle objects
 * @param {object}   markersRef - React ref holding { [id]: L.Marker }
 */
export function placeMarkers(L, map, shuttles, markersRef) {
  // Remove old markers
  Object.values(markersRef.current).forEach((m) => map.removeLayer(m));
  markersRef.current = {};

  shuttles.forEach((shuttle) => {
    const color = STATUS_COLOR[shuttle.status] ?? "#4a90d9";

    const icon = L.divIcon({
      html:        buildMarkerHtml(color),
      iconSize:    [34, 34],
      iconAnchor:  [17, 34],
      popupAnchor: [0, -38],
      className:   "",
    });

    const marker = L
      .marker([shuttle.lat, shuttle.lng], { icon })
      .addTo(map)
      .bindPopup(buildPopupHtml(shuttle), { maxWidth: 190 });

    markersRef.current[shuttle.id] = marker;
  });
}