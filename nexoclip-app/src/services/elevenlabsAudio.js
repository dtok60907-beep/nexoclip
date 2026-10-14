// Voiceover (text to speech) and music from ElevenLabs, billed in nexoclip credits.
// Both endpoints answer with the finished audio file, so a job is one request:
// no queue or worker is needed, unlike image and video generation.
import { loadUsdIdrRate, usdToCredits } from './generationPricing.js';

const API = 'https://api.elevenlabs.io';
export const VOICEOVER_MODEL = 'eleven_v3';
export const MUSIC_MODEL = 'music_v1';
const OUTPUT_FORMAT = 'mp3_44100_128';
export const MAX_VOICEOVER_CHARS = 5000; // eleven_v3's limit per request
export const MIN_MUSIC_SECONDS = 3;
export const MAX_MUSIC_SECONDS = 300;

// USD we really pay, which is the plan, not the list price: the Starter plan is $6 a month for 39,482 credits
// (about $0.152 per 1,000), a voiceover character costs one credit and a minute of music about 1,650 (measured
// October 2026: 10 s = 275 credits, about $0.25 a minute). Rounded up so neither is sold below cost; the list prices
// (elevenlabs.io/pricing/api: $0.08 per 1,000 characters, $0.15 a minute) are lower than what the plan costs us.
// Update by hand when the plan or its quota changes.
export const ELEVENLABS_PRICES = {
  voiceoverPerThousandChars: 0.16,
  musicPerMinute: 0.30,
};

// Premade voices every ElevenLabs account has. Listed here because the API key
// may lack the voices_read permission; their ids are stable.
export const ELEVENLABS_VOICES = [
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', gender: 'male', description: 'warm, mature narrator' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', gender: 'male', description: 'deep, resonant, ads and trailers' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', gender: 'male', description: 'authoritative, news style' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', gender: 'male', description: 'young, energetic' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris', gender: 'male', description: 'casual, friendly' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger', gender: 'male', description: 'laid-back, confident' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', gender: 'female', description: 'soft, reassuring' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', gender: 'female', description: 'warm, upbeat storyteller' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', gender: 'female', description: 'young, bright, playful' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', gender: 'female', description: 'quirky, lively' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', gender: 'female', description: 'smooth, seductive' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', gender: 'female', description: 'gentle, elegant' },
];
const VOICE_IDS = new Set(ELEVENLABS_VOICES.map((voice) => voice.id));
const VOICE_ID = /^[A-Za-z0-9]{10,40}$/;

function invalid(message) {
  return Object.assign(new Error(message), { status: 400 });
}

export function validateAudioInput(input = {}) {
  const type = input.type;
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  if (type === 'voiceover') {
    if (!text) throw invalid('Voiceover text is required');
    if (text.length > MAX_VOICEOVER_CHARS) throw invalid(`Voiceover text is longer than ${MAX_VOICEOVER_CHARS} characters`);
    const voiceId = String(input.voiceId || '');
    // Any well-formed id is accepted (a user's own voice), the premade list is only the default choice.
    if (!VOICE_IDS.has(voiceId) && !VOICE_ID.test(voiceId)) throw invalid('voiceId is invalid');
    return { type, text, voiceId };
  }
  if (type === 'music') {
    if (!text) throw invalid('A music prompt is required');
    if (text.length > 2000) throw invalid('The music prompt is too long');
    const seconds = Math.round(Number(input.durationSeconds));
    if (!Number.isFinite(seconds) || seconds < MIN_MUSIC_SECONDS || seconds > MAX_MUSIC_SECONDS) {
      throw invalid(`Music length must be ${MIN_MUSIC_SECONDS}-${MAX_MUSIC_SECONDS} seconds`);
    }
    return { type, text, durationSeconds: seconds, instrumental: input.instrumental !== false };
  }
  throw invalid('Audio type must be voiceover or music');
}

export function audioCostUsd(input) {
  const audio = validateAudioInput(input);
  if (audio.type === 'voiceover') return (audio.text.length / 1000) * ELEVENLABS_PRICES.voiceoverPerThousandChars;
  return (audio.durationSeconds / 60) * ELEVENLABS_PRICES.musicPerMinute;
}

export async function audioCredits(input, { env = process.env, loadRate = loadUsdIdrRate } = {}) {
  const usd = audioCostUsd(input);
  return { usd, credits: usdToCredits(usd, env, await loadRate({ env })) };
}

// Returns { body: Buffer, contentType }.
export async function generateElevenLabsAudio(input, { apiKey = process.env.ELEVENLABS_API_KEY, fetchImpl = fetch } = {}) {
  if (!apiKey) throw Object.assign(new Error('Audio generation is not configured'), { status: 503 });
  const audio = validateAudioInput(input);
  const [path, payload] = audio.type === 'voiceover'
    ? [`/v1/text-to-speech/${encodeURIComponent(audio.voiceId)}`, { text: audio.text, model_id: VOICEOVER_MODEL }]
    : ['/v1/music', {
      prompt: audio.text, music_length_ms: audio.durationSeconds * 1000, model_id: MUSIC_MODEL,
      force_instrumental: audio.instrumental,
    }];
  const response = await fetchImpl(`${API}${path}?output_format=${OUTPUT_FORMAT}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    const message = detail?.detail?.message || detail?.detail?.[0]?.msg || `ElevenLabs returned HTTP ${response.status}`;
    throw Object.assign(new Error(message), { status: response.status === 422 || response.status === 400 ? 400 : 502, code: 'AUDIO_PROVIDER_FAILED' });
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (!body.length) throw Object.assign(new Error('ElevenLabs returned an empty file'), { status: 502, code: 'AUDIO_PROVIDER_FAILED' });
  return { body, contentType: 'audio/mpeg' };
}
