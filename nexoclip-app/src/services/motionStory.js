// Drawn stories in the Motion studio: a topic becomes five ideas; the chosen idea becomes a script, one narration,
// and drawing code per scene (components/motion/draw). The text model is Claude Sonnet on OpenRouter. The worker
// (motionJobs.js) runs these steps and charges them; this file only talks to the model and checks its answers.
import vm from 'node:vm';
import { parsePlanJson } from './motionDirector.js';
import { ideaIngredients, ideasPrompt, scriptPrompt, animatePrompt, repairPrompt } from './motionStoryPrompts.js';
import { createSketch, splitScenes } from '../../components/motion/draw/sketch.js';
import { useExtrasData } from '../../components/motion/draw/extras.js';
import { createRequire } from 'node:module';

// The icon names and map the scene code may use, so the check catches a missing icon.
const require = createRequire(import.meta.url);
useExtrasData({ icons: require('../../components/motion/draw/lucideIcons.json'), world: require('../../components/motion/draw/worldMap.json') });
import { STORY_CAMERAS, THEMES, cleanStoryScene, drawStyleOf, paceOf } from '../../components/motion/draw/story.js';

export const STORY_MODEL = 'anthropic/claude-sonnet-5.5';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 300_000;
const BATCH = 4; // scenes per drawing request
const TRIES = 2;

const providerError = (message, extra = {}) => Object.assign(new Error(message), { status: 502, ...extra });
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
let RETRY_DELAY_MS = 2000;
export const setStoryRetryDelayForTests = (ms) => { RETRY_DELAY_MS = ms; };

// One request to the model. The system part is marked for prompt caching (the drawing contract repeats per batch).
// Returns { text, usage: { inputTokens, cachedInputTokens, outputTokens, costUsd } }.
// `messages` (chat history, tool results) and `tools` (OpenAI-style function tools) are for the Motion chat agent;
// the answer then also carries `toolCalls` and the assistant `message` to keep in the history.
// `onText(soFar)` streams the answer's text as it is written (the chat shows it live).
export async function callStoryModel({ system, user, messages = null, tools = null, maxTokens = 8000, onText = null, env = process.env, fetchImpl = fetch }) {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) throw Object.assign(new Error('Story AI is not configured'), { status: 503 });
  let lastError;
  for (let attempt = 0; attempt < TRIES; attempt += 1) {
    if (attempt) await wait(RETRY_DELAY_MS);
    let response;
    try {
      response = await fetchImpl(OPENROUTER_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'NexoClip Motion' },
        body: JSON.stringify({
          model: STORY_MODEL,
          max_tokens: maxTokens,
          usage: { include: true },
          messages: [
            { role: 'system', content: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] },
            ...(messages || [{ role: 'user', content: user }]),
          ],
          ...(tools ? { tools, tool_choice: 'auto' } : {}),
          ...(onText ? { stream: true } : {}),
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      lastError = providerError('The story model could not be reached', { transient: true, cause: error });
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      lastError = providerError(`The story model returned HTTP ${response.status}`, { transient: true });
      continue;
    }
    if (onText && response.ok) return readStream(response, onText);
    const body = await response.json().catch(() => null);
    if (!response.ok) throw providerError(body?.error?.message || `The story model returned HTTP ${response.status}`);
    const message = body?.choices?.[0]?.message || {};
    const text = typeof message.content === 'string' ? message.content : '';
    const toolCalls = (message.tool_calls || []).map((c) => ({ id: c.id, name: c.function?.name, arguments: c.function?.arguments || '{}' }));
    if (!text.trim() && !toolCalls.length) throw providerError('The story model returned an empty answer');
    // Sonnet thinks before it answers and the thinking counts against max_tokens: a cut answer is useless JSON or code.
    if (body.choices[0].finish_reason === 'length') throw providerError('The story model ran out of room for its answer');
    const u = body.usage || {};
    return {
      text,
      toolCalls,
      message: { role: 'assistant', content: text || null, ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}) },
      usage: {
        inputTokens: Number(u.prompt_tokens) || 0,
        cachedInputTokens: Number(u.prompt_tokens_details?.cached_tokens) || 0,
        outputTokens: Number(u.completion_tokens) || 0,
        costUsd: Number.isFinite(Number(u.cost)) ? Number(u.cost) : null,
      },
    };
  }
  throw lastError;
}

