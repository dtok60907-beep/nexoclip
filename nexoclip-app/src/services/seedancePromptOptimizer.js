// Dedicated Seedance 2.5 Director Prompt Optimizer.
// Distills ByteDance official `sd25-pe` + OpenMontage `seedance-2-5/SKILL.md` + `ugc-ad.md`
// so every video prompt sent to Seedance 2.5 (chat Video Render OR Canvas Open in Canvas)
// is 100% directorial English with exact `{spoken Indonesian dialogue}`, `<SFX>`, `(music)`,
// `@Prop`/`@Character` reference locks, and zero AI-gibberish text overlays.

const DEFAULT_OPTIMIZER_MODEL = 'dola-seed-2-1-turbo-260628';
const BYTEPLUS_ENDPOINT = 'https://ark.ap-southeast.bytepluses.com/api/v3/chat/completions';
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

const BAD_VISUAL_PATTERNS = [
  /\b(stiker|tulisan|grafik|sertifikat|piagam|tombol|slide foto|kamar kosan|botol whey|pria gym|wanita fitness|angkat besi|tutup botol|bubuk putih)\b/i,
  /\b(bold text overlay|text overlay|countdown timer|infographic|bar chart|split-screen.*tulisan|before-after.*slide)\b/i,
  /\b(studio lighting|softbox|ring light|8k ultra|stock photo|airbrushed|flawless skin|glossy commercial)\b/i,
  /\{\s*(voiceover|vo|pria|wanita|creator|narator|speaker|dialog)[^:]{0,28}:/i,
];

export const IMPERFECTION_FIRST_VIDEO_NEGATIVE =
  'NEGATIVE / AVOID: studio lighting, softbox beauty light, ring-light eye reflections, stock photo aesthetic, over-polished airbrushed plastic skin, stiff commercial ad pose, robotic smile, gimbal/crane sheen, cinematic teal-orange color grading, on-screen text overlays, subtitles, stickers, UI buttons, watermarks.';

export function ensureImperfectionFirstVideoGuardrails(prompt = '') {
  const clean = sanitizeSeedancePrompt(prompt);
  if (!clean) return '';
  if (/NEGATIVE\s*\/\s*AVOID:/i.test(clean) || /STRICTLY AVOID:/i.test(clean)) {
    return clean;
  }
  return `${clean}\n\n${IMPERFECTION_FIRST_VIDEO_NEGATIVE}`;
}

/**
 * Strips speaker labels accidentally placed INSIDE `{...}` dialogue braces
 * (e.g. `{Voiceover tegas: Halo...}` -> `{Halo...}`) so Seedance 2.5 never
 * reads stage directions out loud, and removes accidental markdown fences.
 */
export function sanitizeSeedancePrompt(raw = '') {
  let out = String(raw || '').trim();
  // Strip wrapping markdown fences if model emits them
  out = out.replace(/^```(?:text|prompt|markdown)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  // Strip speaker label prefix accidentally inside `{...}`
  out = out.replace(
    /\{\s*(?:voiceover|vo|narator|narrator|speaker|creator|talent|host|pria|wanita|cewek|cowok|dialog|line)[^:{}]{0,36}:\s*/gi,
    '{',
  );
  // Collapse excessive blank lines
  out = out.replace(/\n{3,}/g, '\n\n');
  return out;
}

/**
 * Heuristic check to detect rushed/generic/Indonesian-mixed/text-overlay prompts
 * that should be upgraded through the Seedance 2.5 Director Optimizer.
 */
export function needsSeedanceOptimization(prompt = '') {
  const clean = String(prompt || '').trim();
  if (!clean) return true;
  const wordCount = clean.split(/\s+/).filter(Boolean).length;
  if (wordCount < 95) return true;
  if (!/NEGATIVE\s*\/\s*AVOID:/i.test(clean)) return true;
  return BAD_VISUAL_PATTERNS.some((re) => re.test(clean));
}

function buildOptimizerSystemPrompt() {
  return [
    'You are an elite Commercial & UGC Film Director specializing in ByteDance **Seedance 2.5 Omni** video prompts.',
    'Rewrite the user creative brief/draft into ONE production-ready Seedance 2.5 video prompt (170–260 words, plain text only, NO markdown bolding or code fences).',
    '',
    '### NON-NEGOTIABLE SEEDANCE 2.5 + "IMPERFECTION FIRST" VIDEO RULES:',
    '1. **"Imperfection First" Realism for EVERY Video Prompt (NOT just characters — camera, lighting, motion, and environment too!):**',
    '   - Smartphone handheld selfie/eye-level or natural POV camera with subtle organic hand micro-shake, slightly imperfect framing, natural phone dynamic range and light sensor grain.',
    '   - Natural side-window daylight or everyday practical indoor lighting with realistic uneven shadows — NEVER studio lighting, softbox beauty light, or ring-light reflections.',
    '   - Casual unhurried real-life body movement, genuine blinks, natural micro-expressions, visible skin pores and stray hairs, authentic lived-in background clutter slightly out of focus.',
    '   - Keep the SAME creator (age, wardrobe, voice style, lighting) and EXACT product packaging consistent across every shot.',
    '2. **100% Concrete Directorial English for Visuals:** Write ALL style, camera, blocking, subject, wardrobe, lighting, physics, and sound-design instructions in vivid, filmic English.',
    '3. **Script & Visual Structure (Hook → Problem/Solution → Product Demo → Natural CTA):**',
    '   - Every shot MUST specify explicit clip duration (`0–2s`, `2–5s`, `5–8s`, etc.) AND concrete camera direction (framing, lens/phone distance, subtle handheld movement).',
    '   - Translate any claim/offer/CTA into **real, physical, camera-filmable live action + casual spoken words** (e.g. holding the product closer to lens, pouring/scooping, natural reaction), NEVER stiff ad poses.',
    '4. **Exact `{...}` Curly Braces for Spoken Dialogue ONLY (English by default):**',
    '   - Put ONLY the exact spoken words inside `{...}` in natural conversational English (only keep Indonesian if the draft dialogue explicitly requests Indonesian speech), e.g. `Creator speaks casually in natural conversational English: {Honestly I trained every week and saw zero progress until I switched to this whey.}`.',
    '   - NEVER put speaker labels like `Voiceover:` or `Creator:` INSIDE `{...}` — Seedance reads everything inside `{...}` out loud!',
    '   - Spoken dialogue must sound like a real person talking to a friend (casual, short natural phrasing, NEVER stiff brochure clichés like "CLINICALLY PROVEN!", "20% OFF FOR 24 HOURS ONLY!").',
    '   - Pacing budget: max ~2.3 spoken words per second of video (8s clip = max 16–19 words total inside `{...}`).',
    '5. **Exact Audio Tags:**',
    '   - Diegetic SFX in `<...>` (e.g. `<crisp plastic lid pop>`, `<shaker rattling with ice>`).',
    '   - Subtle music in `(...)` ONLY if explicitly requested; for realistic UGC talking-head/demo, write `Quiet natural room tone. No background music.`',
    '6. **ZERO AI-Gibberish Visuals (STRICTLY FORBIDDEN):**',
    '   - NEVER ask Seedance to render on-screen text overlays, subtitles, discount stickers, percentage numbers, bar charts, infographics, certificates, countdown timers, UI buttons, or photo slideshows.',
    '7. **Exact `@Tag` Reference Binding:**',
    '   - Use the EXACT `@Tag` tokens provided in `Reference Tags` verbatim (never rename or invent new `@tags`).',
    '   - Lock product packaging/label fidelity cleanly (`label crisp, upright, facing the lens`).',
    '',
    '### REQUIRED OUTPUT FORMAT (plain text, exact section labels):',
    'GLOBAL STYLE: <1–2 sentences: Imperfection First authentic smartphone/handheld video realism, aspect ratio, natural skin texture, organic micro-shake, lived-in environment.>',
    'SUBJECT & PROPS: <Consistent creator appearance/wardrobe/voice rules + exact @Tag character & @Tag product role lock + lived-in setting.>',
    'SHOT 1 (0–2.5s · Hook): <Camera direction & framing + relatable opening beat/micro-acting.>',
    'SHOT 2 (2.5–5.5s · Problem/Solution & Demo): <Camera direction & framing + continuous tactile real-world product demonstration.>',
    'SHOT 3 (5.5–8s · Natural CTA): <Camera direction & framing + genuine casual closing beat with @Product clearly visible.>',
    'LIGHTING: <Single committed natural window daylight or everyday practical room light with realistic uneven shadows.>',
    'AUDIO: <Speaker voice tone/tempo/language + `{natural spoken words ONLY}` + `<SFX>` + quiet natural room tone.>',
    'NEGATIVE / AVOID: studio lighting, softbox beauty light, ring-light reflections, stock photo aesthetic, over-polished airbrushed plastic skin, stiff commercial ad pose, robotic smile, cinematic teal-orange color grading, on-screen text overlays, subtitles, stickers, watermarks.',
  ].join('\n');
}

function buildOptimizerUserMessage({
  rawPrompt = '',
  title = '',
  format = '',
  hook = '',
  angle = '',
  cta = '',
  voiceover = '',
  durationSeconds = 8,
  aspectRatio = '9:16',
  brandKit = null,
  folderTags = [],
}) {
  const tagsLine = (folderTags || [])
    .map((f) => `@${f.tag} (${f.type}: ${f.name}${f.description ? ` — ${f.description}` : ''})`)
    .join(', ');

  const primaryAvatar = Array.isArray(brandKit?.avatars) && brandKit.avatars.length ? brandKit.avatars[0] : null;
  const avatarLine = primaryAvatar
    ? `Saved Brand Avatar Consistency Rules: ${primaryAvatar.name}${primaryAvatar.description ? ` — ${primaryAvatar.description}` : ''}${primaryAvatar.wardrobe ? ` | Wardrobe: ${primaryAvatar.wardrobe}` : ''}${primaryAvatar.voiceStyle ? ` | Speaking style: ${primaryAvatar.voiceStyle}` : ''}${primaryAvatar.lighting ? ` | Lighting: ${primaryAvatar.lighting}` : ''}`
    : '';

  return [
    `Title: ${title || 'Ad Video'}`,
    `Format: ${format || 'UGC vertical video'}`,
    `Target Duration: ${durationSeconds}s | Aspect Ratio: ${aspectRatio}`,
    brandKit?.brandName ? `Brand: ${brandKit.brandName}${brandKit.tone ? ` | Tone: ${brandKit.tone}` : ''}` : '',
    avatarLine,
    tagsLine ? `Reference Tags (MUST use verbatim): ${tagsLine}` : '',
    hook ? `Hook intent: ${hook}` : '',
    angle ? `Creative angle: ${angle}` : '',
    voiceover ? `Draft spoken script (condense to <= ${Math.round(durationSeconds * 2.3)} natural Indonesian words inside {...}): ${voiceover}` : '',
    cta ? `CTA direction (convey visually/verbally naturally, NO on-screen text): ${cta}` : '',
    rawPrompt ? `\nCurrent draft prompt to rewrite:\n${rawPrompt}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Upgrades a draft video prompt into a director-grade Seedance 2.5 Omni prompt
 * using BytePlus Seed 2.1 Turbo (or OpenRouter fallback). Never throws on transient
 * LLM failure — returns a sanitized fallback so Canvas/Video flows remain rock-solid.
 */
export async function optimizeSeedancePrompt({
  rawPrompt = '',
  title = '',
  format = '',
  hook = '',
  angle = '',
  cta = '',
  voiceover = '',
  durationSeconds = 8,
  aspectRatio = '9:16',
  brandKit = null,
  folderTags = [],
  force = false,
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const cleanedRaw = sanitizeSeedancePrompt(rawPrompt);
  if (!force && cleanedRaw && !needsSeedanceOptimization(cleanedRaw)) {
    return cleanedRaw;
  }

  const byteplusKey = String(env.BYTEPLUS_API_KEY || '').trim();
  const openRouterKey = String(env.OPENROUTER_API_KEY || '').trim();
  if (!byteplusKey && !openRouterKey) {
    return ensureImperfectionFirstVideoGuardrails(cleanedRaw);
  }

  const useBytePlus = Boolean(byteplusKey);
  const endpoint = useBytePlus ? BYTEPLUS_ENDPOINT : OPENROUTER_ENDPOINT;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${useBytePlus ? byteplusKey : openRouterKey}`,
  };
  if (!useBytePlus) {
    headers['HTTP-Referer'] = env.APP_BASE_URL || 'https://nexoclip.com';
    headers['X-Title'] = 'Nexoclip Seedance 2.5 Prompt Optimizer';
  }

  const system = buildOptimizerSystemPrompt();
  const user = buildOptimizerUserMessage({
    rawPrompt: cleanedRaw,
    title,
    format,
    hook,
    angle,
    cta,
    voiceover,
    durationSeconds,
    aspectRatio,
    brandKit,
    folderTags,
  });

  const payload = useBytePlus
    ? {
        model: DEFAULT_OPTIMIZER_MODEL,
        max_tokens: 900,
        temperature: 0.65,
        thinking: { type: 'disabled' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }
    : {
        model: 'anthropic/claude-sonnet-4',
        max_tokens: 900,
        temperature: 0.65,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      };

  try {
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return ensureImperfectionFirstVideoGuardrails(cleanedRaw);
    const data = await res.json().catch(() => null);
    const text = sanitizeSeedancePrompt(data?.choices?.[0]?.message?.content || '');
    if (!text || text.length < 120) return ensureImperfectionFirstVideoGuardrails(cleanedRaw);
    return ensureImperfectionFirstVideoGuardrails(text);
  } catch {
    return ensureImperfectionFirstVideoGuardrails(cleanedRaw);
  }
}
