import {Img, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame, Easing} from 'remotion';
import {clamp, Shimmer, usePop} from './parts';
import {APP, CHAT_W, T, theme} from './theme';

const BOARD_W = APP.w - CHAT_W;

// Header controls, in app pixels (used for cursor targets).
export const TABS = ['Scene', 'Shot', 'Timeline'];
const TAB_W = 104;
const TAB_X0 = 24;
export const tabCenter = (i: number) => ({x: CHAT_W + TAB_X0 + i * (TAB_W + 8) + TAB_W / 2, y: 36});
export const exportCenter = {x: CHAT_W + BOARD_W - 24 - 55, y: 36};

// Timeline geometry (board pixels).
const TRACK_X = 104;
const TRACK_W = BOARD_W - TRACK_X - 24;
const PX_PER_S = TRACK_W / 15;
const LANE_Y = {video: 495, vo: 543, music: 591, caption: 639};
const LANE_H = 40;
const VO1 = {start: 0.3, len: 2.2, moveBy: 0.7};
export const voGrab = {
  from: {x: CHAT_W + TRACK_X + (VO1.start + VO1.len / 2) * PX_PER_S, y: LANE_Y.vo + LANE_H / 2},
  to: {x: CHAT_W + TRACK_X + (VO1.start + VO1.moveBy + VO1.len / 2) * PX_PER_S, y: LANE_Y.vo + LANE_H / 2},
};

const SHOTS = [
  {label: '1A', title: 'Bangun, ambil serum', src: 'director/d-video-poster.jpg', pos: '50% 40%', vo: 'Pagi-pagi wajib ini dulu.', caption: 'Rutinitas pagiku'},
  {label: '1B', title: 'Teteskan, senyum', src: 'director/d-serum.jpg', pos: '82% 40%', vo: 'Ringan, cepat meresap.', caption: 'Ringan & cepat meresap'},
  {label: '1C', title: 'Close-up botol', src: 'director/d-serum.jpg', pos: '24% 50%', vo: 'Ini serum andalanku tiap pagi.', caption: 'Serum andalan tiap pagi'},
];

const Header: React.FC<{active: number}> = ({active}) => {
  const frame = useCurrentFrame();
  const pressed = frame >= T.exportClick && frame < T.exportClick + 5;
  return (
    <div style={{position: 'absolute', left: 0, top: 0, width: BOARD_W, height: 72, borderBottom: `1px solid ${theme.line}`}}>
      {TABS.map((tab, i) => (
        <div
          key={tab}
          style={{
            position: 'absolute', left: TAB_X0 + i * (TAB_W + 8), top: 18, width: TAB_W, height: 36, borderRadius: 10,
            display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 600,
            background: i === active ? 'rgba(255,255,255,.1)' : 'transparent',
            color: i === active ? '#fff' : theme.muted,
          }}
        >
          {tab}
        </div>
      ))}
      <div
        style={{
          position: 'absolute', right: 24, top: 18, width: 110, height: 36, borderRadius: 99, display: 'grid', placeItems: 'center',
          background: theme.accent, color: theme.accentInk, fontSize: 15, fontWeight: 700, transform: `scale(${pressed ? 0.94 : 1})`,
        }}
      >
        Export
      </div>
    </div>
  );
};

const Media: React.FC<{src: string; pos: string; ready: boolean; w: number; h: number; radius?: number}> = ({src, pos, ready, w, h, radius = 12}) => (
  <div style={{width: w, height: h, borderRadius: radius, overflow: 'hidden', background: theme.panelAlt}}>
    {ready ? <Img src={staticFile(src)} style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: pos}} /> : <Shimmer w={w} h={h} radius={0} />}
  </div>
);

const Label: React.FC<{y: number; children: React.ReactNode}> = ({y, children}) => (
  <div style={{position: 'absolute', left: 24, top: y, fontSize: 13, fontWeight: 700, letterSpacing: 1.6, color: theme.faint, textTransform: 'uppercase'}}>{children}</div>
);

