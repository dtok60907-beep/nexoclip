'use client';

// The Motion tab: drawn videos made with the Motion Director chat (StoryStudio). The old template studio
// (MotionStudio.js) is no longer offered here.

import StoryStudio from './StoryStudio';

export default function MotionHub(props) {
  return <StoryStudio {...props} />;
}
