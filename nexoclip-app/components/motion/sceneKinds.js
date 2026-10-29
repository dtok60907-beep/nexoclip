// The shape of a Motion scene, shared by the studio, the AI director and the project store so all three agree.
// A scene is either
//   - kind 'text': a title, subtitle and call to action, animated by the style's own family (MotionScene.js), or
//   - kind 'layers': a stack of layers (heading, number, list, price, ...), each with an entrance, an optional
//     emphasis loop and an optional exit from the animation library (animations.js). The style still draws the
//     background and sets the colours and type.
// A scene can come in with a transition over the end of the one before, carry a voiceover line (with word timings
// for the captions) and gets sound effects placed on its key moments (sceneSfx).

import { ENTRANCES, EXITS, LOOPS } from './animations.js';
import { cleanLottieSrc } from './lottieLibrary.js';

export const SCENE_LIMITS = {
  min: 1, max: 60, minSeconds: 3, maxSeconds: 12,
  title: 60, subtitle: 90, cta: 28, layers: 6, vo: 220, musicPrompt: 400,
};
// Speech runs at about 14 characters a second; a scene must last as long as its voiceover.
export const SPEECH_CHARS_PER_SECOND = 14;
export const MAX_PRICE = 1e10;
export const MAX_COUNT = 10;

export const KINDS = [
  { id: 'text', label: 'Teks' },
  { id: 'layers', label: 'Layer' },
];

// Each layer type: the fields it uses (with max lengths) and the entrance it gets when none is picked.
export const LAYER_TYPES = {
  kicker: { label: 'Label kecil', fields: { text: 40 }, entrance: 'fade' },
  heading: { label: 'Judul', fields: { text: 60 }, entrance: 'words' },
  text: { label: 'Teks', fields: { text: 110 }, entrance: 'slide-up' },
  number: { label: 'Angka', fields: { value: 16, text: 40 }, entrance: 'scale' },
  list: { label: 'Daftar', fields: { items: 40 }, entrance: 'slide-up' },
  price: { label: 'Harga coret', fields: { was: 0, now: 0 }, entrance: 'scale' },
  code: { label: 'Kode promo', fields: { text: 16 }, entrance: 'elastic' },
  timer: { label: 'Hitung mundur', fields: { value: 8, text: 40 }, entrance: 'fade' },
  quote: { label: 'Testimoni', fields: { text: 110, author: 40, role: 40, rating: 0 }, entrance: 'fade' },
  button: { label: 'Tombol', fields: { text: 28 }, entrance: 'spring' },
  badge: { label: 'Stiker', fields: { text: 16 }, entrance: 'elastic' },
  progress: { label: 'Bar persen', fields: { value: 3, text: 40 }, entrance: 'fade' },
  bars: { label: 'Grafik batang', fields: { values: 0, text: 40 }, entrance: 'fade' },
  line: { label: 'Grafik garis', fields: { values: 0, value: 16, text: 40 }, entrance: 'fade' },
  flow: { label: 'Diagram alur', fields: { items: 28 }, entrance: 'fade' },
  chat: { label: 'Chat', fields: { text: 30, messages: 90 }, entrance: 'slide-up' },
  lottie: { label: 'Animasi Lottie', fields: { src: 0, size: 0, text: 40 }, entrance: 'scale' },
};
export const LOTTIE_SIZES = { s: { label: 'Kecil', px: 260 }, m: { label: 'Sedang', px: 420 }, l: { label: 'Besar', px: 620 } };
export const MAX_ITEMS = 4;
export const MAX_BARS = 6;
export const MAX_POINTS = 12;
export const MAX_MESSAGES = 6;

// How a scene comes in over the end of the one before it (none for the first scene).
export const TRANSITIONS = {
  cut: { label: 'Potong langsung' },
  fade: { label: 'Pudar' },
  wipe: { label: 'Sapuan' },
  slide: { label: 'Geser' },
  zoom: { label: 'Zoom' },
  circle: { label: 'Lingkaran' },
  paper: { label: 'Kertas sobek' },
};
export const TRANSITION_SECONDS = 0.5;

