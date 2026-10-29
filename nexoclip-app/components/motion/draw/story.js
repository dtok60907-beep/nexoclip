import { DEFAULT_FORMAT, FORMAT_IDS } from './layout.js';

// What a drawn-story video is made of, shared by the studio, the worker and the player: the pace (how fast it
// talks, cuts and moves), the drawing style, and the story document stored in a Motion project
// ({ kind: 'story', story }).

const num = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// The feel of a video. Each pace changes the words per scene, the narrator, the cuts, the camera and the music.
export const PACES = [
  {
    id: 'santai', label: 'Santai', hint: 'Pelan dan tenang, seperti ngobrol malam',
    words: [6, 14], sceneSeconds: [2.5, 5.5], transition: 0.45, camera: 0.6, hardCamerasPerScene: 0,
    tone: 'tenang dan hangat, seperti ngobrol malam dengan teman', voiceTag: '[calm]', stability: 0.5,
    entrance: 'objek utama masuk pelan dalam 0.2-0.6 detik, gerak lembut dan mengalir, tanpa hentakan keras',
    music: 'lo-fi piano ballad, 72 BPM, in F major, calm and warm late-night mood, felted upright piano and soft tape-saturated pads, dusty vinyl crackle, start with just piano then bring in a soft brushed beat, instrumental only, no vocals, no lead melody, background bed under a voiceover',
  },
  {
    id: 'normal', label: 'Normal', hint: 'Enak diikuti, ritme sedang',
    words: [4, 12], sceneSeconds: [1.8, 4.5], transition: 0.3, camera: 1, hardCamerasPerScene: 0.25,
    tone: 'santai tapi jelas, seperti kakak yang ngasih tahu', voiceTag: '', stability: 0.5,
    entrance: 'objek utama sudah masuk dalam 0.0-0.35 detik (membal, jatuh dari atas, atau terbang dari samping)',
    music: 'acoustic pop, 100 BPM, in G major, light and hopeful, fingerpicked guitar, soft claps and a warm bass, close-mic\'d and dry, start with just guitar then bring in the claps, instrumental only, no vocals, no lead melody, background bed under a voiceover',
  },
  {
    id: 'semangat', label: 'Semangat', hint: 'Energik, membakar semangat',
    words: [3, 10], sceneSeconds: [1.5, 4], transition: 0.25, camera: 1.2, hardCamerasPerScene: 0.33,
    tone: 'tegas dan membakar semangat, seperti pelatih', voiceTag: '[determined]', stability: 0.5,
    entrance: 'objek utama sudah masuk dalam 0.0-0.3 detik dengan hentakan, banyak gerak, aksen kuat di kata penting',
    music: 'motivational electronic, 124 BPM, in A minor, determined and rising, sidechained synth bass, punchy four-on-the-floor kick, wide analog pads, modern clean production, start with just pads and a ticking hi-hat then bring in the kick and build to a lift, instrumental only, no vocals, no lead melody, background bed under a voiceover',
  },
  {
    id: 'heboh', label: 'Heboh', hint: 'Excited, cepat, penuh kejutan',
    words: [2, 8], sceneSeconds: [1.2, 3.2], transition: 0.2, camera: 1.45, hardCamerasPerScene: 0.4,
    tone: 'excited dan heboh, seperti teman yang baru dapat kabar luar biasa', voiceTag: '[excited]', stability: 0,
    entrance: 'objek utama meledak masuk dalam 0.0-0.2 detik, gerak cepat dan lebay, banyak pop, burst, dan kejutan',
    music: 'hyperpop-flavoured dance pop, 140 BPM, in C major, playful and hype, bouncy 808 bass, crisp claps, glossy synth stabs, bright modern mix, start with just claps then hit a bass drop, short breaks before big moments, instrumental only, no vocals, no lead melody, background bed under a voiceover',
  },
];
export const DEFAULT_PACE = 'normal';
const presetPace = (id) => PACES.find((pace) => pace.id === id) || PACES.find((pace) => pace.id === DEFAULT_PACE);
// A pace by id, or a custom one the AI set ({ preset, words, transition, camera, stability, tone, entrance, music }).
export function paceOf(spec) {
  if (!spec || typeof spec !== 'object') return presetPace(spec);
  const base = presetPace(spec.preset);
  const words = Array.isArray(spec.words) ? [num(spec.words[0], 1, 20, base.words[0]), num(spec.words[1], 2, 30, base.words[1])] : base.words;
  return {
    ...base,
    id: base.id,
    label: typeof spec.label === 'string' && spec.label ? spec.label.slice(0, 40) : base.label,
    words: [Math.min(words[0], words[1]), Math.max(words[0], words[1])],
    sceneSeconds: [Math.max(1, words[0] * 0.3 + 0.8), Math.max(2, words[1] * 0.33 + 1)],
    transition: num(spec.transition, 0.1, 1, base.transition),
    camera: num(spec.camera, 0, 2, base.camera),
    hardCamerasPerScene: num(spec.hardCameras, 0, 0.6, base.hardCamerasPerScene),
    stability: num(spec.stability, 0, 1, base.stability),
    tone: typeof spec.tone === 'string' && spec.tone ? spec.tone.slice(0, 200) : base.tone,
    entrance: typeof spec.entrance === 'string' && spec.entrance ? spec.entrance.slice(0, 300) : base.entrance,
    music: typeof spec.music === 'string' && spec.music ? spec.music.slice(0, 1000) : base.music,
    voiceTag: typeof spec.voiceTag === 'string' ? spec.voiceTag.slice(0, 60) : base.voiceTag,
  };
}

