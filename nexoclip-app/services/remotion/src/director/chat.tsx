import {Img, interpolate, staticFile, useCurrentFrame, Easing} from 'remotion';
import {clamp, Shimmer} from './parts';
import {BRIEF, CHAT_W, T, theme} from './theme';

// Chat entries in order: when each appears and its fixed height, so the scroll and the
// cursor targets can be computed for any frame.
const GAP = 14;
const TOP = 24;
const VIEW_H = 630;
const CARD_X = 24;
const CARD_W = 410;
const BUTTON_ROW = 46;

const ENTRIES = [
  {key: 'user', at: T.userMsg, h: 92},
  {key: 'steps', at: T.userMsg + 12, h: 26},
  {key: 'brief', at: T.briefCard, h: 150},
  {key: 'concepts', at: T.conceptCard, h: 158 + BUTTON_ROW},
  {key: 'script', at: T.scriptCard, h: 156},
  {key: 'assets', at: T.assetCard, h: 140},
  {key: 'request', at: T.requestCard, h: 140 + BUTTON_ROW},
  {key: 'final', at: T.exportClick + 4, h: 120},
] as const;

type Key = (typeof ENTRIES)[number]['key'];

export const chatLayout = (frame: number) => {
  let y = TOP;
  const pos = {} as Record<Key, {y: number; p: number}>;
  for (const e of ENTRIES) {
    const p = interpolate(frame, [e.at, e.at + 12], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
    pos[e.key] = {y, p};
    y += (e.h + GAP) * p;
  }
  const scroll = Math.max(0, y - VIEW_H);
  return {pos, scroll};
};

// App-pixel center of a card's main action button at a given frame.
export const cardButton = (key: 'concepts' | 'request', frame: number, wide = true) => {
  const {pos, scroll} = chatLayout(frame);
  const e = ENTRIES.find((x) => x.key === key)!;
  const width = wide ? CARD_W : CARD_W - 100;
  return {x: CARD_X + width / 2, y: pos[key].y - scroll + e.h - BUTTON_ROW / 2 + 4};
};

const Shell: React.FC<{icon: string; title: string; accent?: string; children: React.ReactNode}> = ({icon, title, accent, children}) => (
  <div
    style={{
      width: CARD_W, borderRadius: 18, border: `1px solid ${theme.line}`, padding: 6,
      background: 'linear-gradient(#1c1f25, #121418)', boxShadow: '0 10px 30px rgba(0,0,0,.4)',
    }}
  >
    <div style={{display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px 10px'}}>
      <span
        style={{
          width: 26, height: 26, borderRadius: 7, display: 'grid', placeItems: 'center',
          background: 'rgba(212,255,100,.15)', color: theme.accent, fontSize: 14,
        }}
      >
        {icon}
      </span>
      <span style={{fontSize: 16, fontWeight: 650, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
        {title}
        {accent && <span style={{color: theme.accent}}> — {accent}</span>}
      </span>
    </div>
    <div
      style={{
        borderRadius: 14, border: '1px solid rgba(255,255,255,.06)', padding: 14,
        background: 'linear-gradient(#2a2e35, #1d2026 50%, #17191d)', fontSize: 14, lineHeight: 1.5, color: 'rgba(255,255,255,.65)',
      }}
    >
      {children}
    </div>
  </div>
);

const Button: React.FC<{children: React.ReactNode; primary?: boolean; width?: number | string; pressed?: boolean}> = ({children, primary, width = '100%', pressed}) => (
  <div
    style={{
      width, height: 38, borderRadius: 999, display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 650,
      border: primary ? 'none' : '1px solid rgba(255,255,255,.1)',
      background: primary ? theme.accent : 'linear-gradient(#2b2e34, #1b1d21)',
      color: primary ? theme.accentInk : 'rgba(255,255,255,.9)',
      transform: `scale(${pressed ? 0.96 : 1})`,
    }}
  >
    {children}
  </div>
);

const Badge: React.FC<{tone: 'accent' | 'amber' | 'green'; children: React.ReactNode}> = ({tone, children}) => {
  const colors = {accent: ['rgba(212,255,100,.15)', theme.accent], amber: ['rgba(245,158,11,.15)', '#fcd34d'], green: ['rgba(16,185,129,.15)', '#6ee7b7']}[tone];
  return (
    <span style={{fontSize: 12, fontWeight: 650, padding: '3px 9px', borderRadius: 999, background: colors[0], color: colors[1]}}>{children}</span>
  );
};

const Spinner: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <span
      style={{
        display: 'inline-block', width: 12, height: 12, borderRadius: '50%',
        border: '2px solid rgba(255,255,255,.2)', borderTopColor: theme.accent, transform: `rotate(${frame * 18}deg)`,
      }}
    />
  );
};

const Thumbs: React.FC<{items: {src: string; pos: string}[]; ready: boolean}> = ({items, ready}) => (
  <div style={{display: 'flex'}}>
    {items.map((it, i) => (
      <div
        key={i}
        style={{
          width: 54, height: 54, borderRadius: 10, overflow: 'hidden', marginLeft: i ? -14 : 0,
          border: '2px solid #1d2026', background: theme.panelAlt,
        }}
      >
        {ready ? (
          <Img src={staticFile(it.src)} style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: it.pos}} />
        ) : (
          <Shimmer w={54} h={54} radius={0} />
        )}
      </div>
    ))}
  </div>
);

export const ChatPanel: React.FC = () => {
  const frame = useCurrentFrame();
  const {pos, scroll} = chatLayout(frame);
  const show = (key: Key) => pos[key].p > 0;
  const style = (key: Key): React.CSSProperties => ({
    position: 'absolute', left: CARD_X, top: pos[key].y, opacity: pos[key].p,
    transform: `translateY(${(1 - pos[key].p) * 16}px)`,
  });

  const conceptPicked = frame >= T.pickConcept;
  const approved = frame >= T.approve;
  const framesDone = frame >= T.framesReady;
  const renderPct = interpolate(frame, [T.exportClick + 6, T.renderDone], [4, 100], clamp);
  const assetsReady = frame >= T.assetsReady;

  return (
    <div style={{position: 'absolute', left: 0, top: 0, width: CHAT_W, height: '100%', background: theme.panel, borderRight: `1px solid ${theme.line}`, overflow: 'hidden'}}>
      <div style={{position: 'absolute', inset: 0, transform: `translateY(${-scroll}px)`}}>
        {show('user') && (
          <div style={{...style('user'), left: 70, width: CHAT_W - 94}}>
            <div style={{borderRadius: 18, background: '#1f232a', padding: '14px 16px', fontSize: 14.5, lineHeight: 1.5, color: theme.text}}>{BRIEF}</div>
          </div>
        )}
        {show('steps') && (
          <div style={{...style('steps'), display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: theme.faint}}>
            {frame < T.briefCard ? <Spinner /> : <span style={{color: theme.accent}}>✓</span>}
            {frame < T.briefCard ? 'Membaca brief…' : 'Membaca brief, menyusun arah kreatif'}
          </div>
        )}
        {show('brief') && (
          <div style={style('brief')}>
            <Shell icon="◎" title="Brief" accent="15 detik · 9:16">
              <div>Iklan serum wajah gaya UGC untuk TikTok, rutinitas pagi yang hangat.</div>
              <div style={{marginTop: 4, fontSize: 13, color: theme.faint}}>Perempuan 20–30 · skincare harian</div>
            </Shell>
          </div>
        )}
        {show('concepts') && (
          <div style={style('concepts')}>
            <Shell icon="✦" title="Arah kreatif" accent="3 konsep">
              {[
                ['Rutinitas pagi di kamar', 'rekomendasi'],
                ['Review jujur sebelum–sesudah', ''],
                ['Close-up tetesan serum', ''],
              ].map(([title, tag], i) => (
                <div key={title} style={{fontSize: 14, color: 'rgba(255,255,255,.78)', lineHeight: 1.7}}>
                  {title}
                  {tag && !conceptPicked && <span style={{marginLeft: 8, fontSize: 12.5, color: 'rgba(212,255,100,.8)'}}>{tag}</span>}
                  {i === 0 && conceptPicked && <span style={{marginLeft: 8, fontSize: 12.5, color: '#6ee7b7'}}>dipilih</span>}
                </div>
              ))}
            </Shell>
            <div style={{marginTop: 8}}>
              <Button pressed={frame >= T.pickConcept && frame < T.pickConcept + 5}>{conceptPicked ? 'View' : 'Pilih konsep'}</Button>
            </div>
          </div>
        )}
        {show('script') && (
          <div style={style('script')}>
            <Shell icon="✎" title="Naskah" accent="Serum andalan tiap pagi">
              <div>1A — Bangun tidur, ambil serum di meja.</div>
              <div>1B — Teteskan serum, senyum ke kamera.</div>
              <div>1C — Close-up botol serum.</div>
            </Shell>
          </div>
        )}
        {show('assets') && (
          <div style={style('assets')}>
            <Shell icon="☺" title="Aset" accent="siap dicek">
              <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
                <Thumbs ready={assetsReady} items={[{src: 'director/d-character.jpg', pos: '18% 30%'}, {src: 'director/d-serum.jpg', pos: '24% 50%'}]} />
                <div style={{fontSize: 14, fontWeight: 650, color: 'rgba(255,255,255,.85)', lineHeight: 1.6}}>
                  Karakter — Nadia × 1<br />Properti — Serum × 1
                </div>
              </div>
            </Shell>
          </div>
        )}
        {show('request') && (
          <div style={style('request')}>
            <Shell icon="✧" title="Generate 3 gambar + 3 video (15 detik)">
              <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
                <Thumbs
                  ready={framesDone}
                  items={[
                    {src: 'director/d-video-poster.jpg', pos: '50% 40%'},
                    {src: 'director/d-serum.jpg', pos: '82% 40%'},
                    {src: 'director/d-serum.jpg', pos: '24% 50%'},
                  ]}
                />
                <div>
                  <div style={{marginBottom: 6}}>
                    {framesDone ? <Badge tone="green">Selesai</Badge> : approved ? <Badge tone="amber">Sedang dibuat</Badge> : <Badge tone="accent">Menunggu persetujuan</Badge>}
                  </div>
                  <div style={{fontSize: 14, color: 'rgba(255,255,255,.75)'}}>
                    Estimasi <strong style={{color: theme.accent}}>271,2 kredit</strong>
                  </div>
                </div>
              </div>
            </Shell>
            {!approved && (
              <div style={{marginTop: 8, display: 'flex', gap: 8}}>
                <Button width={CARD_W - 100} pressed={false}>Approve & generate</Button>
                <Button width={92}>Batal</Button>
              </div>
            )}
            {approved && frame < T.approve + 6 && (
              <div style={{marginTop: 8, display: 'flex', gap: 8}}>
                <Button width={CARD_W - 100} pressed>Approve & generate</Button>
                <Button width={92}>Batal</Button>
              </div>
            )}
          </div>
        )}
        {show('final') && (
          <div style={style('final')}>
            <Shell icon="▶" title="Video final" accent={frame >= T.renderDone ? 'siap' : 'dirender'}>
              {frame < T.renderDone ? (
                <>
                  <div style={{display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,.75)'}}>
                    <Spinner /> Menggabungkan shot {Math.min(3, 1 + Math.floor(renderPct / 34))}/3
                  </div>
                  <div style={{marginTop: 8, height: 6, borderRadius: 99, background: 'rgba(255,255,255,.08)'}}>
                    <div style={{width: `${renderPct}%`, height: '100%', borderRadius: 99, background: theme.accent}} />
                  </div>
                </>
              ) : (
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <span style={{fontSize: 13, color: theme.faint}}>3 shot · 9:16 · MP4</span>
                  <Button primary width={120}>Download</Button>
                </div>
              )}
            </Shell>
          </div>
        )}
      </div>

      {/* Composer pinned to the bottom of the chat */}
      <div
        style={{
          position: 'absolute', left: 16, right: 16, bottom: 16, height: 116, borderRadius: 18,
          border: `1px solid ${theme.line}`, background: theme.panelAlt, padding: 14, fontSize: 14, color: theme.faint,
        }}
      >
        Balas Director, atau ketik @ untuk menyebut shot…
        <div style={{position: 'absolute', left: 14, bottom: 12, display: 'flex', gap: 6}}>
          <span style={{fontSize: 12, padding: '4px 10px', borderRadius: 99, background: 'rgba(212,255,100,.15)', color: theme.accent}}>Pandu aku</span>
          <span style={{fontSize: 12, padding: '4px 10px', borderRadius: 99, color: theme.faint}}>Langsung jadi</span>
        </div>
        <div style={{position: 'absolute', right: 12, bottom: 10, width: 34, height: 34, borderRadius: 99, background: 'rgba(255,255,255,.08)', display: 'grid', placeItems: 'center', color: theme.muted}}>↑</div>
      </div>
    </div>
  );
};