// How a layers scene is arranged: everything stacked in the middle, the visual beside (or above) the words, or
// the visual large behind them.
export const LAYOUTS = {
  center: { label: 'Tengah' },
  split: { label: 'Berdampingan' },
  hero: { label: 'Visual besar' },
};
// The layer types that count as "the visual" of a split or hero layout.
export const VISUAL_TYPES = new Set(['lottie', 'number', 'bars', 'line', 'progress', 'timer', 'price', 'flow', 'chat', 'quote']);
// A slow camera move over the whole scene, so a long hold never sits still.
export const CAMERAS = {
  push: { label: 'Zoom masuk pelan' },
  pull: { label: 'Zoom keluar pelan' },
  drift: { label: 'Geser pelan' },
  still: { label: 'Diam' },
};

// How the voiceover captions look (MotionScene Captions).
export const CAPTION_STYLES = {
  karaoke: { label: 'Karaoke', hint: 'Kata yang diucapkan menyala' },
  box: { label: 'Kotak', hint: 'Kata aktif di kotak warna' },
  one: { label: 'Satu kata', hint: 'Satu kata besar per ketukan' },
  paper: { label: 'Kertas', hint: 'Label kertas dengan selotip' },
  neon: { label: 'Neon', hint: 'Teks bercahaya' },
  subtitle: { label: 'Subtitle', hint: 'Rapi di bar gelap' },
};

const text = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
// Editor fields keep what the user is typing (spaces included); only the length is capped.
const raw = (value, max) => String(value ?? '').slice(0, max);
const price = (value) => {
  const number = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[^\d]/g, ''));
  return Number.isFinite(number) && number > 0 ? Math.min(MAX_PRICE, Math.round(number)) : 0;
};
const seconds = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.min(SCENE_LIMITS.maxSeconds, Math.round(number * 10) / 10) : fallback;
};

// "02:00:00", "15:00" or "10" → seconds (0 when it is not a time).
export function countdownSeconds(value) {
  const parts = String(value ?? '').trim().split(':');
  if (!parts.length || parts.length > 3 || parts.some((part) => !/^\d{1,2}$/.test(part))) return 0;
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}

export function cleanLayer(layer, { loose = false } = {}) {
  const s = loose ? raw : text;
  const type = LAYER_TYPES[layer?.type] ? layer.type : 'text';
  const spec = LAYER_TYPES[type];
  const out = { type, entrance: ENTRANCES[layer?.entrance] ? layer.entrance : spec.entrance };
  if (LOOPS[layer?.loop]) out.loop = layer.loop;
  if (EXITS[layer?.exit]) out.exit = layer.exit;
  if (layer?.at !== undefined && layer?.at !== null && layer?.at !== '') out.at = seconds(layer.at, 0);
  for (const [field, max] of Object.entries(spec.fields)) {
    if (field === 'items') {
      out.items = (Array.isArray(layer?.items) ? layer.items : []).slice(0, MAX_ITEMS).map((item) => s(item, max));
      if (!loose) out.items = out.items.filter(Boolean);
    } else if (field === 'values') {
      out.values = (Array.isArray(layer?.values) ? layer.values : []).slice(0, type === 'line' ? MAX_POINTS : MAX_BARS).map((v) => Math.max(0, Number(v) || 0));
    } else if (field === 'messages') {
      out.messages = (Array.isArray(layer?.messages) ? layer.messages : []).slice(0, MAX_MESSAGES)
        .map((message) => ({ from: message?.from === 'me' ? 'me' : 'them', text: s(message?.text, max) }));
      if (!loose) out.messages = out.messages.filter((message) => message.text);
    } else if (field === 'was' || field === 'now') {
      out[field] = price(layer?.[field]);
    } else if (field === 'src') {
      out.src = loose ? String(layer?.src ?? '').slice(0, 400) : cleanLottieSrc(layer?.src);
    } else if (field === 'size') {
      out.size = LOTTIE_SIZES[layer?.size] ? layer.size : 'm';
    } else if (field === 'rating') {
      out.rating = Math.min(5, Math.max(0, Math.round(Number(layer?.rating) || 0)));
    } else {
      out[field] = s(layer?.[field], max);
    }
  }
  if (type === 'code') out.text = out.text.toUpperCase().replace(/\s/g, '');
  return out;
}