const SceneView: React.FC = () => {
  const frame = useCurrentFrame();
  const chips = usePop(T.briefCard);
  const assets = usePop(T.assetCard);
  const shots = usePop(T.scriptCard);
  const empty = interpolate(frame, [T.briefCard, T.briefCard + 10], [1, 0], clamp);

  return (
    <>
      {empty > 0 && (
        <div style={{position: 'absolute', left: 0, right: 0, top: 300, textAlign: 'center', fontSize: 16, color: theme.faint, opacity: empty}}>
          Board terisi sambil Director bekerja…
        </div>
      )}
      <div style={{position: 'absolute', left: 24, top: 92, display: 'flex', gap: 8, opacity: chips}}>
        {['9:16', '15 detik', 'TikTok', 'Gaya UGC', 'Rutinitas pagi'].map((c) => (
          <span key={c} style={{fontSize: 13, padding: '5px 12px', borderRadius: 99, border: `1px solid ${theme.line}`, background: theme.panelAlt, color: 'rgba(255,255,255,.7)'}}>{c}</span>
        ))}
      </div>

      {assets > 0 && (
        <div style={{opacity: assets}}>
          <Label y={146}>Karakter & dunia</Label>
          {[
            {src: 'director/d-character.jpg', name: 'Nadia', kind: 'karakter'},
            {src: 'director/d-serum.jpg', name: 'Serum', kind: 'properti'},
          ].map((a, i) => (
            <div key={a.name} style={{position: 'absolute', left: 24 + i * 290, top: 176}}>
              <Media src={a.src} pos="50% 50%" ready={frame >= T.assetsReady} w={270} h={152} />
              <div style={{marginTop: 8, fontSize: 14, color: 'rgba(255,255,255,.8)'}}>
                {a.name} <span style={{color: theme.faint}}>· {a.kind}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {shots > 0 && (
        <div style={{opacity: shots}}>
          <Label y={380}>Scene 1 — Pagi di kamar</Label>
          {SHOTS.map((s, i) => (
            <div key={s.label} style={{position: 'absolute', left: 24 + i * 170, top: 410}}>
              <Media src={s.src} pos={s.pos} ready={frame >= T.framesReady} w={154} h={274} />
              <div style={{marginTop: 8, fontSize: 13.5, color: 'rgba(255,255,255,.8)'}}>
                <span style={{color: theme.accent, fontWeight: 700}}>{s.label}</span> {s.title}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

const Lane: React.FC<{label: string; color: string; y: number; children: React.ReactNode}> = ({label, color, y, children}) => (
  <div style={{position: 'absolute', left: 24, top: y, width: BOARD_W - 48, height: LANE_H, borderRadius: 6, background: 'rgba(255,255,255,.025)'}}>
    <span style={{position: 'absolute', left: 8, top: 12, fontSize: 12, fontWeight: 700, letterSpacing: 0.8, color}}>{label}</span>
    {children}
  </div>
);

const Block: React.FC<{start: number; len: number; bg: string; children: React.ReactNode; lifted?: boolean}> = ({start, len, bg, children, lifted}) => (
  <div
    style={{
      position: 'absolute', left: TRACK_X - 24 + start * PX_PER_S, top: 5, width: len * PX_PER_S - 4, height: LANE_H - 10,
      borderRadius: 6, background: bg, color: 'rgba(255,255,255,.92)', fontSize: 12.5, lineHeight: '30px', padding: '0 10px',
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      boxShadow: lifted ? '0 0 0 2px rgba(255,255,255,.75), 0 8px 18px rgba(0,0,0,.4)' : 'none',
    }}
  >
    {children}
  </div>
);

const TimelineView: React.FC = () => {
  const frame = useCurrentFrame();
  const drag = interpolate(frame, [T.dragStart, T.dragEnd], [0, VO1.moveBy], {...clamp, easing: Easing.inOut(Easing.cubic)});
  const lifted = frame >= T.dragStart - 4 && frame <= T.dragEnd + 4;
  return (
    <>
      <div style={{position: 'absolute', left: 24, top: 90, display: 'flex', gap: 6}}>
        {['Urutan shot', 'Video final'].map((t, i) => (
          <span key={t} style={{fontSize: 13, padding: '5px 12px', borderRadius: 99, background: i === 0 ? 'rgba(255,255,255,.1)' : 'transparent', color: i === 0 ? '#fff' : theme.faint}}>{t}</span>
        ))}
      </div>
      <div style={{position: 'absolute', left: (BOARD_W - 190) / 2, top: 112}}>
        <Media src={SHOTS[0].src} pos={SHOTS[0].pos} ready w={190} h={338} />
      </div>
      {[0, 5, 10, 15].map((s) => (
        <span key={s} style={{position: 'absolute', left: TRACK_X + s * PX_PER_S - 8, top: 470, fontSize: 11, color: theme.faint}}>{s}s</span>
      ))}
      <Lane label="VIDEO" color="rgba(255,255,255,.7)" y={LANE_Y.video}>
        {SHOTS.map((s, i) => (
          <div key={s.label} style={{position: 'absolute', left: TRACK_X - 24 + i * 5 * PX_PER_S, top: 4, width: 5 * PX_PER_S - 4, height: LANE_H - 8, borderRadius: 6, overflow: 'hidden', background: '#2b2f37', display: 'flex', alignItems: 'center', gap: 8}}>
            <Img src={staticFile(s.src)} style={{width: 56, height: '100%', objectFit: 'cover', objectPosition: s.pos}} />
            <span style={{fontSize: 12.5, color: 'rgba(255,255,255,.85)'}}>{s.label} · {s.title}</span>
          </div>
        ))}
      </Lane>
      <Lane label="VO" color="#ddd6fe" y={LANE_Y.vo}>
        <Block start={VO1.start + drag} len={VO1.len} bg={theme.violet} lifted={lifted}>{SHOTS[0].vo}</Block>
        <Block start={5.4} len={2.1} bg={theme.violet}>{SHOTS[1].vo}</Block>
        <Block start={10.3} len={2.6} bg={theme.violet}>{SHOTS[2].vo}</Block>
      </Lane>
      <Lane label="MUSIK" color="#bae6fd" y={LANE_Y.music}>
        <Block start={0} len={15} bg={theme.sky}>♪ elektronik pop ceria, synth lembut, 110 bpm</Block>
      </Lane>
      <Lane label="CAPTION" color="#fde68a" y={LANE_Y.caption}>
        {SHOTS.map((s, i) => (
          <Block key={s.label} start={i * 5 + 0.5} len={3.6} bg={theme.amber}>{s.caption}</Block>
        ))}
      </Lane>
      <div style={{position: 'absolute', left: 24, top: 700, fontSize: 13, color: theme.faint}}>
        Seret blok untuk menggeser, tarik ujungnya untuk memotong. Export menggabungkan semuanya jadi MP4.
      </div>
    </>
  );
};

const FinalView: React.FC = () => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [T.videoStart, T.videoStart + 152], [0, 100], clamp);
  return (
    <>
      <div style={{position: 'absolute', left: 24, top: 90, display: 'flex', gap: 6}}>
        {['Urutan shot', 'Video final'].map((t, i) => (
          <span key={t} style={{fontSize: 13, padding: '5px 12px', borderRadius: 99, background: i === 1 ? 'rgba(255,255,255,.1)' : 'transparent', color: i === 1 ? '#fff' : theme.faint}}>{t}</span>
        ))}
      </div>
      <div style={{position: 'absolute', left: (BOARD_W - 340) / 2, top: 120, width: 340, height: 604, borderRadius: 16, overflow: 'hidden', background: '#000', boxShadow: '0 30px 60px rgba(0,0,0,.5)'}}>
        <Sequence from={T.videoStart} layout="none">
          <OffthreadVideo src={staticFile('director/d-video.mp4')} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
        </Sequence>
        {frame < T.videoStart && <Img src={staticFile('director/d-video-poster.jpg')} style={{width: '100%', height: '100%', objectFit: 'cover'}} />}
      </div>
      <div style={{position: 'absolute', left: (BOARD_W - 340) / 2, top: 740, width: 340, height: 5, borderRadius: 99, background: 'rgba(255,255,255,.1)'}}>
        <div style={{width: `${p}%`, height: '100%', borderRadius: 99, background: theme.accent}} />
      </div>
    </>
  );
};

export const Board: React.FC = () => {
  const frame = useCurrentFrame();
  const view = frame < T.timelineTab ? 'scene' : frame < T.renderDone ? 'timeline' : 'final';
  const fadeIn = (start: number) => interpolate(frame, [start, start + 10], [0, 1], clamp);
  const opacity = view === 'timeline' ? fadeIn(T.timelineTab) : view === 'final' ? fadeIn(T.renderDone) : 1;
  return (
    <div style={{position: 'absolute', left: CHAT_W, top: 0, width: BOARD_W, height: '100%', background: theme.bg, overflow: 'hidden'}}>
      <Header active={view === 'scene' ? 0 : 2} />
      <div style={{position: 'absolute', inset: 0, opacity}}>
        {view === 'scene' && <SceneView />}
        {view === 'timeline' && <TimelineView />}
        {view === 'final' && <FinalView />}
      </div>
    </div>
  );
};
