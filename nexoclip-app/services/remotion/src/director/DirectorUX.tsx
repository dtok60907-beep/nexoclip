import {AbsoluteFill, Audio, interpolate, staticFile, useCurrentFrame, Easing, Solid} from 'remotion';
import {Board, exportCenter, tabCenter, voGrab} from './board';
import {cardButton, ChatPanel} from './chat';
import {clamp, Cursor, usePop} from './parts';
import {APP, at, BRIEF, FRAME, T, theme} from './theme';

// Start screen geometry (app pixels).
const COMPOSER = {x: 420, y: 330, w: 760, h: 160};
const MODE_GUIDE = {x: COMPOSER.x + 18, w: 112};
const MODE_AUTO = {x: MODE_GUIDE.x + MODE_GUIDE.w + 8, w: 134};
const MODE_Y = COMPOSER.y + COMPOSER.h - 44;
const SEND = {x: COMPOSER.x + COMPOSER.w - 18 - 19, y: COMPOSER.y + COMPOSER.h - 25};

const fade = (frame: number, a: number, b: number, c: number, d: number) =>
  interpolate(frame, [a, b, c, d], [0, 1, 1, 0], clamp);

const Dot: React.FC = () => (
  <span style={{width: 8, height: 8, borderRadius: 99, background: theme.accent, boxShadow: `0 0 14px ${theme.accent}`}} />
);

const Kicker: React.FC<{size?: number}> = ({size = 16}) => (
  <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: size, fontWeight: 700, letterSpacing: 3, color: 'rgba(255,255,255,.55)'}}>
    <Dot /> AI DIRECTOR
  </div>
);

const Title: React.FC = () => {
  const frame = useCurrentFrame();
  const o = fade(frame, 0, 12, 66, 84);
  const pop = usePop(4, 18);
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', opacity: o}}>
      <Kicker size={20} />
      <div style={{marginTop: 26, fontSize: 84, fontWeight: 800, letterSpacing: -2.5, color: '#fff', transform: `translateY(${(1 - pop) * 30}px)`}}>
        Bikin video iklan cukup <span style={{color: theme.accent}}>dengan ngobrol.</span>
      </div>
      <div style={{marginTop: 22, fontSize: 30, color: theme.muted}}>Begini cara pakai AI Director di NexoClip.</div>
    </AbsoluteFill>
  );
};

const StartScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const typed = Math.round(interpolate(frame, [T.typeStart, T.typeEnd], [0, BRIEF.length], clamp));
  const guide = frame >= T.pickMode;
  const tip = fade(frame, T.pickMode, T.pickMode + 6, T.send - 8, T.send - 2);
  const sent = frame >= T.send;
  const caret = frame < T.typeEnd + 20 && Math.floor(frame / 15) % 2 === 0;
  const pill = (active: boolean): React.CSSProperties => ({
    fontSize: 14, padding: '6px 14px', borderRadius: 99, fontWeight: 600,
    background: active ? 'rgba(212,255,100,.15)' : 'transparent', color: active ? theme.accent : theme.faint,
  });

  return (
    <AbsoluteFill style={{background: theme.bg}}>
      <div style={{position: 'absolute', top: 150, width: '100%'}}><Kicker size={13} /></div>
      <div style={{position: 'absolute', top: 186, width: '100%', textAlign: 'center', fontSize: 46, fontWeight: 650, letterSpacing: -1.4, color: '#fff'}}>
        Ceritakan video yang mau kamu buat.
      </div>
      <div style={{position: 'absolute', top: 262, width: '100%', textAlign: 'center', fontSize: 17, color: theme.muted}}>
        Ngobrol aja seperti ke sutradara. Director menyusun brief, naskah, karakter, shot, dan audio.
      </div>
      <div
        style={{
          position: 'absolute', left: COMPOSER.x, top: COMPOSER.y, width: COMPOSER.w, height: COMPOSER.h, borderRadius: 20,
          border: `1px solid ${frame >= T.typeStart && !sent ? 'rgba(212,255,100,.35)' : theme.line}`, background: theme.panelAlt,
          padding: 18, fontSize: 18, lineHeight: 1.5, color: typed && !sent ? theme.text : theme.faint,
        }}
      >
        {sent ? 'Mau bikin video apa? Boleh singkat…' : typed ? BRIEF.slice(0, typed) : 'Mau bikin video apa? Boleh singkat. Lampirkan foto produk, karakter, atau video referensi kalau ada…'}
        {caret && typed > 0 && !sent && <span style={{color: theme.accent}}>|</span>}
      </div>
      <div style={{position: 'absolute', left: MODE_GUIDE.x, top: MODE_Y, display: 'flex', gap: 8}}>
        <span style={{...pill(guide), width: MODE_GUIDE.w, textAlign: 'center'}}>Pandu aku</span>
        <span style={{...pill(!guide), width: MODE_AUTO.w, textAlign: 'center'}}>Langsung jadi</span>
      </div>
      <div
        style={{
          position: 'absolute', left: SEND.x - 19, top: SEND.y - 19, width: 38, height: 38, borderRadius: 99, display: 'grid', placeItems: 'center',
          background: typed > 0 && !sent ? theme.accent : 'rgba(255,255,255,.08)', color: typed > 0 && !sent ? theme.accentInk : theme.muted, fontWeight: 800,
          transform: `scale(${frame >= T.send && frame < T.send + 5 ? 0.88 : 1})`,
        }}
      >
        ↑
      </div>
      <div
        style={{
          position: 'absolute', left: MODE_GUIDE.x - 4, top: COMPOSER.y + COMPOSER.h + 12, maxWidth: 520, opacity: tip,
          padding: '10px 14px', borderRadius: 12, background: '#1f232a', border: `1px solid ${theme.line}`, fontSize: 15, color: theme.text,
        }}
      >
        <strong style={{color: theme.accent}}>Pandu aku</strong> — Director berhenti di tiap langkah dan minta persetujuanmu.
      </div>
      <div style={{position: 'absolute', top: 560, width: '100%', display: 'flex', justifyContent: 'center', gap: 10, opacity: 1 - tip}}>
        {['Trailer rom-com 50 detik…', 'Iklan TikTok 20 detik untuk kopi susu lokal…', 'Teaser 15 detik sepatu lari…'].map((c) => (
          <span key={c} style={{fontSize: 13, padding: '7px 14px', borderRadius: 99, border: `1px solid ${theme.line}`, background: theme.panelAlt, color: 'rgba(255,255,255,.6)'}}>{c}</span>
        ))}
      </div>
    </AbsoluteFill>
  );
};

const AppWindow: React.FC = () => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [T.frameIn, T.frameIn + 22], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
  const leave = interpolate(frame, [T.endCard - 20, T.endCard], [1, 0], clamp);
  const workspace = interpolate(frame, [T.workspace - 12, T.workspace], [0, 1], clamp);
  return (
    <div
      style={{
        position: 'absolute', left: FRAME.x, top: FRAME.y, width: FRAME.w, height: FRAME.h, borderRadius: 16, overflow: 'hidden',
        background: '#1e1e22', boxShadow: '0 50px 100px rgba(0,0,0,.55)', border: '1px solid rgba(255,255,255,.08)',
        opacity: enter * leave, transform: `translateY(${(1 - enter) * 40}px) scale(${0.96 + enter * 0.04})`,
      }}
    >
      <div style={{height: FRAME.bar, display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px'}}>
        {['#ff5f57', '#febc2e', '#28c840'].map((c) => <span key={c} style={{width: 12, height: 12, borderRadius: 99, background: c}} />)}
        <div style={{marginLeft: 14, width: 460, height: 26, borderRadius: 7, background: '#2b2b30', color: '#9aa0a6', fontSize: 14, display: 'flex', alignItems: 'center', padding: '0 12px'}}>
          app.nexoclip.com/studio/director
        </div>
      </div>
      <div style={{position: 'absolute', left: 0, top: FRAME.bar, width: APP.w, height: APP.h}}>
        {workspace < 1 && <div style={{position: 'absolute', inset: 0, opacity: 1 - workspace}}><StartScreen /></div>}
        {workspace > 0 && (
          <div style={{position: 'absolute', inset: 0, opacity: workspace}}>
            <ChatPanel />
            <Board />
          </div>
        )}
      </div>
    </div>
  );
};

const STEPS: [number, number, string][] = [
  [T.frameIn + 20, T.workspace, 'Tulis brief, lalu pilih mode Pandu aku atau Langsung jadi'],
  [T.workspace, T.scriptCard, 'Director menyusun brief dan arah kreatif. Kamu tinggal pilih.'],
  [T.scriptCard, T.requestCard, 'Naskah, karakter, dan produk disiapkan di board'],
  [T.requestCard, T.timelineTab, 'Cek estimasi kredit, lalu Approve & generate'],
  [T.timelineTab, T.exportClick, 'Atur voiceover, musik, dan caption di timeline'],
  [T.exportClick, T.endCard - 10, 'Export jadi MP4, siap di-download'],
];

const Captions: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <>
      {STEPS.map(([start, end, text], i) => {
        const o = fade(frame, start, start + 10, end - 8, end);
        if (o <= 0) return null;
        return (
          <div key={text} style={{position: 'absolute', left: 0, right: 0, top: 950, display: 'flex', justifyContent: 'center', opacity: o}}>
            <div style={{display: 'flex', alignItems: 'center', gap: 16, fontSize: 32, fontWeight: 650, color: '#fff', transform: `translateY(${(1 - o) * 10}px)`}}>
              <span style={{width: 46, height: 46, borderRadius: 99, display: 'grid', placeItems: 'center', background: theme.accent, color: theme.accentInk, fontSize: 24, fontWeight: 800}}>{i + 1}</span>
              {text}
            </div>
          </div>
        );
      })}
    </>
  );
};

