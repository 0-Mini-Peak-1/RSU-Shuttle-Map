import React, { useState } from "react";
import ReactDOM from "react-dom";
import { Stop } from "../types";

interface StopInfoCardProps {
  targetStop: Stop | null;
  eta: number | null;
  onFindNearest: () => void;
}

export default function StopInfoCard({ targetStop, eta, onFindNearest }: StopInfoCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  let statusText = "กำลังคำนวณ...";
  let statusClass = "idle";
  
  if (targetStop) {
    if (eta === null) {
      statusText = "ยังไม่มีรถในสายนี้";
      statusClass = "busy"; 
    } else if (eta === 0) {
      statusText = "กำลังมาถึง!";
      statusClass = "active"; 
    } else {
      statusText = "กำลังเดินทาง";
      statusClass = "active";
    }
  }

  const imgUrl = targetStop?.imageUrl;

  return (
    <div className="stop-info-wrapper">
      
      {/* 🚀 ระบบ Popup (Modal) แบบ Inline Style การันตีเด้งตรงกลางจอ 100% */}
      {isModalOpen && imgUrl && typeof document !== "undefined" && ReactDOM.createPortal(
        <div 
          onClick={() => setIsModalOpen(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0, 0, 0, 0.8)", // พื้นหลังดำโปร่งแสง
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 99999, // ดันให้อยู่หน้าสุดของจอ
            backdropFilter: "blur(3px)" // ทำเบลอพื้นหลังนิดๆ (ถ้าเบราว์เซอร์รองรับ)
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()} // ป้องกันการกดรูปแล้วปิด
            style={{
              position: "relative",
              maxWidth: "90vw",
              maxHeight: "85vh",
              backgroundColor: "#fff",
              padding: "6px",
              borderRadius: "16px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
              display: "flex",
              flexDirection: "column"
            }}
          >
            {/* 🚀 ปุ่ม X ปิด Popup มุมขวาบน */}
            <button 
              onClick={() => setIsModalOpen(false)} 
              style={{
                position: "absolute",
                top: "-15px",
                right: "-15px",
                backgroundColor: "#ef4444",
                color: "white",
                border: "none",
                borderRadius: "50%",
                width: "40px",
                height: "40px",
                fontSize: "24px",
                fontWeight: "bold",
                cursor: "pointer",
                boxShadow: "0 4px 10px rgba(0,0,0,0.3)",
                zIndex: 10,
                display: "flex",
                justifyContent: "center",
                alignItems: "center"
              }}
              title="ปิดรูปภาพ"
            >
              ×
            </button>
            
            {/* 🚀 รูปภาพที่ขยาย */}
            <img 
              src={imgUrl} 
              alt={targetStop?.nameTh || "รูปขยายป้ายรถเมล์"} 
              style={{ 
                maxWidth: "100%", 
                maxHeight: "calc(85vh - 12px)", 
                objectFit: "contain",
                borderRadius: "10px"
              }} 
            />
          </div>
        </div>,
        document.body
      )}

      {/* --- ส่วนของ Card ปกติ --- */}
      {targetStop && (
        <div className="rsu-stop-card-compact">
          
          {imgUrl && (
            <div 
              className="sc-image-container" 
              onClick={() => setIsModalOpen(true)} 
              style={{ cursor: 'pointer' }} 
              title="คลิกเพื่อขยายรูป"
            >
              <img 
                src={imgUrl} 
                alt={targetStop?.nameTh || targetStop?.name || "รูปป้ายรถเมล์"} 
                className="sc-stop-image" 
              />
            </div>
          )}

          <div className="sc-header">
            <div className="sc-selected-stop">
              <div className="sc-icon">🚏</div>
              <div className="sc-stop-name">
                {targetStop?.nameTh || targetStop?.name}
              </div>
            </div>
          </div>

          <div className="sc-body">
            <div className="sc-eta-container">
              <div className="sc-eta-label">เวลารอรถโดยประมาณ (ETA)</div>
              <div className="sc-eta-value">
                {eta !== null ? (
                  <>
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
      )}

      <button 
        className="gps-locate-btn" 
        onClick={onFindNearest} 
        title="หาป้ายที่ใกล้ฉันที่สุด"
      >
        <img 
          src="/icons/live.png"
          alt="ตำแหน่งของฉัน" 
          style={{ width: '24px', height: '24px', objectFit: 'contain' }} 
        />
      </button>

    </div>
  );
}