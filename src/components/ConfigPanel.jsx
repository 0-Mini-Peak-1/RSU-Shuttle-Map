import { STATUS_BG, STATUS_TEXT } from "../constants";

/**
 * ConfigPanel
 * Collapsible settings panel anchored to the top-left of the map.
 * Handles endpoint config, polling interval, and start/stop controls.
 *
 * @param {{
 *   show:          boolean,
 *   onToggle:      () => void,
 *   tracking:      boolean,
 *   endpoint:      string,
 *   onEndpoint:    (v: string) => void,
 *   pollSec:       number,
 *   onPollSec:     (v: number) => void,
 *   onStart:       () => void,
 *   onStop:        () => void,
 *   shuttles:      object[],
 * }} props
 */
export default function ConfigPanel({
  show,
  onToggle,
  tracking,
  endpoint,
  onEndpoint,
  pollSec,
  onPollSec,
  onStart,
  onStop,
  shuttles,
}) {
  return (
    <>
      {/* Toggle button */}
      <button className="rsu-cfg-btn" onClick={onToggle}>
        ⚙ {tracking ? "Live" : "Configure"}
        {tracking && <span className="rsu-live-dot" />}
      </button>

      {/* Slide-down panel */}
      {show && (
        <div className="rsu-cfg-panel">
          <div className="rsu-cfg-title">Tracker Settings</div>

          <label className="rsu-cfg-label">Endpoint URL</label>
          <input
            className="rsu-cfg-input"
            value={endpoint}
            onChange={(e) => onEndpoint(e.target.value)}
            placeholder="http://phone-ip:8080/api/location/latest"
            disabled={tracking}
          />

          <label className="rsu-cfg-label">Poll every (seconds)</label>
          <input
            className="rsu-cfg-input"
            type="number"
            min={1}
            max={60}
            value={pollSec}
            onChange={(e) => onPollSec(Number(e.target.value))}
            disabled={tracking}
          />

          <button className="rsu-action primary" onClick={onStart} disabled={tracking}>
            ▶ Start Live Tracking
          </button>
          <button className="rsu-action ghost" onClick={onStop} disabled={!tracking}>
            ■ Stop / Use Mock Data
          </button>

          <div className="rsu-div" />

          <div className="rsu-cfg-title">Active Shuttles</div>
          <div className="rsu-bus-list">
            {shuttles.map((s) => (
              <div key={s.id} className="rsu-bus-row">
                <span>🚌 {s.name}</span>
                <span
                  className="rsu-bus-badge"
                  style={{
                    background: STATUS_BG[s.status]   ?? "#e3f2fd",
                    color:      STATUS_TEXT[s.status]  ?? "#1565c0",
                  }}
                >
                  {s.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}