// The Motion studio's AI director: from a brief (and the chat so far) a Seed model on BytePlus ModelArk picks a
// motion graphics style and writes the scenes' text. Billed in credits by the tokens it used, at the same text
// prices as the AI Director (storyboardTextPricing.js).
import { STYLES } from '../../components/motion/styles.js';
import { MOTION_CRAFT, readingSeconds } from './motionCraft.js';
import { CAPTION_STYLES, SCENE_LIMITS, cleanScene, hasContent } from '../../components/motion/sceneKinds.js';
import { ELEVENLABS_VOICES } from './elevenlabsAudio.js';
import { MOTION_PRINCIPLES, pickSkills, skillsPrompt } from './motionSkills.js';

export { SCENE_LIMITS };

export const MOTION_MODEL = 'dola-seed-2-1-turbo-260628';
export const MAX_BRIEF = 2000;
export const MAX_HISTORY = 8;
// One answer holds at most this many scenes; longer videos are written chapter by chapter (planLongMotion).
export const PLAN_SCENES = 14;
// Above this many seconds a request is a long video, up to LONG_VIDEO_MAX (the length of one music track).
export const LONG_VIDEO_SECONDS = 150;
export const LONG_VIDEO_MAX = 300;
// A 10-scene plan with layers and voiceover lines runs to ~5k tokens of JSON.
const MAX_OUTPUT_TOKENS = 8000;
const MAX_CURRENT = 12000;
const FORMATS = new Set(['9:16', '1:1', '16:9']);

function providerError(message, status = 502) {
  return Object.assign(new Error(message), { status, code: 'MOTION_PLAN_FAILED' });
}

const text = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// skills: the playbooks picked for this request (motionSkills.js); they go last so the fixed part stays a cacheable prefix.
export function systemPrompt(skills = []) {
  const catalog = STYLES.filter((style) => style.id !== 'auto').map((style) => `${style.id}: ${style.name} (${style.family})`).join('\n');
  return [
    'You are the creative director of NexoClip Motion, a tool that makes short animated text videos (motion graphics).',
    `Each video is 1-${PLAN_SCENES} scenes of ${SCENE_LIMITS.minSeconds}-${SCENE_LIMITS.maxSeconds} s, in one style. Title max 60 chars, subtitle max 90, call to action max 28.`,
    'Write punchy, natural copy in the language the user writes in (usually Indonesian). Titles short (2-6 words is best). Usually only the last scene has a call to action.',
    'Pick the style id that fits the brand and mood from this list (id: name (family)):',
    catalog,
    MOTION_PRINCIPLES,
    MOTION_CRAFT,
    'SOUND',
    'Every plan also gets a soundtrack the user can generate with ElevenLabs:',
    '- "musicPrompt": an English prompt for one instrumental track under the whole video: genre, mood, tempo (BPM), main instruments, energy over time (e.g. "upbeat lo-fi hip hop, 90 BPM, warm Rhodes and soft drums, cozy coffee shop, builds slightly toward the end, no vocals"). Match the style and the brand.',
    '- "vo" per scene: the voiceover line spoken over that scene, in the language of the video, written to be heard: conversational, short sentences, numbers as people say them. It complements the text on screen instead of reading it word for word. At about 14 characters a second it must fit the scene (a 5 s scene holds about 60 characters). Leave "vo" empty on every scene when the user does not want a voiceover.',
    '- "generate": {"music": true|false, "voiceover": true|false}. Set a flag true when the user asks in their latest message for that sound to be made or added (music, backsound, lagu, soundtrack; voiceover, VO, narasi, suara, narator), or asks for the video "lengkap dengan suara". The studio then generates it right away with ElevenLabs and charges credits, so leave both false when they did not ask.',
    '- "captionStyle": how the voiceover captions look: karaoke (default, social), box (bold, ads, Hormozi style), one (one big word at a time, hype), paper (paper-craft and kids styles), neon (neon, retro, gaming styles), subtitle (calm, corporate, documentary).',
    '- "voiceId": the voice that fits, from: ' + ELEVENLABS_VOICES.map((voice) => `${voice.id} ${voice.name} (${voice.gender}, ${voice.description})`).join('; ') + '.',
    'If the user asks for changes, revise the current plan instead of starting over, and keep what they did not ask to change.',
    'Answer with JSON only, no markdown:',
    '{"message": "1-2 sentences to the user about what you made or changed", "styleId": "<id from the list>", "format": "9:16|1:1|16:9", "voiceId": "", "musicPrompt": "", "captionStyle": "karaoke", "generate": {"music": false, "voiceover": false}, "scenes": [{"kind": "text", "title": "", "subtitle": "", "cta": "", "vo": "", "camera": "push", "seconds": 4}, {"kind": "layers", "seconds": 6, "transition": "wipe", "layout": "split", "camera": "drift", "layers": [{"type": "lottie", "src": "hot-beverage", "size": "l", "entrance": "scale"}, {"type": "heading", "text": "", "entrance": "words"}, {"type": "price", "was": 50000, "now": 35000, "entrance": "scale", "loop": "pulse"}]}]}',
    'Leave out fields a scene or layer does not use.',
    skillsPrompt(skills),
  ].filter(Boolean).join('\n');
}