// An OpenRouter stream (server-sent events) put back together: text, tool calls (by index) and the usage.
async function readStream(response, onText) {
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let finish = '';
  let usage = {};
  const calls = [];
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let cut;
    while ((cut = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, cut).trim();
      buffer = buffer.slice(cut + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      let event;
      try { event = JSON.parse(data); } catch { continue; }
      if (event.error) throw providerError(event.error.message || 'The story model stopped');
      if (event.usage) usage = event.usage;
      const choice = event.choices?.[0];
      if (!choice) continue;
      if (choice.finish_reason) finish = choice.finish_reason;
      const delta = choice.delta || {};
      if (typeof delta.content === 'string' && delta.content) { text += delta.content; await onText(text); }
      for (const tc of delta.tool_calls || []) {
        const slot = calls[tc.index ?? calls.length] || (calls[tc.index ?? calls.length] = { id: '', name: '', arguments: '' });
        if (tc.id) slot.id = tc.id;
        if (tc.function?.name) slot.name += tc.function.name;
        if (tc.function?.arguments) slot.arguments += tc.function.arguments;
      }
    }
  }
  const toolCalls = calls.filter(Boolean).map((c, i) => ({ id: c.id || `call_${i}`, name: c.name, arguments: c.arguments || '{}' }));
  if (!text.trim() && !toolCalls.length) throw providerError('The story model returned an empty answer');
  if (finish === 'length') throw providerError('The story model ran out of room for its answer');
  return {
    text,
    toolCalls,
    message: { role: 'assistant', content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments } })) } : {}) },
    usage: {
      inputTokens: Number(usage.prompt_tokens) || 0,
      cachedInputTokens: Number(usage.prompt_tokens_details?.cached_tokens) || 0,
      outputTokens: Number(usage.completion_tokens) || 0,
      costUsd: Number.isFinite(Number(usage.cost)) ? Number(usage.cost) : null,
    },
  };
}

