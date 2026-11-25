// ElevenLabs voice sample generator for Canvas Characters.
// Lists curated ElevenLabs voices and generates a short MP3 voice reference
// stored as a workspace audio asset (billed in workspace credits).
import { randomUUID } from 'node:crypto';
import { getPool } from '../db/pool.js';
import { appendCreditEntry } from './creditService.js';
import { createStorage, importWorkspaceAsset } from './assetService.js';
import {
  ELEVENLABS_VOICES,
  VOICEOVER_MODEL,
  audioCredits,
  generateElevenLabsAudio,
  validateAudioInput,
} from './elevenlabsAudio.js';

export const MAX_CHARACTER_SAMPLE_CHARS = 400;

export function defaultCharacterVoiceSample(characterName = '') {
  const clean = String(characterName || '').trim().slice(0, 60);
  return clean
    ? `Hi, I'm ${clean}. This is my natural speaking voice, clear and expressive, ready for our next scene.`
    : 'Hi there. This is my natural speaking voice, clear and expressive, ready for our next scene.';
}

export function mp3Seconds(bytes) {
  return Math.round(((bytes * 8) / 128000) * 100) / 100;
}

async function readCreditBalance(pool, workspaceId) {
  const result = await pool.query('SELECT balance FROM credit_accounts WHERE workspace_id = $1', [workspaceId]);
  return Number(result.rows[0]?.balance ?? 0);
}

function fail(message, status, code) {
  return Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
}

export async function listCharacterVoices({
  env = process.env,
  priceAudio = audioCredits,
} = {}) {
  const sampleText = defaultCharacterVoiceSample();
  let sampleCredits = 0;
  try {
    const priced = await priceAudio(
      { type: 'voiceover', voiceId: ELEVENLABS_VOICES[0].id, text: sampleText },
      { env },
    );
    sampleCredits = priced.credits;
  } catch {
    sampleCredits = 0;
  }
  return {
    voices: ELEVENLABS_VOICES,
    configured: Boolean(env.ELEVENLABS_API_KEY),
    defaultSampleText: sampleText,
    sampleCredits,
  };
}

export async function generateCharacterVoice({
  pool = getPool(),
  workspaceId,
  userId,
  voiceId,
  text,
  characterName = '',
  requestId = randomUUID(),
  readBalance = readCreditBalance,
  priceAudio = audioCredits,
  generateAudio = generateElevenLabsAudio,
  importAsset = importWorkspaceAsset,
  loadStorage = createStorage,
  appendCredit = appendCreditEntry,
}) {
  const sampleText = String(text || '').trim() || defaultCharacterVoiceSample(characterName);
  if (sampleText.length > MAX_CHARACTER_SAMPLE_CHARS) {
    throw fail(`Sample text must be ${MAX_CHARACTER_SAMPLE_CHARS} characters or shorter.`, 400);
  }
  const audio = validateAudioInput({ type: 'voiceover', voiceId, text: sampleText });
  const voice = ELEVENLABS_VOICES.find((v) => v.id === audio.voiceId);
  const { usd, credits } = await priceAudio(audio);

  if ((await readBalance(pool, workspaceId)) < credits) {
    throw fail(`Kredit kurang. Butuh ${credits} kredit untuk membuat sample suara karakter ini.`, 402);
  }

  let file;
  try {
    file = await generateAudio(audio);
  } catch (error) {
    const status = error.status === 400 || error.status === 424 || error.status === 503 ? error.status : 502;
    throw Object.assign(
      fail(
        status === 502 ? 'ElevenLabs sedang tidak bisa membuat suara. Coba lagi sebentar lagi.' : error.message,
        status,
        error.code,
      ),
      { cause: error },
    );
  }

  const slug = (voice?.name || characterName || 'voice')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'voice';

  const imported = await importAsset(
    workspaceId,
    {
      filename: `character-voice-${slug}.mp3`,
      contentType: file.contentType || 'audio/mpeg',
      body: file.body,
      allowAudio: true,
    },
    loadStorage(),
    pool,
  );

  let charged = credits;
  if (credits > 0) {
    const entry = {
      workspaceId,
      reason: 'character_voice',
      idempotencyKey: `character-voice:${requestId}`,
      metadata: {
        type: 'voiceover',
        model: `elevenlabs/${VOICEOVER_MODEL}`,
        voiceId: audio.voiceId,
        voiceName: voice?.name || null,
        assetId: imported.asset.id,
        providerCostUsd: usd,
        characters: audio.text.length,
        userId,
      },
    };
    try {
      await appendCredit(pool, { ...entry, amount: -credits });
    } catch (error) {
      if (error?.message !== 'Insufficient credits') throw error;
      const balance = await readBalance(pool, workspaceId);
      charged = Math.max(0, Math.floor(balance * 10) / 10);
      if (charged > 0) {
        await appendCredit(pool, {
          ...entry,
          amount: -charged,
          metadata: { ...entry.metadata, partial: true, quotedCredits: credits },
        });
      }
    }
  }

  return {
    assetId: imported.asset.id,
    url: imported.url,
    seconds: mp3Seconds(file.body.length),
    credits: charged,
    voiceId: audio.voiceId,
    voiceName: voice?.name || 'Custom Voice',
  };
}
