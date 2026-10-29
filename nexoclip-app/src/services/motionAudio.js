// One Motion audio file from ElevenLabs (elevenlabsAudio.js), stored as a workspace asset and charged in credits.
// Used by /api/motion/audio (the Audio tab's buttons) and by the motion worker (sound the AI was asked for).
import { appendCreditEntry } from './creditService.js';
import { createStorage, importWorkspaceAsset } from './assetService.js';
import { audioCredits, generateElevenLabsAudio, generateVoiceoverWithTimestamps, validateAudioInput } from './elevenlabsAudio.js';

export async function readCreditBalance(pool, workspaceId) {
  const result = await pool.query('SELECT balance FROM credit_accounts WHERE workspace_id = $1', [workspaceId]);
  return Number(result.rows[0]?.balance ?? 0);
}

// ElevenLabs answers mp3_44100_128: constant 128 kbit/s, so the length follows from the size.
export const mp3Seconds = (bytes) => Math.round((bytes * 8 / 128000) * 100) / 100;

const fail = (message, status) => Object.assign(new Error(message), { status });

// Returns { assetId, url, seconds, credits, words? }. A voiceover also says when each word is spoken (captions).
// The balance must cover the price before anything is generated; if it ran out meanwhile, what is left is taken.
export async function makeMotionAudio({
  pool, workspaceId, userId, input, idempotencyKey,
  readBalance = readCreditBalance, priceAudio = audioCredits, generateAudio = generateElevenLabsAudio,
  generateVoiceover = generateVoiceoverWithTimestamps, importAsset = importWorkspaceAsset,
  loadStorage = createStorage, appendCredit = appendCreditEntry,
}) {
  const audio = validateAudioInput(input);
  const { usd, credits } = await priceAudio(audio);
  if (await readBalance(pool, workspaceId) < credits) {
    throw fail(`Kredit kurang. Butuh ${credits} kredit untuk ${audio.type === 'music' ? 'musik' : 'voiceover'} ini.`, 402);
  }
  let file;
  try {
    file = audio.type === 'voiceover' ? await generateVoiceover(audio) : await generateAudio(audio);
  } catch (error) {
    const status = error.status === 400 || error.status === 424 ? error.status : 502;
    throw Object.assign(fail(status === 502 ? 'ElevenLabs sedang tidak bisa membuat audio. Coba lagi sebentar lagi.' : error.message, status), { cause: error });
  }
  const imported = await importAsset(workspaceId, {
    filename: `motion-${audio.type}.mp3`, contentType: file.contentType, body: file.body, allowAudio: true,
  }, loadStorage(), pool);
  const entry = {
    workspaceId, reason: 'motion_audio', idempotencyKey,
    metadata: {
      type: audio.type, assetId: imported.asset.id, providerCostUsd: usd, userId,
      characters: audio.type === 'voiceover' ? audio.text.length : undefined, durationSeconds: audio.durationSeconds,
    },
  };
  let charged = credits;
  if (credits > 0) {
    try {
      await appendCredit(pool, { ...entry, amount: -credits });
    } catch (error) {
      if (error?.message !== 'Insufficient credits') throw error;
      const balance = await readBalance(pool, workspaceId);
      charged = Math.max(0, Math.floor(balance * 10) / 10);
      if (charged > 0) await appendCredit(pool, { ...entry, amount: -charged, metadata: { ...entry.metadata, partial: true, quotedCredits: credits } });
    }
  }
  return { assetId: imported.asset.id, url: imported.url, seconds: mp3Seconds(file.body.length), credits: charged, ...(file.words ? { words: file.words } : {}) };
}