// Drawing styles: how the kit draws (sketch.js options) and the sentence that tells the animator the look.
export const DRAW_STYLES = [
  {
    id: 'flat', label: 'Flat modern', hint: 'Vektor flat bersih tanpa garis tepi, warna blok, bentuk geometris',
    look: 'ilustrasi vektor flat modern (tanpa outline, blok warna rata, bentuk geometris membulat, bayangan datar sederhana)',
    sketch: { wobble: 0, hatch: false, outline: 0 },
  },
  {
    id: 'garis', label: 'Line art bersih', hint: 'Garis tipis rapi dan warna rata, gaya explainer',
    look: 'ilustrasi explainer bersih (garis tepi tipis rapi tanpa goyang, warna rata, banyak ruang kosong)',
    sketch: { wobble: 0, hatch: false, outline: 0.7 },
  },
  {
    id: 'spidol', label: 'Spidol', hint: 'Garis tegas dan bersih, warna rata',
    look: 'ilustrasi spidol yang bersih (outline tebal yang rapi, warna rata tanpa tekstur, bentuk membulat)',
    sketch: { wobble: 0.35, hatch: false, outline: 1.35 },
  },
  {
    id: 'kapur', label: 'Kapur', hint: 'Coretan kapur di papan tulis gelap',
    look: 'gambar kapur di papan tulis (garis kapur putih bergoyang, isian kapur tipis bertekstur, warna kapur pastel)',
    sketch: { wobble: 1.3, hatch: true, outline: 0.9, chalk: true },
    themes: ['night'],
  },
  {
    id: 'krayon', label: 'Krayon', hint: 'Gambar tangan, isian krayon bertekstur (hanya kalau diminta)',
    look: 'ilustrasi krayon gambar tangan (outline tinta bergoyang, isian krayon bertekstur)',
    sketch: { wobble: 1, hatch: true, outline: 1 },
  },
];
export const DEFAULT_DRAW_STYLE = 'flat';
const presetStyle = (id) => DRAW_STYLES.find((style) => style.id === id) || DRAW_STYLES[0];
// A drawing style by id, or a custom one the AI made ({ preset, look, wobble, hatch, outline, chalk, dark }).
export function drawStyleOf(spec) {
  if (!spec || typeof spec !== 'object') return presetStyle(spec);
  const base = presetStyle(spec.preset);
  return {
    ...base,
    look: typeof spec.look === 'string' && spec.look ? spec.look.slice(0, 400) : base.look,
    label: typeof spec.label === 'string' && spec.label ? spec.label.slice(0, 40) : base.label,
    sketch: {
      wobble: num(spec.wobble, 0, 2.5, base.sketch.wobble),
      hatch: typeof spec.hatch === 'boolean' ? spec.hatch : base.sketch.hatch,
      outline: num(spec.outline, 0, 2.5, base.sketch.outline),
      chalk: typeof spec.chalk === 'boolean' ? spec.chalk : Boolean(base.sketch.chalk),
    },
    themes: spec.chalk === true ? ['night'] : spec.chalk === false ? undefined : base.themes,
  };
}

