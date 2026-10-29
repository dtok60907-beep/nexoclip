// The motion graphics styles shown in the Motion studio. Each style is one animation family
// (how things move, see MotionScene.js) plus a palette and type; a few families take a
// `variant` for the details that set a style apart (a blueprint grid, chalk on a board, ...).

export const FAMILIES = [
  { id: 'clean', label: 'Bersih' },
  { id: 'pop', label: 'Pop' },
  { id: 'paper', label: 'Kertas' },
  { id: 'sketch', label: 'Sketsa' },
  { id: 'tech', label: 'Teknologi' },
  { id: 'film', label: 'Sinematik' },
  { id: 'retro', label: 'Retro' },
  { id: 'light', label: 'Cahaya' },
];

const DISPLAY = 'var(--font-display), var(--font-sans), sans-serif';
const SANS = 'var(--font-sans), sans-serif';
const MONO = 'var(--font-mono), ui-monospace, monospace';
const SERIF = 'Georgia, "Times New Roman", serif';
const HAND = '"Segoe Print", "Bradley Hand", "Comic Neue", var(--font-sans), cursive';

const style = (id, name, family, palette, extra = {}) => ({
  id, name, family, palette, font: DISPLAY, ...extra,
});

export const STYLES = [
  style('auto', 'Otomatis', 'clean', { bg: '#0b0c0a', fg: '#f2eee5', accent: '#d4ff64', muted: '#8a8d84' }, { hint: 'Kami pilihkan yang paling cocok' }),
  style('scribble-3d', 'Scribble 3D', 'sketch', { bg: '#fff7e8', fg: '#1d1a16', accent: '#ff5a36', muted: '#b9ab94' }, { font: HAND, variant: 'depth' }),
  style('scribble-2d', 'Scribble 2D', 'sketch', { bg: '#fdfcf7', fg: '#1d1d1b', accent: '#3a6cff', muted: '#c8c6bc' }, { font: HAND }),
  style('modern-flat', 'Modern Flat', 'clean', { bg: '#2f5bff', fg: '#ffffff', accent: '#ffd23f', muted: '#a9bbff' }, { variant: 'blocks' }),
  style('futuristik', 'Futuristik', 'tech', { bg: '#05070f', fg: '#e8f3ff', accent: '#4de2ff', muted: '#3a4a66' }),
  style('pop-ceria', 'Pop Ceria', 'pop', { bg: '#ffe14d', fg: '#1b1446', accent: '#ff4f8b', muted: '#5b3df5' }),
  style('lanskap-kertas', 'Lanskap Kertas', 'paper', { bg: '#cfe8e0', fg: '#1f3b36', accent: '#f29e4c', muted: '#7fb7a6' }, { variant: 'hills' }),
  style('paper-cutout', 'Paper Cutout', 'paper', { bg: '#f6efe3', fg: '#2a2420', accent: '#e8553e', muted: '#4e8ad1' }),
  style('promo-dither', 'Promo Dither', 'retro', { bg: '#111111', fg: '#f5f5f0', accent: '#ff3d2e', muted: '#555555' }, { font: MONO, variant: 'dither' }),
  style('ui-kilat', 'UI Kilat', 'tech', { bg: '#f4f5f8', fg: '#14161c', accent: '#6c4dff', muted: '#c9ccd6' }, { font: SANS, variant: 'ui' }),
  style('kursor-kolab', 'Kursor Kolab', 'tech', { bg: '#ffffff', fg: '#16171b', accent: '#ff6b3d', muted: '#dfe1e7' }, { font: SANS, variant: 'cursors' }),
  style('monochrome-film', 'Monochrome Film', 'film', { bg: '#0d0d0d', fg: '#efefef', accent: '#bdbdbd', muted: '#5c5c5c' }, { font: SERIF }),
  style('siluet-senja', 'Siluet Senja', 'film', { bg: '#2b1240', fg: '#fff1e0', accent: '#ff8a3d', muted: '#7a2e5c' }, { variant: 'sunset' }),
  style('sketsa-papan', 'Sketsa Papan', 'sketch', { bg: '#f3f1ea', fg: '#22262b', accent: '#e23d3d', muted: '#b3b7bd' }, { font: HAND, variant: 'board' }),
  style('arsip-kuno', 'Arsip Kuno', 'film', { bg: '#e9dcc0', fg: '#3b2a17', accent: '#8b2c1c', muted: '#b59d74' }, { font: SERIF, variant: 'archive' }),
  style('kuas-tinta', 'Kuas Tinta', 'sketch', { bg: '#f2ede2', fg: '#121212', accent: '#c4271b', muted: '#a49e91' }, { font: SERIF, variant: 'brush' }),
  style('retro-80an', 'Retro 80-an', 'retro', { bg: '#1a0633', fg: '#fff3fb', accent: '#ff3cac', muted: '#2bd2ff' }, { variant: 'grid' }),
  style('blueprint', 'Blueprint', 'sketch', { bg: '#0f3d7a', fg: '#e6f0ff', accent: '#ffffff', muted: '#5f8fcf' }, { font: MONO, variant: 'blueprint' }),
  style('papan-kapur', 'Papan Kapur', 'sketch', { bg: '#21352b', fg: '#eef2e8', accent: '#ffe27a', muted: '#4f6b5c' }, { font: HAND, variant: 'chalk' }),
  style('isometrik-cerah', 'Isometrik Cerah', 'pop', { bg: '#e9f4ff', fg: '#13224a', accent: '#ff7a59', muted: '#5ac8a8' }, { variant: 'iso' }),
  style('ui-website', 'UI Website', 'tech', { bg: '#eef0f4', fg: '#111318', accent: '#2563eb', muted: '#cfd4de' }, { font: SANS, variant: 'browser' }),
  style('infografis-pop', 'Infografis Pop', 'pop', { bg: '#fff8ec', fg: '#1d2340', accent: '#ff5d5d', muted: '#3fb8af' }, { variant: 'chart' }),
  style('tenang-minimalis', 'Tenang Minimalis', 'clean', { bg: '#efebe4', fg: '#2b2925', accent: '#8a9a7b', muted: '#c7c1b5' }, { font: SANS, variant: 'calm' }),
  style('kinetik-hud', 'Kinetik HUD', 'tech', { bg: '#050a07', fg: '#d9ffe8', accent: '#39ff88', muted: '#1f4a33' }, { font: MONO, variant: 'hud' }),
  style('neon-game', 'Neon Game', 'retro', { bg: '#07021a', fg: '#ffffff', accent: '#00f0ff', muted: '#ff00c8' }, { variant: 'neon' }),
  style('pitch-minimal', 'Pitch Minimal', 'clean', { bg: '#ffffff', fg: '#0e0e10', accent: '#ff4d00', muted: '#d9d9de' }, { font: SANS }),
  style('layar-pixel', 'Layar Pixel', 'retro', { bg: '#14182b', fg: '#f8f4d8', accent: '#7cf05a', muted: '#3b4573' }, { font: MONO, variant: 'pixel' }),
  style('reel-tegas', 'Reel Tegas', 'clean', { bg: '#0a0a0a', fg: '#ffffff', accent: '#ffe600', muted: '#3a3a3a' }, { variant: 'bold' }),
  style('ruang-cerita', 'Ruang Cerita', 'film', { bg: '#1c1712', fg: '#f6ead8', accent: '#e0a458', muted: '#5a4a3a' }, { font: SERIF, variant: 'story' }),
  style('produk-gelap', 'Produk Gelap', 'light', { bg: '#060606', fg: '#f4f4f4', accent: '#c9a96e', muted: '#2a2a2a' }, { variant: 'spot' }),
  style('promo-heboh', 'Promo Heboh', 'pop', { bg: '#ff2e4d', fg: '#ffffff', accent: '#ffe600', muted: '#1a1a1a' }, { variant: 'burst' }),
  style('edukasi-kertas', 'Edukasi Kertas', 'paper', { bg: '#fffdf6', fg: '#1f2a44', accent: '#3d7cff', muted: '#f5c84c' }, { font: SANS, variant: 'notebook' }),
  style('garis-tinta', 'Garis Tinta', 'sketch', { bg: '#ffffff', fg: '#111111', accent: '#111111', muted: '#cfcfcf' }, { font: SERIF, variant: 'ink' }),
  style('jejak-cahaya', 'Jejak Cahaya', 'light', { bg: '#03030a', fg: '#ffffff', accent: '#7b5cff', muted: '#ff5ca8' }, { variant: 'streaks' }),
  style('garis-satu', 'Garis Satu', 'sketch', { bg: '#f7f5f0', fg: '#1a1a1a', accent: '#1a1a1a', muted: '#d8d4cb' }, { font: SANS, variant: 'oneline' }),
];

// "Buat gaya sendiri": the user picks the family and colours.
export const CUSTOM_ID = 'custom';
export const DEFAULT_CUSTOM = {
  family: 'pop',
  palette: { bg: '#101014', fg: '#ffffff', accent: '#d4ff64', muted: '#4a4a55' },
  font: DISPLAY,
};

export const FONTS = [
  { id: 'display', label: 'Display', value: DISPLAY },
  { id: 'sans', label: 'Sans', value: SANS },
  { id: 'serif', label: 'Serif', value: SERIF },
  { id: 'mono', label: 'Mono', value: MONO },
  { id: 'hand', label: 'Tulisan tangan', value: HAND },
];

export function resolveStyle(styleId, custom) {
  if (styleId === CUSTOM_ID) {
    return { id: CUSTOM_ID, name: 'Gaya sendiri', ...DEFAULT_CUSTOM, ...custom, palette: { ...DEFAULT_CUSTOM.palette, ...custom?.palette } };
  }
  return STYLES.find((item) => item.id === styleId) || STYLES[0];
}
