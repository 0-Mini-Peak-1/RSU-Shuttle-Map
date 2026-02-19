/**
 * StopInfoCard
 * Shows the selected stop name, ETA, and shuttle status in the bottom-left corner.
 *
 * @param {{ stopName: string, eta: string, status: string }} props
 */
export default function StopInfoCard({ stopName, eta, status }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <div className="rsu-stop-wrap">
      <div>
        <span className="rsu-stop-chip">{stopName}</span>
      </div>
      <div className="rsu-stop-info">
        <span>ETA: {eta}</span>
        <span style={{ color: "#ddd" }}>|</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          Status: {label}
          <span className={`rsu-sdot ${status}`} />
        </span>
      </div>
    </div>
  );
}