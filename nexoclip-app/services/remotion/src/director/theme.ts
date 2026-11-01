// Colors and labels taken from components/director so the walkthrough matches the real app.
export const theme = {
  bg: '#07090e',
  panel: '#0b0e13',
  panelAlt: '#11151b',
  card: '#17191d',
  line: 'rgba(255,255,255,0.09)',
  text: '#e6e7ea',
  muted: 'rgba(255,255,255,0.5)',
  faint: 'rgba(255,255,255,0.35)',
  accent: '#d4ff64',
  accentInk: '#10130a',
  violet: 'rgba(139,92,246,0.6)',
  sky: 'rgba(14,165,233,0.5)',
  amber: 'rgba(245,158,11,0.45)',
  font: 'Inter, "Liberation Sans", Arial, sans-serif',
};

// Canvas 1920×1080. The app window sits in a browser frame; positions below are in app
// pixels (origin = top-left of the app area) and converted to canvas pixels for the cursor.
export const FRAME = {x: 160, y: 56, w: 1600, h: 860, bar: 44};
export const APP = {x: FRAME.x, y: FRAME.y + FRAME.bar, w: FRAME.w, h: FRAME.h - FRAME.bar};
export const CHAT_W = 520;
export const at = (x: number, y: number) => ({x: APP.x + x, y: APP.y + y});

export const BRIEF = 'Iklan TikTok 15 detik untuk serum wajah, gaya UGC. Perempuan Indonesia pakai serum tiap pagi.';

// Timeline of the walkthrough, in frames at 30 fps.
export const T = {
  frameIn: 80,
  typeStart: 115,
  typeEnd: 205,
  pickMode: 232,
  send: 268,
  workspace: 285,
  userMsg: 292,
  briefCard: 318,
  conceptCard: 342,
  pickConcept: 384,
  scriptCard: 420,
  assetCard: 440,
  assetsReady: 470,
  requestCard: 490,
  approve: 532,
  framesReady: 585,
  timelineTab: 612,
  dragStart: 645,
  dragEnd: 672,
  exportClick: 705,
  renderDone: 748,
  videoStart: 752,
  endCard: 905,
  total: 975,
};
