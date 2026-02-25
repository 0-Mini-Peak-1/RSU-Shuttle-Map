/**
 * StopInfoCard
 * Clean UI without dropdown. Shows the stop name clicked by user and ETA.
 */
export default function StopInfoCard({ targetStop, eta, onFindNearest }) {
  
  let statusText = "เลือกป้ายเพื่อดูเวลา";
  let statusClass = "idle";
  
  if (targetStop) {
    if (eta === null) {
      statusText = "ยังไม่มีรถในสายนี้";
      statusClass = "busy"; // แดง
    } else if (eta === 0) {
      statusText = "กำลังมาถึง!";
      statusClass = "active"; // เขียว
    } else {
      statusText = "กำลังเดินทาง";
      statusClass = "active";
    }
  }

  return (
    <div className="rsu-stop-card-new">
      <div className="sc-header">
        <div className="sc-selected-stop">
          <div className="sc-icon">🚏</div>
          <div className="sc-stop-name">
            {targetStop ? (targetStop.nameTh || targetStop.name) : "คลิกเลือกป้ายรถเมล์บนแผนที่"}
          </div>
        </div>
        
        <button 
          className="sc-gps-btn" 
          onClick={onFindNearest} 
          title="หาป้ายที่ใกล้ฉันที่สุด"
        >
          <div className="gps-icon">📍</div>
          <span>ใกล้ฉัน</span>
        </button>
      </div>

      <div className="sc-body">
        <div className="sc-eta-container">
          <div className="sc-eta-label">เวลารอรถโดยประมาณ (ETA)</div>
          <div className="sc-eta-value">
            {targetStop && eta !== null ? (
              <>
                {/* เปลี่ยนเงื่อนไขแสดงผลเป็น < 1 แทน Now */}
                <span className="sc-number">{eta === 0 ? "< 1" : eta}</span>
                <span className="sc-unit">นาที</span>
              </>
            ) : (
              <span className="sc-placeholder">-</span>
            )}
          </div>
        </div>

        <div className="sc-status-container">
          <span className={`rsu-sdot ${statusClass}`} />
          <span className="sc-status-text">{statusText}</span>
        </div>
      </div>
    </div>
  );
}