// A generated audio file in the workspace's assets (elevenlabsAudio.js via /api/motion/audio).
const AUDIO_URL = /^\/api\/assets\/[0-9a-f-]{36}\/download\?workspace_id=[0-9a-f-]{36}$/i;
export function cleanAudioFile(file) {
  if (!file || !AUDIO_URL.test(String(file.url || ''))) return null;
  const seconds = Number(file.seconds);
  return {
    url: file.url,
    seconds: Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 100) / 100 : 0,
    text: String(file.text ?? '').slice(0, 2000),
    ...(file.voiceId ? { voiceId: String(file.voiceId).slice(0, 40) } : {}),
    ...(Array.isArray(file.words) && file.words.length ? {
      words: file.words.slice(0, 400).map((word) => ({ w: String(word?.w ?? '').slice(0, 40), s: Number(word?.s) || 0, e: Number(word?.e) || 0 })).filter((word) => word.w),
    } : {}),
  };
}

// The video's soundtrack: a voice for the voiceover and one music track under the whole video.
export function cleanAudio(audio, { loose = false } = {}) {
  const s = loose ? raw : text;
  const volume = Number(audio?.musicVolume);
  return {
    voiceId: /^[A-Za-z0-9]{10,40}$/.test(String(audio?.voiceId || '')) ? audio.voiceId : '',
    musicPrompt: s(audio?.musicPrompt, SCENE_LIMITS.musicPrompt),
    musicVolume: Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0.5,
    music: cleanAudioFile(audio?.music),
    captions: audio?.captions !== false,
    captionStyle: CAPTION_STYLES[audio?.captionStyle] ? audio.captionStyle : 'karaoke',
    sfx: audio?.sfx !== false,
    sfxVolume: Number.isFinite(Number(audio?.sfxVolume)) && audio?.sfxVolume !== null && audio?.sfxVolume !== '' ? Math.min(1, Math.max(0, Number(audio.sfxVolume))) : 0.5,
  };
}

// One scene in the shape MotionScene plays. `loose` keeps spaces as typed (the editor); the AI and the store trim.
export function cleanScene(scene, { loose = false } = {}) {
  const s = loose ? raw : text;
  const kind = scene?.kind === 'layers' ? 'layers' : 'text';
  const out = {
    kind,
    title: s(scene?.title, SCENE_LIMITS.title),
    subtitle: s(scene?.subtitle, SCENE_LIMITS.subtitle),
    cta: s(scene?.cta, SCENE_LIMITS.cta),
    seconds: Math.min(SCENE_LIMITS.maxSeconds, Math.max(SCENE_LIMITS.minSeconds, Math.round(Number(scene?.seconds) || 4))),
    vo: s(scene?.vo, SCENE_LIMITS.vo),
    transition: TRANSITIONS[scene?.transition] ? scene.transition : 'fade',
    camera: CAMERAS[scene?.camera] ? scene.camera : 'push',
  };
  const voAudio = cleanAudioFile(scene?.voAudio);
  if (voAudio) out.voAudio = voAudio;
  if (kind === 'layers') {
    out.layout = LAYOUTS[scene?.layout] ? scene.layout : 'center';
    out.layers = (Array.isArray(scene?.layers) ? scene.layers : []).slice(0, SCENE_LIMITS.layers).map((layer) => cleanLayer(layer, { loose }));
  }
  return out;
}

const layerText = (layer) => [layer.text, layer.value, layer.author, layer.role, ...(layer.items || []), ...(layer.messages || []).map((message) => message.text)]
  .map((part) => String(part || '')).join('');

