"use client";

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { STATUS, Step, ACTIONS, EVENTS } from 'react-joyride';

const Joyride = dynamic(() => import('react-joyride').then((mod) => mod.Joyride), { ssr: false });

export default function AppTour() {
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const [steps] = useState<Step[]>([
    {
      target: 'body',
      placement: 'center',
      title: 'ยินดีต้อนรับสู่ RSU Tram Tracker',
      content: 'สอนวิธีใช้งาน',
      skipBeacon: true,
    },
    {
      target: '.rsu-avail', 
      title: '🟢 1. จำนวนรถที่ให้บริการ',
      content: 'ดูจำนวนรถรางที่กำลังวิ่งอยู่ในสายนี้',
      placement: 'left',
    },
    {
      target: '.route-selector', 
      title: '🔄 2. เลือกสายรถ',
      content: 'สลับดูเส้นทางเดินรถ รถราง หรือ สองแถว ได้ที่นี่',
      placement: 'left',
    },
    {

      target: '.rsu-stop-card-compact', 
      title: '🚏 3. ข้อมูลจุดจอด',
      content: 'คุณสามารถแตะที่หมุดป้ายบนแผนที่เพื่อดูข้อมูลได้',
      placement: 'top',
    },
    {
    
      target: '.rsu-stop-card-compact', 
      title: '🚌 4. ข้อมูลรถ',
      content: 'เมื่อกดที่รถ ข้อมูลจะแสดงขึ้นมา',
      placement: 'top',
    },
    {
      target: '.gps-locate-btn', 
      title: '🧭 5. หาป้ายที่ใกล้ที่สุด',
      content: 'กดปุ่มนี้เพื่อหาป้ายรถที่ใกล้คุณที่สุดทันที!',
      placement: 'top',
    },
  ]);

  useEffect(() => {
    const hasSeenTour = localStorage.getItem('rsu-bus-tour-seen');
    if (!hasSeenTour) setRun(true);
  }, []);

  const handleJoyrideCallback = (data: any) => {
    const { action, index, status, type } = data;

    // 🚀 เมื่อกด FINISHED หรือ SKIP ให้ Zoom กลับ Center
    if (([STATUS.FINISHED, STATUS.SKIPPED] as string[]).includes(status)) {
      localStorage.setItem('rsu-bus-tour-seen', 'true');
      setRun(false);
      
      // ส่งสัญญาณไปที่ ShuttleTracker
      window.dispatchEvent(new CustomEvent('tour-zoom-center'));
    } 
    else if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
      const nextIndex = index + (action === ACTIONS.PREV ? -1 : 1);

      // 🪄 Logic "พากด" อัตโนมัติ เพื่อให้ Card โผล่ก่อนถึง Step 3 และ 4
      if (nextIndex === 3) {
        const stopBtn = document.querySelector('.stop-marker-tour') as HTMLElement;
        if (stopBtn) stopBtn.click();
      } else if (nextIndex === 4) {
        const busBtn = document.querySelector('.bus-marker-tour') as HTMLElement;
        if (busBtn) busBtn.click();
      }
      
      setStepIndex(nextIndex);
    }
  };

  return (
    <Joyride
      stepIndex={stepIndex}
      onEvent={handleJoyrideCallback}
      continuous={true}
      run={run}
      steps={steps}
      scrollToFirstStep={true}
      options={{
        primaryColor: '#3B82F6',
        zIndex: 1000000,
        showProgress: true,
        buttons: ['back', 'close', 'primary', 'skip']
      }}
      styles={{
        buttonPrimary: { borderRadius: '8px', fontWeight: 'bold' }
      }}
      locale={{ last: 'เริ่มใช้งานเลย!', next: 'Next', skip: 'Skip' }}
    />
  );
}