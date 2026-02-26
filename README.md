# RSU Shuttle Bus Tracker

ระบบติดตามรถราง ของมหาวิทยาลัยรังสิตแบบเรียลไทม์ (Real-time) พัฒนาด้วย Next.js (App Router) และ TypeScript เพื่อให้นักศึกษาและบุคลากรสามารถดูตำแหน่งรถ คำนวณเวลาที่รถจะมาถึง (ETA) และค้นหาป้ายรถ

## ฟีเจอร์หลัก (Features)

- **Real-time Tracking:** แสดงตำแหน่งรถบัสที่กำลังวิ่งอยู่บนแผนที่แบบสดๆ ผ่าน WebSocket (Socket.io)
- **Accurate ETA Calculation:** คำนวณเวลารอรถโดยประมาณ (ETA) อย่างแม่นยำ โดยคำนวณจากระยะทางตามเส้นถนนจริง (Polyline) และความเร็วของรถ
- **Nearest Stop Finder:** ระบบ GPS ค้นหาตำแหน่งผู้ใช้ และแนะนำป้ายรถเมล์ที่อยู่ใกล้ที่สุดให้โดยอัตโนมัติ
- **Route Switching:** สลับดูเส้นทางการเดินรถได้ง่ายๆ (เช่น สาย R01 และ R02) พร้อมแสดงเส้นทางบนแผนที่
- **Availability Count:** แสดงจำนวนรถที่กำลังให้บริการอยู่ในขณะนั้น

## เทคโนโลยีที่ใช้ (Tech Stack)

- **Framework:** [Next.js](https://nextjs.org/) (App Router)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/) / CSS Modules
- **Map:** [Leaflet](https://leafletjs.com/) (แผนที่จาก OpenStreetMap)
- **Real-time Communication:** [Socket.io-client](https://socket.io/)
- **Routing API:** OSRM (Open Source Routing Machine)

## โครงสร้างโปรเจกต์ (Project Structure)

\`\`\`text
rsu-shuttle-bus/
├── app/              # หน้าเว็บหลักและ Global CSS ของ Next.js
├── components/       # UI Components (เช่น แผนที่, การ์ดแสดงเวลา)
├── constants/        # เก็บค่าคงที่ (เช่น พิกัด RSU_CENTER)
├── hooks/            # Custom Hooks (เช่น useLeafletMap ป้องกัน SSR Error)
├── types/            # TypeScript Interfaces กำหนดโครงสร้างข้อมูล
└── utils/            # ฟังก์ชันคำนวณระยะทางและแอนิเมชันรถ
\`\`\`

## วิธีการติดตั้งและรันโปรเจกต์ (Getting Started)

### 1. Clone โปรเจกต์
\`\`\`bash
git clone https://github.com/your-username/rsu-shuttle-bus.git
cd rsu-shuttle-bus
\`\`\`

### 2. ติดตั้ง Dependencies
\`\`\`bash
npm install
\`\`\`

### 3. ตั้งค่า Environment Variables
สร้างไฟล์ \`.env.local\` ไว้ที่โฟลเดอร์นอกสุดของโปรเจกต์ และกำหนด URL ของ Backend ดังนี้:
\`\`\`env
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001  # เปลี่ยนเป็น URL ของ Backend ที่ใช้งานจริง
\`\`\`

### 4. รันโปรเจกต์ (Development Server)
\`\`\`bash
npm run dev
\`\`\`
เปิดเบราว์เซอร์ไปที่ [http://localhost:3000](http://localhost:3000) เพื่อดูผลลัพธ์

## หมายเหตุการพัฒนา (Notes)
- โปรเจกต์นี้ใช้งาน **Leaflet** ร่วมกับ Next.js จึงมีการใช้ฟังก์ชัน \`dynamic import\` พร้อมกำหนด \`ssr: false\` ในไฟล์ \`app/page.tsx\` เพื่อป้องกัน Error \`window is not defined\`

## ผู้พัฒนา (Author)
- **Sorayut Deemak** - พัฒนาส่วน Frontend