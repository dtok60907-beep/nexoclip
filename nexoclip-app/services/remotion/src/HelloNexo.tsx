import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';

type Props = {title: string; subtitle: string};

export const HelloNexo: React.FC<Props> = ({title, subtitle}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const pop = spring({frame, fps, config: {damping: 14}});
  const fade = interpolate(frame, [15, 35], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill style={{background: '#0b0b12', justifyContent: 'center', alignItems: 'center', fontFamily: 'sans-serif'}}>
      <div style={{color: 'white', fontSize: 140, fontWeight: 800, transform: `scale(${pop})`}}>{title}</div>
      <div style={{color: '#a5a5c0', fontSize: 52, marginTop: 24, opacity: fade}}>{subtitle}</div>
    </AbsoluteFill>
  );
};