const words = (text) => String(text || '').split(/\s+/).filter(Boolean);
const bare = (word) => String(word || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const seconds = (count, pace) => Math.round(count * (paceOf(pace).sceneSeconds[0] + paceOf(pace).sceneSeconds[1]) / 2);

export async function storyIdeas({ topic, pace, style, note = '', sceneCount = 10, random = Math.random, call = callStoryModel }) {
  const ingredients = ideaIngredients(pace, random);
  const { text, usage } = await call({ ...ideasPrompt({ topic, pace, style, note, ingredients, seconds: seconds(sceneCount, pace) }), maxTokens: 10000 });
  const ideas = (parsePlanJson(text).ideas || []).slice(0, 5).map((idea) => ({
    title: String(idea?.title || '').trim(), hook: String(idea?.hook || '').trim(),
    angle: String(idea?.angle || '').trim(), visualStyle: String(idea?.visualStyle || '').trim(),
  })).filter((idea) => idea.title && idea.hook);
  if (!ideas.length) throw providerError('The story model returned no ideas');
  return { ideas, usage };
}

export async function storyScript({ idea, pace, style, sceneCount = 10, note = '', call = callStoryModel }) {
  const { text, usage } = await call({ ...scriptPrompt({ idea, pace, style, sceneCount, note }), maxTokens: 20000 });
  const plan = parsePlanJson(text);
  const themes = drawStyleOf(style).themes || THEMES;
  let lastCamera = '';
  const scenes = (Array.isArray(plan.scenes) ? plan.scenes : []).slice(0, 16).map((raw) => {
    const scene = cleanStoryScene({ ...raw, code: '', words: [] });
    if (!scene.text.trim()) return null;
    if (!themes.includes(scene.theme)) scene.theme = themes[0];
    // the emphasis must be a word of the text, or the camera has nothing to hit on
    const target = bare(scene.emphasis);
    if (!words(scene.text).some((w) => bare(w) === target)) {
      scene.emphasis = words(scene.text).reduce((a, b) => (bare(b).length > bare(a).length ? b : a), '').replace(/[^\p{L}\p{N}]/gu, '');
    }
    if (!STORY_CAMERAS.includes(scene.camera) || scene.camera === lastCamera) {
      scene.camera = STORY_CAMERAS.filter((c) => c !== lastCamera && c !== 'shake' && c !== 'crash')[words(scene.text).length % 6];
    }
    lastCamera = scene.camera;
    return scene;
  }).filter(Boolean);
  if (scenes.length < 2) throw providerError('The story model returned no script');
  return {
    script: { title: String(plan.title || idea.title || '').trim(), music: String(plan.music || '').trim().slice(0, 1000), seo: plan.seo || null, background: plan.background || null, scenes },
    usage,
  };
}

// The narration read in one go (it flows like one monologue): each scene's spoken version ("say": its words with
// Eleven v4 audio tags, capitals and ellipses), or its text. The pace's tag leads when the script set none.
export function narrationText(scenes, pace) {
  const lines = scenes.map((scene) => (spokenMatches(scene) ? scene.say : scene.text).trim());
  const tag = paceOf(pace).voiceTag;
  return `${tag && !lines[0].startsWith('[') ? `${tag} ` : ''}${lines.join(' ')}`;
}

// Words that are read out: audio tags ([excited], [low, steady voice]) and bare punctuation are left out.
export function spokenWords(items, key = (item) => item) {
  const out = [];
  let depth = 0;
  for (const item of items) {
    const word = String(key(item));
    const opens = (word.match(/\[/g) || []).length;
    const closes = (word.match(/\]/g) || []).length;
    const inside = depth > 0 || word.startsWith('[');
    depth = Math.max(0, depth + opens - closes);
    if (inside || !/[\p{L}\p{N}]/u.test(word)) continue;
    out.push(item);
  }
  return out;
}

// "say" may only add tags, capitals and punctuation to the text; otherwise the captions would not line up.
function spokenMatches(scene) {
  if (!scene.say?.trim()) return false;
  const plain = (t) => spokenWords(words(t)).map(bare);
  const a = plain(scene.say), b = plain(scene.text);
  return a.length === b.length && a.every((w, i) => w === b[i]);
}

// Cut the narration's word timings back into scenes: a scene lasts from its first word to the next scene's first
// word, the last one until the audio ends. Each scene gets its words relative to its own start.
export function timeScenes(scenes, spoken, audioSeconds) {
  const heard = spokenWords(spoken || [], (w) => w.w);
  const shown = scenes.map((scene) => spokenWords(words(scene.text)));
  const counts = shown.map((list) => list.length);
  const total = counts.reduce((a, b) => a + b, 0);
  const aligned = heard.length === total;
  let index = 0;
  const starts = scenes.map((scene, i) => {
    if (aligned) {
      const first = heard[index];
      index += counts[i];
      return first ? first.s : 0;
    }
    // the reading did not split the same way (numbers, symbols): share the time out by length
    const before = counts.slice(0, i).reduce((a, b) => a + b, 0);
    return (audioSeconds * before) / Math.max(1, total);
  });
  starts[0] = 0;
  index = 0;
  return scenes.map((scene, i) => {
    const end = i + 1 < scenes.length ? starts[i + 1] : audioSeconds + 0.6;
    const duration = Math.max(1.2, Math.round((end - starts[i]) * 100) / 100);
    const own = aligned ? heard.slice(index, index + counts[i]) : [];
    index += counts[i];
    // caption words as written (the reading may be in capitals), timed by the reading
    const timed = aligned
      ? own.map((w, k) => ({ w: shown[i][k], s: Math.max(0, Math.round((w.s - starts[i]) * 100) / 100) }))
      : [];
    return { ...scene, duration, words: timed };
  });
}

// A canvas context that accepts every call and draws nothing: enough to run scene code outside a browser.
function blankContext() {
  const gradient = { addColorStop() {} };
  const target = { globalAlpha: 1, lineWidth: 1, font: '', canvas: { width: 720, height: 1280 } };
  return new Proxy(target, {
    get(obj, key) {
      if (key in obj) return obj[key];
      if (key === 'createRadialGradient' || key === 'createLinearGradient' || key === 'createPattern') return () => gradient;
      if (key === 'measureText') return (text) => ({ width: String(text).length * 12 });
      if (key === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return () => undefined;
    },
    set(obj, key, value) { obj[key] = value; return true; },
  });
}

// Names the drawing code may not touch: it runs in the viewer's browser (inside a sandboxed frame).
const FORBIDDEN = /\b(window|document|globalThis|fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|eval|Function|constructor|__proto__|localStorage|sessionStorage|indexedDB|navigator|location|postMessage|require|process|setTimeout|setInterval|Worker)\b|\bimport\s*\(/;

// Runs a scene's code over a few frames with a time limit. Returns null when it works, or what went wrong.
export function checkSceneCode(code, { dur = 3, theme = 'paper', style = 'krayon', assets = null, format = '9:16' } = {}) {
  const source = String(code || '');
  if (!source.trim()) return 'kode kosong';
  const banned = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').match(FORBIDDEN); // comments may say anything
  if (banned) return `memakai "${banned[0]}" yang tidak diizinkan`;
  let script;
  try {
    script = new vm.Script(`(function (s, ctx) {\n${source}\n})(__s, __ctx);`);
  } catch (error) {
    return `syntax: ${error.message}`;
  }
  const look = drawStyleOf(style).sketch;
  const missing = new Set();
  for (const t of [0, dur * 0.3, dur * 0.6, Math.max(0, dur - 0.05)]) {
    const ctx = blankContext();
    const onMissing = (kind, name) => { if (kind === 'icon' || (kind === 'image' && !assets?.[name]) || (kind === 'lottie' && !assets?.[name])) missing.add(`${kind} "${name}"`); };
    const context = vm.createContext({ __s: createSketch({ ctx, t, dur, theme, look, onMissing, format }), __ctx: ctx, Math, Number, String, Array, Object, JSON, Infinity, NaN, isFinite, parseFloat, parseInt });
    try {
      script.runInContext(context, { timeout: 400 });
    } catch (error) {
      return `${error?.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT' ? 'terlalu lama (loop?)' : String(error?.message || error)} pada detik ${t.toFixed(1)}`;
    }
  }
  if (missing.size) return `tidak ada: ${[...missing].slice(0, 4).join(', ')} (pakai nama ikon Lucide yang ada, dan hanya aset yang tersedia)`;
  return null;
}

// Drawing code for every scene: groups of four in parallel (each told what the scene before it showed), each
// scene checked, failures sent back once for a fix. Returns { scenes, usages }; a scene that still fails keeps
// `codeError` (the player shows its background and caption without the picture).
// `only` (scene indexes) redraws just those scenes and keeps the others' code.
export async function animateStory({ scenes, pace, style, cast = [], assets = {}, format = '9:16', sounds = [], only = null, call = callStoryModel, onProgress = async () => {}, onScenes = null }) {
  const todo = scenes.map((_, i) => i).filter((i) => !only || only.includes(i));
  const groups = [];
  for (let i = 0; i < todo.length; i += BATCH) groups.push(todo.slice(i, i + BATCH));
  if (!groups.length) return { scenes, usages: [] };
  const usages = [];
  let done = 0;
  const codes = {};
  const errors = [];
  await Promise.all(groups.map(async (indexes) => {
    const prompt = animatePrompt({
      scenes: indexes.map((i) => scenes[i]), numbers: indexes.map((i) => i + 1),
      before: indexes[0] > 0 ? scenes[indexes[0] - 1].visual : '', pace, style, cast, assets, format, sounds,
    });
    try {
      const { text, usage } = await call({ ...prompt, maxTokens: 40000 });
      usages.push(usage);
      const got = splitScenes(text);
      Object.assign(codes, got);
      // hand over the scenes of this group that already pass the check (failures wait for the repair pass)
      if (onScenes) {
        const ready = {};
        for (const i of indexes) if (got[i + 1] && !checkSceneCode(got[i + 1], { dur: scenes[i].duration, theme: scenes[i].theme, style, assets, format })) ready[i] = { code: got[i + 1] };
        if (Object.keys(ready).length) await onScenes(ready).catch(() => {});
      }
    } catch (error) {
      errors.push(error);
    }
    done += indexes.length;
    await onProgress(done, todo.length);
  }));
  if (errors.length === groups.length) throw errors[0];
  const check = (i) => checkSceneCode(codes[i + 1], { dur: scenes[i].duration, theme: scenes[i].theme, style, assets, format });
  let broken = todo.map((i) => ({ i, error: check(i) })).filter((item) => item.error);
  if (broken.length) {
    const system = animatePrompt({ scenes: [], numbers: [], before: '', pace, style, cast, assets, format }).system;
    try {
      const { text, usage } = await call({
        system, user: repairPrompt({ broken: broken.map(({ i, error }) => ({ number: i + 1, error, code: codes[i + 1] || '// (tidak ada kode)' })) }), maxTokens: 40000,
      });
      usages.push(usage);
      const fixed = splitScenes(text);
      for (const { i } of broken) if (fixed[i + 1]) codes[i + 1] = fixed[i + 1];
    } catch { /* keep what we have; the scenes stay marked */ }
    broken = broken.map(({ i }) => ({ i, error: check(i) })).filter((item) => item.error);
  }
  const failed = new Map(broken.map(({ i, error }) => [i, error]));
  return {
    scenes: scenes.map((scene, i) => {
      if (!todo.includes(i)) return scene;
      const { codeError, redraw, ...rest } = scene;
      return failed.has(i) ? { ...rest, code: '', codeError: failed.get(i) } : { ...rest, code: codes[i + 1] };
    }),
    usages,
  };
}