export const STORY_SCENES = [6, 8, 10, 12];
export const DEFAULT_SCENES = 10;
export const MAX_TOPIC = 300;
export const MAX_NOTE = 300;
export const THEMES = ['paper', 'dusk', 'night'];
export const STORY_CAMERAS = ['push', 'pull', 'pan-left', 'pan-right', 'tilt-up', 'tilt-down', 'roll', 'orbit', 'crash', 'handheld', 'shake'];
const MAX_CODE = 24000;

const str = (value, max) => String(value ?? '').slice(0, max);

const HEX = /^#[0-9a-f]{6}$/i;

function cleanWords(words) {
  return (Array.isArray(words) ? words : []).slice(0, 80)
    .map((w) => ({ w: str(w?.w, 40), s: num(w?.s, 0, 60, 0) }))
    .filter((w) => w.w);
}

function cleanBackground(background) {
  return Object.fromEntries(THEMES.map((theme) => {
    const b = background?.[theme] || {};
    return [theme, { top: HEX.test(b.top) ? b.top : '', bottom: HEX.test(b.bottom) ? b.bottom : '', pattern: str(b.pattern, 20) }];
  }));
}

export function cleanStoryScene(scene) {
  return {
    text: str(scene?.text, 200),
    say: str(scene?.say, 400), // the narrator's version: the same words with audio tags, capitals and pauses
    visual: str(scene?.visual, 600),
    theme: THEMES.includes(scene?.theme) ? scene.theme : 'paper',
    duration: num(scene?.duration, 0.8, 15, 3),
    emphasis: str(scene?.emphasis, 40),
    camera: STORY_CAMERAS.includes(scene?.camera) ? scene.camera : 'push',
    words: cleanWords(scene?.words),
    code: str(scene?.code, MAX_CODE),
    ...(scene?.redraw ? { redraw: true } : {}), // the picture must be drawn again (its brief or length changed)
    ...(scene?.codeError ? { codeError: str(scene.codeError, 300) } : {}),
  };
}

function cleanIdea(idea) {
  return { title: str(idea?.title, 120), hook: str(idea?.hook, 240), angle: str(idea?.angle, 500), visualStyle: str(idea?.visualStyle, 400) };
}

const cleanAsset = (audio) => (audio?.url ? { url: str(audio.url, 1000), seconds: num(audio.seconds, 0, 600, 0) } : null);

