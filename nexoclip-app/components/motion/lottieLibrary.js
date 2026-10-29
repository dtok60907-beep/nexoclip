// Where a Motion Lottie layer gets its animation, as one `src` string:
//   noto:<name>                    an animated emoji from Google's Noto set (notoEmoji.js), the built-in library
//   https://…lottiefiles…/x.json   a free animation linked from LottieFiles (or lottie.host)
//   /api/motion/lottie/<id>?…      a .json the user uploaded (app/api/motion/lottie)

import { NOTO_EMOJI } from './notoEmoji.js';

const NOTO = new Map(NOTO_EMOJI.map(([name, codepoint, group]) => [name, { name, codepoint, group }]));
const LOTTIEFILES = /^https:\/\/(assets\d*(-v2)?\.lottiefiles\.com|lottie\.host)\/[\w\-./%]+\.json$/i;
const UPLOAD = /^\/api\/motion\/lottie\/[0-9a-f-]{36}\?workspace_id=[0-9a-f-]{36}$/i;

export const LOTTIE_HOSTS = ['https://fonts.gstatic.com', 'https://*.lottiefiles.com', 'https://lottie.host'];
export const NOTO_CREDIT = 'Animated emoji: Google Noto Emoji Animation, CC BY 4.0';

export const notoEntry = (name) => NOTO.get(name) || null;

// The emoji character for a Noto name (a cheap preview in the editor).
export function emojiChar(name) {
  const entry = NOTO.get(name);
  if (!entry) return '';
  try { return String.fromCodePoint(...entry.codepoint.split('_').map((hex) => parseInt(hex, 16))); } catch { return ''; }
}

// A Noto name for whatever the AI or a search wrote: the exact name, or the first one containing every word of it.
export function findNoto(query) {
  const key = String(query || '').toLowerCase().trim().replace(/^noto:/, '').replace(/[\s_]+/g, '-');
  if (!key) return null;
  if (NOTO.has(key)) return key;
  const words = key.split('-').filter(Boolean);
  const hit = NOTO_EMOJI.find(([name]) => words.every((word) => name.includes(word)));
  return hit ? hit[0] : null;
}

export function searchNoto(query, limit = 60) {
  const words = String(query || '').toLowerCase().split(/[\s,]+/).filter(Boolean);
  const list = words.length ? NOTO_EMOJI.filter(([name, , group]) => words.every((word) => name.includes(word) || group.includes(word))) : NOTO_EMOJI;
  return list.slice(0, limit).map(([name]) => name);
}

// A cleaned `src` ('' when it is none of the three kinds). Bare names are looked up in the library.
export function cleanLottieSrc(src) {
  const value = String(src || '').trim();
  if (LOTTIEFILES.test(value) || UPLOAD.test(value)) return value;
  const name = findNoto(value);
  return name ? `noto:${name}` : '';
}

export function lottieUrl(src) {
  if (src.startsWith('noto:')) {
    const entry = NOTO.get(src.slice(5));
    return entry ? `https://fonts.gstatic.com/s/e/notoemoji/latest/${entry.codepoint}/lottie.json` : '';
  }
  return src;
}

export const MAX_LOTTIE_BYTES = 1.5 * 1024 * 1024;

// A Lottie document safe to play: the shape checked, and every expression (a string `x` on an animated property,
// code the full lottie-web would run) removed. Returns null when it is not a Lottie animation.
export function sanitizeLottie(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (!['fr', 'ip', 'op', 'w', 'h'].every((key) => Number.isFinite(Number(data[key]))) || !Array.isArray(data.layers)) return null;
  const strip = (value, depth) => {
    if (depth > 200) return null;
    if (Array.isArray(value)) return value.map((item) => strip(item, depth + 1));
    if (!value || typeof value !== 'object') return value;
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === 'x' && typeof item === 'string') continue;
      out[key] = strip(item, depth + 1);
    }
    return out;
  };
  return strip(data, 0);
}
