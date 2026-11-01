// Local harness: renders a drawn Motion video (components/motion/draw) from a props file.
// @ts-nocheck
import DrawVideo, {drawFrames} from '../../../../components/motion/draw/DrawVideo.js';
import {layoutOf} from '../../../../components/motion/draw/layout.js';

export const DrawTest = (props) => <DrawVideo {...props} />;
export const drawTestMetadata = ({props}) => {
  const [w, h] = layoutOf(props.format).out;
  return {durationInFrames: drawFrames(props.scenes || [], 30), width: Math.round(w / 1.5), height: Math.round(h / 1.5)};
};
