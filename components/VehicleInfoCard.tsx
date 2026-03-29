import React from "react";

interface VehicleInfoCardProps {
  routeId: string;
  prevStop: string;
  nextStop: string;
  onFindNearest: () => void;
}

export default function VehicleInfoCard({ routeId, prevStop, nextStop, onFindNearest }: VehicleInfoCardProps) {
  return (
    <div className="stop-info-wrapper">
      
      {/* 🚀 บังคับกล่องหลักให้ชิดซ้าย */}
      <div className="rsu-stop-card-compact" style={{ alignItems: 'flex-start' }}>
        
        {/* ส่วนหัวการ์ด บังคับชิดซ้าย */}
        <div className="sc-header" style={{ width: '100%', display: 'flex', justifyContent: 'flex-start', paddingLeft: '0px' }}>
          <div className="sc-selected-stop" style={{ justifyContent: 'flex-start' }}>
            <div className="sc-stop-name">รถราง (สาย {routeId})</div>
          </div>
        </div>

        <div className="sc-body" style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'flex-start', 
          padding: '10px 15px', 
          width: '100%', 
          boxSizing: 'border-box' 
        }}>
          
          {/* ป้ายที่เพิ่งผ่านมา */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#B0B0B0' }}></div>
              <div style={{ color: '#888', fontSize: '0.85rem', fontWeight: '500' }}>ป้ายที่ผ่านมา</div>
            </div>
            <div style={{ paddingLeft: '20px', color: '#555', fontSize: '1rem', marginTop: '4px', textAlign: 'left', width: '100%' }}>
              {prevStop}
            </div>
          </div>

          {/* เส้นเชื่อมจุด */}
          <div style={{ width: '2px', height: '16px', backgroundColor: '#E5E7EB', margin: '4px 0 4px 4px' }}></div>

          {/* ป้ายถัดไป */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {/* จุดสีน้ำเงินพร้อมเงาออร่ารอบๆ */}
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#3B82F6', boxShadow: '0 0 0 3px #DBEAFE' }}></div>
              <div style={{ color: '#3B82F6', fontSize: '0.85rem', fontWeight: 'bold' }}>ป้ายถัดไป</div>
            </div>
            <div style={{ paddingLeft: '20px', color: '#000', fontSize: '1.15rem', fontWeight: '800', marginTop: '4px', textAlign: 'left', width: '100%' }}>
              {nextStop}
            </div>
          </div>

        </div>
      </div>

      <button className="gps-locate-btn" onClick={onFindNearest} title="หาป้ายที่ใกล้ฉันที่สุด">
        <img src="/icons/live.png" alt="ตำแหน่งของฉัน" style={{ width: '24px', height: '24px', objectFit: 'contain' }} />
      </button>

    </div>
  );
}