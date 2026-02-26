import React from "react";

interface Props {
  count: number;
}

export default function AvailabilityCard({ count }: Props) {
  return (
    <div className="rsu-avail">
      <div className="rsu-avail-lbl">Availability</div>
      <div className="rsu-avail-num">{count}</div>
      <div className="rsu-avail-sub">Shuttle Bus<br />Available</div>
    </div>
  );
}