// Pull the JSON object out of a model answer (tolerates ```json fences and text around it).
export function parsePlanJson(content) {
  const raw = String(content || '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw providerError('The model returned no plan');
  const body = raw.slice(start, end + 1);
  try {
    return JSON.parse(body);
  } catch {
    try {
      return JSON.parse(repairJson(body));
    } catch {
      throw providerError('The model returned an invalid plan');
    }
  }
}

// The slips models make in long JSON: raw line breaks and tabs inside strings, trailing commas, // comments,
// typographic quotes around keys and values.
export function repairJson(body) {
  let out = '';
  let inString = false;
  let curly = false; // the open string started with a typographic quote
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    if (inString) {
      if (char === '\\') { out += char + (body[i + 1] ?? ''); i += 1; continue; }
      if (curly && char === '\u201d') { inString = false; out += '"'; continue; }
      if (char === '"') {
        if (curly) { out += '\\"'; continue; }
        inString = false;
      }
      out += char === '\n' ? '\\n' : char === '\r' ? '' : char === '\t' ? '\\t' : char;
      continue;
    }
    if (char === '"') { inString = true; curly = false; out += char; continue; }
    if (char === '/' && body[i + 1] === '/') { while (i < body.length && body[i] !== '\n') i += 1; continue; }
    if (char === '\u201c') { out += '"'; inString = true; curly = true; continue; }
    out += char;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

// Clamp whatever the model sent to what the studio can play.
export function normalizePlan(plan, { format: fallbackFormat = '9:16', maxScenes = PLAN_SCENES } = {}) {
  const styleIds = new Set(STYLES.map((style) => style.id));
  const scenes = (Array.isArray(plan?.scenes) ? plan.scenes : [])
    .map((scene) => {
      const clean = cleanScene({ ...scene, seconds: SCENE_LIMITS.maxSeconds });
      // Never shorter than the text takes to read.
      const seconds = Math.max(Math.round(Number(scene?.seconds) || 0), readingSeconds(clean));
      return { ...clean, seconds: Math.min(SCENE_LIMITS.maxSeconds, Math.max(SCENE_LIMITS.minSeconds, seconds)) };
    })
    .filter(hasContent)
    .slice(0, maxScenes);
  if (!scenes.length) throw providerError('The model returned no scenes');
  return {
    message: text(plan?.message, 400),
    styleId: styleIds.has(plan?.styleId) ? plan.styleId : 'auto',
    voiceId: ELEVENLABS_VOICES.some((voice) => voice.id === plan?.voiceId) ? plan.voiceId : ELEVENLABS_VOICES[0].id,
    musicPrompt: text(plan?.musicPrompt, SCENE_LIMITS.musicPrompt),
    ...(CAPTION_STYLES[plan?.captionStyle] ? { captionStyle: plan.captionStyle } : {}),
    generate: { music: plan?.generate?.music === true, voiceover: plan?.generate?.voiceover === true },
    format: FORMATS.has(plan?.format) ? plan.format : fallbackFormat,
    scenes,
  };
}

// The length the user asked for, in seconds ("5 menit", "2,5 min", "90 detik"), or 0.
export function targetSeconds(brief) {
  const textValue = String(brief || '').toLowerCase();
  let total = 0;
  for (const [, amount, unit] of textValue.matchAll(/(\d+(?:[.,]\d+)?)\s*(jam|hours?|menit|mnt|minutes?|min|detik|dtk|seconds?|secs?|s)\b/g)) {
    const value = Number(amount.replace(',', '.'));
    total += /^(jam|hour)/.test(unit) ? value * 3600 : /^(menit|mnt|min)/.test(unit) ? value * 60 : value;
  }
  return Math.round(total);
}

const chatHistory = (messages) => (Array.isArray(messages) ? messages : [])
  .filter((message) => ['user', 'assistant'].includes(message?.role) && typeof message.content === 'string')
  .slice(-MAX_HISTORY)
  // Earlier answers go back as the JSON the model wrote (the full plan is in `current`): replayed as plain sentences
  // they taught the model to answer in prose after a few turns, and the plan went missing.
  .map((message) => ({
    role: message.role,
    content: message.role === 'assistant' ? JSON.stringify({ message: message.content.slice(0, 600) }) : message.content.slice(0, 1500),
  }));

// One request to Seed. Returns { parsed, usage }; a reply without a JSON plan throws with what came back.
const TRIES = 3;
const REQUEST_TIMEOUT_MS = 120_000;
let RETRY_DELAY_MS = 3000;
export const setRetryDelayForTests = (ms) => { RETRY_DELAY_MS = ms; };
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

async function callSeed(messages, { env, fetchImpl, retried = false }) {
  const apiKey = env.BYTEPLUS_API_KEY;
  const baseUrl = String(env.BYTEPLUS_BASE_URL || '').replace(/\/+$/, '');
  if (!apiKey || !baseUrl) throw providerError('Motion AI is not configured', 503);
  // A dropped connection, a timeout, 429 or a 5xx is tried again (3 tries in all) before the job gives up.
  let response;
  let data;
  for (let attempt = 1; ; attempt += 1) {
    try {
      response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MOTION_MODEL, max_tokens: MAX_OUTPUT_TOKENS, thinking: { type: 'disabled' }, messages }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      data = await response.json().catch(() => ({}));
      if (response.ok || !(response.status === 429 || response.status >= 500) || attempt >= TRIES) break;
    } catch (error) {
      if (attempt >= TRIES) throw Object.assign(providerError('Koneksi ke AI terputus.'), { cause: error, transient: true });
    }
    await wait(RETRY_DELAY_MS * attempt);
  }
  if (!response.ok) throw Object.assign(providerError(data?.error?.message || `BytePlus returned HTTP ${response.status}`, response.status === 400 ? 400 : 502), { transient: response.status === 429 || response.status >= 500 });
  const choice = data?.choices?.[0];
  const content = String(choice?.message?.content || '');
  try {
    return { parsed: parsePlanJson(content), usage: data.usage || {} };
  } catch (error) {
    if (!retried && choice?.finish_reason !== 'length') {
      // One more try, showing the model its own broken answer; the usage of both requests is charged.
      const again = await callSeed([...messages, { role: 'assistant', content: content.slice(0, 12000) }, {
        role: 'user', content: 'That answer was not valid JSON. Send the same answer again as one valid JSON object only: double quotes, no comments, no trailing commas, no line breaks inside strings.',
      }], { env, fetchImpl, retried: true });
      return { parsed: again.parsed, usage: addUsage(data.usage || {}, again.usage) };
    }
    // What came back instead of a plan, and why the model stopped (the end too, where JSON usually breaks).
    error.detail = { finishReason: choice?.finish_reason, start: content.slice(0, 600), end: content.slice(-600), length: content.length, usage: data?.usage };
    throw error;
  }
}

const addUsage = (a, b) => ({
  prompt_tokens: (Number(a.prompt_tokens) || 0) + (Number(b.prompt_tokens) || 0),
  completion_tokens: (Number(a.completion_tokens) || 0) + (Number(b.completion_tokens) || 0),
  prompt_tokens_details: { cached_tokens: (Number(a.prompt_tokens_details?.cached_tokens) || 0) + (Number(b.prompt_tokens_details?.cached_tokens) || 0) },
});

// messages: [{ role: 'user' | 'assistant', content }] (the chat so far, oldest first), brief: the new user message,
// current: the plan on screen, if any. Returns { plan, usage, model }.
export async function planMotion({ brief, messages = [], current = null, format = '9:16', env = process.env, fetchImpl = fetch }) {
  const skills = pickSkills(brief, messages);
  const context = current ? `\n\nCurrent plan on screen: ${JSON.stringify(current).slice(0, MAX_CURRENT)}` : `\n\nRequested format: ${format}`;
  const { parsed, usage } = await callSeed([
    { role: 'system', content: systemPrompt(skills) },
    ...chatHistory(messages),
    { role: 'user', content: `${String(brief).slice(0, MAX_BRIEF)}${context}` },
  ], { env, fetchImpl });
  const plan = { ...normalizePlan(parsed, { format: current?.format || format }), skills: skills.map((entry) => entry.name) };
  return { plan, usage, model: MOTION_MODEL };
}

const OUTLINE_RULES = `
LONG VIDEO, STEP 1 OF 2: write only the outline now; each chapter's scenes are written in a later request.
Split the video into 3-8 chapters that tell one story with a beginning, rising middle and resolution. Chapter seconds add up to the requested length (each chapter 30-60 s). For every chapter give a title (max 40 chars) and a summary of 1-3 sentences naming its beats in order, the facts it states (only well-established ones, approximate dates with "sekitar") and its visual idea.
Answer with JSON only: {"message": "1-2 sentences to the user", "styleId": "<id>", "format": "9:16|1:1|16:9", "voiceId": "", "musicPrompt": "", "captionStyle": "", "generate": {"music": false, "voiceover": false}, "chapters": [{"title": "", "summary": "", "seconds": 45}]}`.trim();

const chapterRules = (outline, index, previous) => `
LONG VIDEO, STEP 2: write the scenes of chapter ${index + 1} of ${outline.chapters.length} only.
The whole video: ${outline.chapters.map((chapter, i) => `${i + 1}. ${chapter.title} (${chapter.seconds} s): ${chapter.summary}`).join(' | ')}
This chapter: "${outline.chapters[index].title}", about ${outline.chapters[index].seconds} s, so ${Math.max(3, Math.round(outline.chapters[index].seconds / 5.5))} scenes of 4-7 s. Style ${outline.styleId}, format ${outline.format}; keep it, the scenes join the ones before.
${index === 0 ? 'The first scene is the hook of the whole video.' : 'Open the chapter so the viewer feels the turn (a kicker with the era or the chapter title works), and use a transition on its first scene.'}${index === outline.chapters.length - 1 ? ' The last scene closes the whole video.' : ''}
${previous.length ? `The previous chapter ended with: ${previous.map((scene) => [scene.vo, ...(scene.layers || []).map((layer) => `${layer.type}${layer.text ? `:${layer.text}` : ''}`)].filter(Boolean).join(' / ')).join(' || ')}. Do not repeat its layouts, recipes or lead entrances in your first scenes.` : ''}
Answer with JSON only: {"scenes": [...]} in the scene format above.`.trim();

// A long video in several requests: the outline, then each chapter's scenes. `onStep(step)` is called before each
// request ({ kind: 'outline' } or { kind: 'chapter', index, total, title }) and `onResult` after it with
// { kind, usage, outline?, scenes? }, so the caller can show progress, charge each request and write the scenes in.
// `resume` ({ outline, start, previous, total }) continues a long video that stopped: no outline request, chapters
// from `start` on, `previous` the last scenes written and `total` how many there are.
export async function planLongMotion({ brief, messages = [], format = '9:16', seconds, resume = null, env = process.env, fetchImpl = fetch, onStep = async () => {}, onResult = async () => {} }) {
  const length = Math.min(LONG_VIDEO_MAX, seconds);
  const skills = pickSkills(brief, messages);
  const system = systemPrompt(skills);
  if (resume) return writeChapters({ brief, system, skills, outline: resume.outline, start: resume.start, previous: resume.previous, total: resume.total, env, fetchImpl, onStep, onResult });
  await onStep({ kind: 'outline' });
  const first = await callSeed([
    { role: 'system', content: `${system}\n\n${OUTLINE_RULES}` },
    ...chatHistory(messages),
    { role: 'user', content: `${String(brief).slice(0, MAX_BRIEF)}\n\nRequested length: ${length} s. Requested format: ${format}` },
  ], { env, fetchImpl });
  const header = normalizePlan({ ...first.parsed, scenes: [{ title: 'x' }] }, { format });
  const chapters = (Array.isArray(first.parsed.chapters) ? first.parsed.chapters : []).slice(0, 8)
    .map((chapter) => ({ title: text(chapter?.title, 40), summary: text(chapter?.summary, 500), seconds: Math.min(90, Math.max(20, Math.round(Number(chapter?.seconds) || 45))) }))
    .filter((chapter) => chapter.title);
  if (!chapters.length) throw providerError('The model returned no chapters');
  const outline = { ...header, scenes: undefined, chapters };
  await onResult({ kind: 'outline', usage: first.usage, outline });
  return writeChapters({ brief, system, skills, outline, start: 0, previous: [], total: 0, env, fetchImpl, onStep, onResult });
}

async function writeChapters({ brief, system, skills, outline, start, previous: before, total: written, env, fetchImpl, onStep, onResult }) {
  const { chapters } = outline;
  let previous = before;
  let total = written;
  for (let index = start; index < chapters.length && total < SCENE_LIMITS.max; index += 1) {
    await onStep({ kind: 'chapter', index, total: chapters.length, title: chapters[index].title });
    const reply = await callSeed([
      { role: 'system', content: `${system}\n\n${chapterRules(outline, index, previous)}` },
      { role: 'user', content: `${String(brief).slice(0, MAX_BRIEF)}\n\nWrite chapter ${index + 1}: ${chapters[index].title}.` },
    ], { env, fetchImpl });
    const scenes = normalizePlan({ ...reply.parsed, styleId: outline.styleId }, { format: outline.format }).scenes.slice(0, SCENE_LIMITS.max - total);
    total += scenes.length;
    previous = scenes.slice(-2);
    await onResult({ kind: 'chapter', index, usage: reply.usage, scenes });
  }
  return { outline, skills: skills.map((entry) => entry.name), model: MOTION_MODEL };
}
