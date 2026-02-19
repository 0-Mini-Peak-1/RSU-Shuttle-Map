/**
 * AvailabilityCard
 * Displays the number of non-busy shuttles in the top-right corner of the map.
 *
 * @param {{ count: number }} props
 */
export default function AvailabilityCard({ count }) {
  return (
    <div className="rsu-avail">
      <div className="rsu-avail-lbl">Availability</div>
      <div className="rsu-avail-num">{count}</div>
      <div className="rsu-avail-sub">
        Shuttle Bus<br />Available
      </div>
    </div>
  );
}