import {Composition} from 'remotion';
import {HelloNexo} from './HelloNexo';
import {DrawTest, drawTestMetadata} from './draw/DrawTest';
import {DirectorUX} from './director/DirectorUX';
import {T} from './director/theme';
import {canvasStudio, imageStudio, influencerStudio, videoStudio} from './walkthrough/configs';
import {Config, timeline, Walkthrough} from './walkthrough/Walkthrough';

const walkthroughs: [string, Config][] = [
  ['ImageStudioUX', imageStudio],
  ['VideoStudioUX', videoStudio],
  ['InfluencerUX', influencerStudio],
  ['CanvasUX', canvasStudio],
];

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="DrawTest" component={DrawTest} durationInFrames={300} fps={30} width={720} height={1280} defaultProps={{scenes: []}} calculateMetadata={drawTestMetadata} />
    <Composition id="DirectorUX" component={DirectorUX} durationInFrames={T.total} fps={30} width={1920} height={1080} />
    {walkthroughs.map(([id, config]) => (
      <Composition key={id} id={id} component={Walkthrough} durationInFrames={timeline(config).total} fps={30} width={1920} height={1080} defaultProps={{config}} />
    ))}
    <Composition
      id="HelloNexo"
      component={HelloNexo}
      durationInFrames={90}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{title: 'NexoClip', subtitle: 'Motion graphics dengan Remotion'}}
    />
  </>
);