// The stored shape of a drawn story; anything else is dropped so a saved project always opens.
export function cleanStory(story) {
  const s = story && typeof story === 'object' ? story : {};
  const pace = paceOf(s.pace).id;
  const style = drawStyleOf(s.style).id;
  return {
    topic: str(s.topic, MAX_TOPIC),
    note: str(s.note, MAX_NOTE),
    pace,
    style,
    sceneCount: STORY_SCENES.includes(Number(s.sceneCount)) ? Number(s.sceneCount) : DEFAULT_SCENES,
    voiceId: str(s.voiceId, 40),
    musicPrompt: str(s.musicPrompt, 1000),
    music: s.music !== false,
    ideas: (Array.isArray(s.ideas) ? s.ideas : []).slice(0, 8).map(cleanIdea),
    idea: s.idea ? cleanIdea(s.idea) : null,
    title: str(s.title, 120),
    seo: s.seo ? {
      title: str(s.seo.title, 100), description: str(s.seo.description, 1200),
      tags: (Array.isArray(s.seo.tags) ? s.seo.tags : []).slice(0, 20).map((t) => str(t, 60)),
      hashtags: (Array.isArray(s.seo.hashtags) ? s.seo.hashtags : []).slice(0, 8).map((t) => str(t, 40)),
    } : null,
    background: cleanBackground(s.background),
    scenes: (Array.isArray(s.scenes) ? s.scenes : []).slice(0, 16).map(cleanStoryScene),
    voice: cleanAsset(s.voice),
    voiceText: str(s.voiceText, 6000), // the narration the voice was recorded from
    voiceFor: str(s.voiceFor, 40), // the narrator it was recorded with
    musicTrack: cleanAsset(s.musicTrack),
    musicFor: str(s.musicFor, 1000), // the prompt the music was made from
    // the chat version: the brief, the plan the AI keeps (free style and pace), the cast, found assets, messages
    brief: str(s.brief, 600),
    format: FORMAT_IDS.includes(s.format) ? s.format : DEFAULT_FORMAT,
    kind: str(s.kind, 80),
    styleSpec: cleanSpec(s.styleSpec, ['preset', 'label', 'look'], ['wobble', 'outline'], ['hatch', 'chalk']),
    paceSpec: cleanSpec(s.paceSpec, ['preset', 'label', 'tone', 'entrance', 'music', 'voiceTag'], ['transition', 'camera', 'hardCameras', 'stability'], [], ['words']),
    // the characters; on the free canvas each gets drawing code the AI designed for this video (`code`, made
    // from `look`; `madeFrom` is the look it was drawn from, so a changed look is drawn again)
    cast: (Array.isArray(s.cast) ? s.cast : []).slice(0, 8).map((c) => ({
      name: str(c?.name, 40), look: str(c?.look, 600), kind: c?.kind === 'prop' ? 'prop' : 'character',
      ...(c?.code ? { code: str(c.code, MAX_CODE), madeFrom: str(c.madeFrom, 600) } : {}),
      ...(c?.moves ? { moves: str(c.moves, 300) } : {}),
    })).filter((c) => c.name),
    // the video's own visual language (shapes, textures, light, how settings and props are drawn), set by the AI
    artDirection: str(s.artDirection, 1200),
    // 2 = the free canvas: no template backgrounds or caption band; the AI draws each scene's whole frame.
    // Videos drawn before it keep 1 (their themed backgrounds) until their script is written again.
    canvas: s.canvas === 2 || s.canvas === 1 ? s.canvas : (Array.isArray(s.scenes) && s.scenes.some((x) => x?.code) ? 1 : 2),
    palette: s.palette && typeof s.palette === 'object' ? {
      base: HEX.test(s.palette.base || '') ? s.palette.base : '', ink: HEX.test(s.palette.ink || '') ? s.palette.ink : '',
      colors: (Array.isArray(s.palette.colors) ? s.palette.colors : []).filter((x) => HEX.test(x)).slice(0, 8),
      note: str(s.palette.note, 200),
    } : null,
    caption: s.caption && typeof s.caption === 'object' ? {
      position: ['bottom', 'top', 'middle', 'none'].includes(s.caption.position) ? s.caption.position : 'bottom',
      font: ['hand', 'sans', 'rounded', 'serif', 'display', 'mono'].includes(s.caption.font) ? s.caption.font : 'sans',
      color: HEX.test(s.caption.color || '') ? s.caption.color : '', accent: HEX.test(s.caption.accent || '') ? s.caption.accent : '',
      outline: s.caption.outline === 'none' || HEX.test(s.caption.outline || '') ? s.caption.outline : '',
      box: s.caption.box === true, boxColor: HEX.test(s.caption.boxColor || '') ? s.caption.boxColor : '',
    } : null,
    assets: cleanAssets(s.assets),
    // made sounds: an ambience under a scene (or the whole video) or an effect the scene code plays (s.sfx('custom:key'))
    sounds: (Array.isArray(s.sounds) ? s.sounds : []).slice(0, 24).map((x) => ({
      key: str(x?.key, 40).replace(/[^\w-]/g, ''), kind: x?.kind === 'effect' ? 'effect' : 'ambience', prompt: str(x?.prompt, 450),
      scene: Number.isInteger(x?.scene) ? x.scene : null, seconds: num(x?.seconds, 0.5, 30, 10), volume: num(x?.volume, 0, 1, x?.kind === 'effect' ? 0.8 : 0.35),
      loop: x?.kind !== 'effect', url: str(x?.url, 1000), madeFrom: str(x?.madeFrom, 450),
    })).filter((x) => x.key && x.prompt),
    // what the user sent in the chat: pictures (also usable in scenes) and videos, with what the AI saw in them
    references: (Array.isArray(s.references) ? s.references : []).slice(0, 20).map((r) => ({
      key: str(r?.key, 40), type: r?.type === 'video' ? 'video' : 'image', url: str(r?.url, 1000), assetId: str(r?.assetId, 40),
      name: str(r?.name, 120), seen: str(r?.seen, 3000),
    })).filter((r) => r.key && r.url),
    chat: (Array.isArray(s.chat) ? s.chat : []).slice(-60).map(cleanMessage).filter(Boolean),
    pending: s.pending && typeof s.pending === 'object' ? {
      what: (Array.isArray(s.pending.what) ? s.pending.what : []).filter((w) => ['voice', 'music', 'draw', 'sounds'].includes(w)),
      scenes: Array.isArray(s.pending.scenes) ? s.pending.scenes.filter(Number.isInteger).slice(0, 16) : null,
      credits: num(s.pending.credits, 0, 100000, 0),
      breakdown: s.pending.breakdown ? { draw: num(s.pending.breakdown.draw, 0, 100000, 0), voice: num(s.pending.breakdown.voice, 0, 100000, 0), music: num(s.pending.breakdown.music, 0, 100000, 0), sounds: num(s.pending.breakdown.sounds, 0, 100000, 0) } : null,
      note: str(s.pending.note, 300),
    } : null,
  };
}

