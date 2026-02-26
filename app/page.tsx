"use client";

import dynamic from 'next/dynamic';

const ShuttleTracker = dynamic(() => import('../components/ShuttleTracker'), {
  ssr: false,
});

export default function Home() {
  return (
    <main>
      <ShuttleTracker />
    </main>
  );
}