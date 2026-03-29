import React, { useState } from "react";
import ReactDOM from "react-dom";
import { Stop } from "../types";

interface StopInfoCardProps {
  targetStop: Stop | null;
  eta: number | null;
  onFindNearest: () => void;
}

// สกัด Style ออกมาด้านนอก เพื่อให้อ่านโค้ดง่ายและคลีน
const MODAL_OVERLAY_STYLE: React.CSSProperties = {
  position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
  backgroundColor: "rgba(0, 0, 0, 0.8)", display: "flex", justifyContent: "center", alignItems: "center",
  zIndex: 99999, backdropFilter: "blur(3px)"
};

const MODAL_CONTENT_STYLE: React.CSSProperties = {
  position: "relative", maxWidth: "90vw", maxHeight: "85vh",
  backgroundColor: "#fff", padding: "6px", borderRadius: "16px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column"
};

const CLOSE_BTN_STYLE: React.CSSProperties = {
  position: "absolute", top: "-15px", right: "-15px",
  backgroundColor: "#ef4444", color: "white", border: "none", borderRadius: "50%",
  width: "40px", height: "40px", fontSize: "24px", fontWeight: "bold",
  cursor: "pointer", boxShadow: "0 4px 10px rgba(0,0,0,0.3)", zIndex: 10,
  display: "flex", justifyContent: "center", alignItems: "center"
};

export default function StopInfoCard({ targetStop, eta, onFindNearest }: StopInfoCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  let statusText = "กำลังคำนวณ...";
  let statusClass = "idle";
  
  if (targetStop) {
    if (eta === null) { statusText = "ยังไม่มีรถในสายนี้"; statusClass = "busy"; } 
    else if (eta === 0) { statusText = "กำลังมาถึง!"; statusClass = "active"; } 
    else { statusText = "กำลังเดินทาง"; statusClass = "active"; }
  }

  const imgUrl = targetStop?.imageUrl;

  return (
    <div className="stop-info-wrapper">
      
      {/* --- ส่วนของ Modal รูปภาพ --- */}
      {isModalOpen && imgUrl && typeof document !== "undefined" && ReactDOM.createPortal(
        <div onClick={() => setIsModalOpen(false)} style={MODAL_OVERLAY_STYLE}>
          <div onClick={(e) => e.stopPropagation()} style={MODAL_CONTENT_STYLE}>
            <button onClick={() => setIsModalOpen(false)} style={CLOSE_BTN_STYLE} title="ปิดรูปภาพ">×</button>
            <img 
              src={imgUrl} 
              alt={targetStop?.nameTh || "รูปขยายป้ายรถเมล์"} 
              style={{ maxWidth: "100%", maxHeight: "calc(85vh - 12px)", objectFit: "contain", borderRadius: "10px" }} 
            />
          </div>
        </div>,
        document.body
      )}

      {/* --- ส่วนของการ์ดข้อมูลป้าย --- */}
      {targetStop && (
        <div className="rsu-stop-card-compact">
          {imgUrl && (
            <div className="sc-image-container" onClick={() => setIsModalOpen(true)} style={{ cursor: 'pointer' }} title="คลิกเพื่อขยายรูป">
              <img src={imgUrl} alt={targetStop?.nameTh || "รูปป้าย"} className="sc-stop-image" />
            </div>
          )}
          <div className="sc-header">
            <div className="sc-selected-stop">
              <div className="sc-stop-name">{targetStop?.nameTh || targetStop?.name}</div>
            </div>
          </div>
          <div className="sc-body">
            <div className="sc-eta-container">
              <div className="sc-eta-label">เวลารอรถโดยประมาณ (ETA)</div>
              <div className="sc-eta-value">
                {eta !== null ? (<><span className="sc-number">{eta === 0 ? "< 1" : eta}</span><span className="sc-unit">นาที</span></>) : (<span className="sc-placeholder">-</span>)}
              </div>
            </div>
            <div className="sc-status-container">
              <span className={`rsu-sdot ${statusClass}`} />
              <span className="sc-status-text">{statusText}</span>
            </div>
          </div>
        </div>
      )}

      {/* --- ปุ่มใกล้ฉัน --- */}
      <button className="gps-locate-btn" onClick={onFindNearest} title="หาป้ายที่ใกล้ฉันที่สุด">
        <img src="/icons/live.png" alt="ตำแหน่งของฉัน" style={{ width: '24px', height: '24px', objectFit: 'contain' }} />
      </button>

    </div>
  );
}