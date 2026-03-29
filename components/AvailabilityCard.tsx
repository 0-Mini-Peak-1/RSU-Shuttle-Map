import React from "react";

interface Props {
  count: number;
}

export default function AvailabilityCard({ count }: Props) {
  return (
    <div className="rsu-avail">
      <div className={`rsu-avail-dot ${count > 0 ? 'active' : 'inactive'}`} />
      
      <div className="rsu-avail-text-wrap">
        <span className="rsu-avail-lbl">รถรางให้บริการ</span>
        <span className="rsu-avail-num">{count} คัน</span>
      </div>
    </div>
  );
}