// A scene worth playing has something to show.
export const hasContent = (scene) => (scene.kind === 'layers'
  ? scene.layers.some((layer) => layerText(layer) || layer.now || layer.values?.length || layer.src)
  : Boolean(scene.title));

// The text a viewer has to read in a scene.
export const sceneText = (scene) => (scene.kind === 'layers'
  ? scene.layers.map(layerText).join('')
  : [scene.title, scene.subtitle, scene.cta].map((part) => String(part || '')).join(''));

// When each layer of a scene starts: its own `at`, or a stagger after the one before it.
// With the voiceover's word timings (`words`, from `offset` seconds into the scene's clock), a layer without its own
// `at` comes in on the first spoken word that is also in it (a little before), so the screen follows the narration.
const tokens = (value) => String(value || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((word) => word.length >= 4);
const layerWords = (layer) => tokens([layer.text, layer.value, ...(layer.items || []), ...(layer.messages || []).map((m) => m.text)].join(' '));

export function layerStarts(layers, words = null, offset = 0) {
  let next = 0.25;
  let spoken = 0; // index of the next spoken word a layer may match
  const said = words?.length >= 3 ? words.map((word) => tokens(word.w)[0] || '') : null;
  return layers.map((layer) => {
    let start = layer.at ?? next;
    if (layer.at === undefined && said) {
      const wanted = new Set(layerWords(layer));
      const hit = wanted.size ? said.findIndex((word, i) => i >= spoken && word && wanted.has(word)) : -1;
      if (hit >= 0) {
        start = Math.max(next, offset + words[hit].s - 0.2);
        spoken = hit + 1;
      }
    }
    const entrance = ENTRANCES[layer.entrance];
    const items = layer.type === 'list' || layer.type === 'flow' ? Math.max(0, (layer.items?.length || 1) - 1) * (layer.type === 'flow' ? 0.6 : 0.3)
      : layer.type === 'chat' ? chatTimes(layer.messages || [], 0).end : 0;
    next = start + Math.min(0.6, (entrance?.seconds || 0.6) * 0.6) + items;
    return start;
  });
}

// Seconds a viewer needs for a scene: the entrances plus ~13 characters a second of reading, plus the time a layer's
// own animation takes (a price dropping, a countdown running out).
export const READ_CHARS_PER_SECOND = 13;
export const ENTRANCE_SECONDS = 1.2;

export const speechSeconds = (vo) => (vo ? Math.ceil(0.6 + String(vo).length / SPEECH_CHARS_PER_SECOND) : 0);

export function readingSeconds(scene) {
  const spoken = Math.max(speechSeconds(scene.vo), Math.ceil((scene.voAudio?.seconds || 0) + 0.4));
  let extra = 0;
  if (scene.kind === 'layers') {
    const starts = layerStarts(scene.layers);
    extra = Math.max(0, (starts[starts.length - 1] || 0) - 0.25);
    for (const layer of scene.layers) {
      if (layer.type === 'price') extra += 1.5;
      if (layer.type === 'line') extra += 1.4;
      if (layer.type === 'timer' && !String(layer.value || '').includes(':')) extra += Math.min(MAX_COUNT, countdownSeconds(layer.value)) + 0.5;
    }
  }
  return Math.max(spoken, Math.ceil(ENTRANCE_SECONDS + extra + sceneText(scene).length / READ_CHARS_PER_SECOND));
}

// When each chat message shows: a typing indicator before the other person's replies, a read gap before yours.
// Returns { messages: [{ typing, at }], end } in seconds from `start`.
export function chatTimes(messages, start) {
  let cursor = start + 0.3;
  const times = messages.map((message, index) => {
    const typing = message.from === 'them' && index > 0 ? cursor : null;
    if (typing !== null) cursor += 0.8;
    const at = cursor;
    cursor += 0.5 + Math.min(1.6, String(message.text || '').length / 26);
    return { typing, at };
  });
  return { messages: times, end: cursor - start };
}

// Sound effects on a scene's key moments (seconds from the scene's start): a whoosh on the way in, an impact on the
// hook, pops and pings where layers land. At most five per scene so they never turn into clutter.
export function sceneSfx(scene, index, offset = 0) {
  const events = [];
  const add = (at, name, volume = 1) => events.push({ at: name === 'whoosh' ? at : Math.max(0, at), name, volume });
  if (index > 0 && scene.transition !== 'cut') add(-TRANSITION_SECONDS * 0.7, 'whoosh', 0.8);
  if (scene.kind !== 'layers') {
    if (index === 0) add(0.3, 'impact', 0.9);
    if (scene.cta) add(1.6, 'pop', 0.8);
    return events;
  }
  const starts = layerStarts(scene.layers, scene.voAudio?.words, offset);
  scene.layers.forEach((layer, i) => {
    const at = starts[i];
    if (index === 0 && i === 0 && (layer.type === 'heading' || layer.type === 'number')) add(at + 0.1, 'impact', 0.9);
    if (['badge', 'button', 'code'].includes(layer.type)) add(at + 0.1, 'pop');
    if (layer.type === 'number') add(at + 1.4, 'ping', 0.8);
    if (layer.type === 'price') { add(at, 'pop', 0.7); add(at + 1.5, 'impact', 0.8); }
    if (layer.type === 'list' || layer.type === 'flow') (layer.items || []).forEach((_, k) => add(at + k * (layer.type === 'flow' ? 0.6 : 0.3), 'pop', 0.55));
    if (layer.type === 'chat') chatTimes(layer.messages || [], at).messages.forEach((time) => add(time.at, 'pop', 0.6));
    if (layer.type === 'quote' && layer.rating > 0) add(at + 0.2, 'sparkle', 0.6);
    if (layer.type === 'line') add(at + 1.6, 'ping', 0.7);
    if (layer.type === 'timer' && !String(layer.value || '').includes(':')) {
      const count = Math.min(MAX_COUNT, countdownSeconds(layer.value));
      for (let k = 0; k < count; k += 1) add(at + 0.3 + k, 'tick', 0.7);
    }
  });
  const transition = events.filter((event) => event.name === 'whoosh');
  const rest = events.filter((event) => event.name !== 'whoosh').sort((a, b) => a.at - b.at);
  const timer = scene.layers.some((layer) => layer.type === 'timer');
  return [...transition, ...rest.slice(0, timer ? 12 : 5)];
}

export const formatRupiah = (value) => `Rp${Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

// "10.000+", "87%", "4,8", "Rp25 rb" → the number to count to and how to print it on the way there.
export function parseCount(value) {
  const match = String(value || '').match(/^(.*?)(\d[\d.,]*)(.*)$/);
  if (!match) return null;
  const [, prefix, digits, suffix] = match;
  let decimals = 0;
  let decimalMark = ',';
  let grouping = '';
  let number;
  if (digits.includes(',') && !/,\d{3}(\D|$)/.test(digits)) {
    const [whole, fraction] = digits.split(',');
    number = Number(`${whole.replace(/\./g, '')}.${fraction}`);
    decimals = fraction.length;
    grouping = whole.includes('.') ? '.' : '';
  } else if (/\.\d{3}(\D|$)/.test(digits) || /,\d{3}(\D|$)/.test(digits)) {
    grouping = digits.includes('.') ? '.' : ',';
    number = Number(digits.replace(/[.,]/g, ''));
  } else if (digits.includes('.')) {
    number = Number(digits);
    decimals = digits.split('.')[1].length;
    decimalMark = '.';
  } else {
    number = Number(digits);
  }
  if (!Number.isFinite(number)) return null;
  const format = (n) => {
    const [whole, fraction] = n.toFixed(decimals).split('.');
    const grouped = grouping ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, grouping) : whole;
    return `${prefix}${grouped}${fraction ? decimalMark + fraction : ''}${suffix}`;
  };
  return { number, format };
}