function cleanSpec(spec, strings, numbers, booleans, arrays = []) {
  if (!spec || typeof spec !== 'object') return null;
  const out = {};
  for (const key of strings) if (typeof spec[key] === 'string' && spec[key]) out[key] = spec[key].slice(0, 1000);
  for (const key of numbers) if (Number.isFinite(Number(spec[key]))) out[key] = Number(spec[key]);
  for (const key of booleans) if (typeof spec[key] === 'boolean') out[key] = spec[key];
  for (const key of arrays) if (Array.isArray(spec[key])) out[key] = spec[key].slice(0, 2).map(Number).filter(Number.isFinite);
  return Object.keys(out).length ? out : null;
}

const ASSET_KEY = /^[\w:.-]{1,60}$/;
function cleanAssets(assets) {
  if (!assets || typeof assets !== 'object') return {};
  return Object.fromEntries(Object.entries(assets).filter(([key, a]) => ASSET_KEY.test(key) && ['image', 'lottie'].includes(a?.type)).slice(0, 40).map(([key, a]) => [key, {
    type: a.type, source: str(a.source, 20), url: str(a.url, 1000), assetId: str(a.assetId, 40), name: str(a.name, 60),
    description: str(a.description, 200), credit: str(a.credit, 300), width: num(a.width, 0, 20000, 0), height: num(a.height, 0, 20000, 0),
  }]));
}

function cleanMessage(m) {
  if (!m || !['user', 'assistant'].includes(m.role)) return null;
  return {
    role: m.role, content: str(m.content, 4000),
    ...(Array.isArray(m.ideas) && m.ideas.length ? { ideas: m.ideas.slice(0, 6).map(cleanIdea) } : {}),
    ...(Array.isArray(m.attachments) && m.attachments.length ? { attachments: m.attachments.slice(0, 6).map((a) => ({ key: str(a?.key, 40), type: a?.type === 'video' ? 'video' : 'image', url: str(a?.url, 1000), name: str(a?.name, 120) })).filter((a) => a.url) } : {}),
    ...(Array.isArray(m.cards) && m.cards.length ? { cards: m.cards.slice(0, 6).filter((c) => ['brief', 'script', 'scene', 'plan'].includes(c?.kind)).map((c) => ({ kind: c.kind, title: str(c.title, 80), ...(Number.isInteger(c.scene) ? { scene: c.scene } : {}) })) } : {}),
    ...(m.error ? { error: true } : {}),
    ...(Number(m.credits) > 0 ? { credits: Number(m.credits) } : {}),
  };
}

// The props of the player (DrawVideo) for a story.
export function storyVideoProps(story) {
  const pace = paceOf(story.pace);
  const style = drawStyleOf(story.style);
  return {
    scenes: story.scenes,
    background: story.background,
    voice: story.voice?.url || null,
    music: story.musicTrack?.url || null,
    pace: story.paceSpec || pace.id,
    style: story.styleSpec || style.id,
    assets: story.assets || {},
    sounds: (story.sounds || []).filter((x) => x.url),
    format: story.format || DEFAULT_FORMAT,
    canvas: story.canvas || 1,
    palette: story.palette || null,
    caption: story.caption || null,
    cast: (story.cast || []).filter((c) => c.code).map((c) => ({ name: c.name, code: c.code, kind: c.kind || 'character' })),
  };
}
