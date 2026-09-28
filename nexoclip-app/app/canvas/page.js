'use client';

import { useEffect } from 'react';

const SPITE_URL = process.env.NEXT_PUBLIC_SPITE_URL || '/spite';

export default function CanvasPage() {
  useEffect(() => {
    window.location.replace(`${SPITE_URL}?embedded=canvas`);
  }, []);

  return <main className="min-h-screen bg-black" aria-label="Canvas" />;
}
