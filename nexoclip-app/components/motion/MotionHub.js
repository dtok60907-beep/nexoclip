'use client';

// The Motion tab: drawn videos made with the Motion Director chat (StoryStudio). The old template studio
// (MotionStudio.js) is no longer offered here.

import dynamic from 'next/dynamic';
import StoryStudio from './StoryStudio';

const MotionStudio = dynamic(() => import('./MotionStudio'), { ssr: false });

export default function MotionHub(props) {
  if (new URLSearchParams(window.location.search).get('editor') === 'legacy') return <MotionStudio {...props} />;
  return <StoryStudio {...props} />;
}
