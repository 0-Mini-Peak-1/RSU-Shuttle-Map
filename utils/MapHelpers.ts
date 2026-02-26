import L from "leaflet";

type Coordinate = [number, number];

export function shouldMove(oldPos: Coordinate, newPos: Coordinate): boolean {
  const dx = oldPos[0] - newPos[0];
  const dy = oldPos[1] - newPos[1];
  return Math.sqrt(dx * dx + dy * dy) > 0.00003;
}

export function animateMove(marker: L.Marker, start: Coordinate, end: Coordinate, duration: number = 800) {
  const startTime = performance.now();
  function step(currentTime: number) {
    const progress = Math.min((currentTime - startTime) / duration, 1);
    const lat = start[0] + (end[0] - start[0]) * progress;
    const lng = start[1] + (end[1] - start[1]) * progress;
    
    marker.setLatLng([lat, lng]);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ฟังก์ชันเดิม (ใช้ตอนเริ่มหาตำแหน่งครั้งแรก)
export function getNearestPointIndex(pos: Coordinate, coords: Coordinate[]): number {
  let minDst = Infinity;
  let minIdx = 0;
  const pt = L.latLng(pos[0], pos[1]);
  
  for (let i = 0; i < coords.length; i++) {
    const dst = pt.distanceTo(L.latLng(coords[i][0], coords[i][1]));
    if (dst < minDst) {
      minDst = dst;
      minIdx = i;
    }
  }
  return minIdx;
}

// 🚀 ฟังก์ชันใหม่: ล็อกทิศทาง ค้นหาเฉพาะจุดที่อยู่ข้างหน้า (แก้ปัญหาเลนสวนกัน)
export function getDirectionalPointIndex(pos: Coordinate, coords: Coordinate[], lastIdx: number): number {
  // ถ้ารถยังไม่มีข้อมูลจุดล่าสุด ให้หาแบบปกติไปก่อน
  if (lastIdx === -1 || lastIdx === undefined) return getNearestPointIndex(pos, coords);

  const pt = L.latLng(pos[0], pos[1]);
  let minDst = Infinity;
  let bestIdx = lastIdx;

  // ค้นหาในระยะ -10 จุด (เผื่อ GPS ถอยหลังนิดหน่อย) ถึง +50 จุด (ระยะทางข้างหน้า)
  for (let i = -10; i <= 50; i++) {
    const checkIdx = (lastIdx + i + coords.length) % coords.length; // วนลูป (Loop) กลับไป 0 ได้
    const dst = pt.distanceTo(L.latLng(coords[checkIdx][0], coords[checkIdx][1]));
    if (dst < minDst) {
      minDst = dst;
      bestIdx = checkIdx;
    }
  }

  // ถ้ารถวาร์ปไปไกลมาก (เกิน 100 เมตร) อาจจะเพราะเริ่มรอบใหม่ ให้รีเซ็ตกลับไปหาแบบปกติ
  if (minDst > 100) {
    return getNearestPointIndex(pos, coords);
  }

  return bestIdx;
}