const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [T.endCard, T.endCard + 14], [0, 1], clamp);
  const pop = usePop(T.endCard, 18);
  if (o <= 0) return null;
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', opacity: o}}>
      <Kicker size={20} />
      <div style={{marginTop: 26, fontSize: 76, fontWeight: 800, letterSpacing: -2.2, color: '#fff', textAlign: 'center', transform: `scale(${0.94 + pop * 0.06})`}}>
        Dari brief sampai video final,<br /><span style={{color: theme.accent}}>dalam satu chat.</span>
      </div>
      <div style={{marginTop: 36, padding: '16px 34px', borderRadius: 99, background: theme.accent, color: theme.accentInk, fontSize: 30, fontWeight: 800}}>
        app.nexoclip.com
      </div>
    </AbsoluteFill>
  );
};

export const DirectorUX: React.FC = () => {
  const c = (p: {x: number; y: number}) => at(p.x, p.y);
  const concept = cardButton('concepts', T.pickConcept);
  const approve = cardButton('request', T.approve, false);
  return (
    <>
      <AbsoluteFill style={{background: `radial-gradient(1200px 700px at 50% 0%, #1a2010 0%, ${theme.bg} 60%)`, fontFamily: theme.font}}>
        <Audio
          src={staticFile('director/music.mp3')}
          // The track resolves at ~29.5s; slowing it 10% lands the final hit on the end card.
          playbackRate={0.9}
          volume={(f) =>
            interpolate(
              f,
              [0, 15, T.videoStart - 12, T.videoStart, T.videoStart + 150, T.videoStart + 162, T.total - 24, T.total - 1],
              [0, 0.6, 0.6, 0.12, 0.12, 0.6, 0.6, 0],
              clamp,
            )
          }
        />
        <Title />
        <AppWindow />
        <Captions />
        <Cursor
          from={at(1300, 700)}
          show={[T.typeEnd - 4, T.exportClick + 24]}
          moves={[
            {to: at(MODE_GUIDE.x + MODE_GUIDE.w / 2, MODE_Y + 15), start: T.pickMode - 18, dur: 16, click: T.pickMode},
            {to: at(SEND.x, SEND.y), start: T.send - 22, dur: 18, click: T.send},
            {to: c(concept), start: T.pickConcept - 24, dur: 20, click: T.pickConcept},
            {to: c(approve), start: T.approve - 24, dur: 20, click: T.approve},
            {to: c(tabCenter(2)), start: T.timelineTab - 22, dur: 18, click: T.timelineTab},
            {to: c(voGrab.from), start: T.dragStart - 20, dur: 16},
            {to: c(voGrab.to), start: T.dragStart, dur: T.dragEnd - T.dragStart},
            {to: c(exportCenter), start: T.exportClick - 22, dur: 18, click: T.exportClick},
          ]}
        />
        <EndCard />
      </AbsoluteFill>
      <Solid
        width={1920}
        height={1080}
        color="gray"
        style={{position: 'absolute'}}
        premountFor={30}
      />
    </>
  );
};
