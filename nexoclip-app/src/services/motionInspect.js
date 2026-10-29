// The Motion agent's eyes: snapshots of a drawn scene (motionFrames.js) shown to Seed 2.1 (a vision model on
// BytePlus), which says what it actually sees and what looks wrong. Used as the inspect_scene tool.
import { MOTION_MODEL } from './motionDirector.js';

const TIMEOUT_MS = 120_000;

export async function inspectScene({ story, index, question = '', env = process.env, fetchImpl = fetch }) {
  const scene = story.scenes[index];
  if (!scene) throw Object.assign(new Error('Adegan tidak ada.'), { status: 400 });
  if (!scene.code) return { text: 'Adegan ini belum digambar.', usage: null };
  const { sceneFrames } = await import('./motionFrames.js'); // native canvas: loaded only where a scene is inspected
  const frames = sceneFrames(story, index, { width: 432 });
  const baseUrl = String(env.BYTEPLUS_BASE_URL || '').replace(/\/+$/, '');
  if (!env.BYTEPLUS_API_KEY || !baseUrl) throw Object.assign(new Error('Vision model is not configured'), { status: 503 });
  const prompt = `Ini ${frames.length} cuplikan (detik ${frames.map((f) => f.t).join(', ')}) dari satu adegan video animasi gambar tangan 9:16.
Yang diminta untuk adegan ini:
- teks narasi: "${scene.text}"
- gambar & gerak: ${scene.visual}
${question ? `Pertanyaan: ${question}\n` : ''}Jelaskan singkat dan jujur dalam poin: apa yang benar-benar terlihat; apakah benda/tokoh yang diminta mudah dikenali; masalah (objek terpotong, bertumpuk, terlalu kecil, kosong, teks tertutup, warna tidak terbaca, aneh); dan 1-3 saran perbaikan yang konkret untuk gambarnya.`;
  const response = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.BYTEPLUS_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MOTION_MODEL, max_tokens: 1200, thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: [...frames.map((f) => ({ type: 'image_url', image_url: { url: `data:image/png;base64,${f.png.toString('base64')}` } })), { type: 'text', text: prompt }] }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(body?.error?.message || `Seed returned HTTP ${response.status}`), { status: 502 });
  const text = String(body?.choices?.[0]?.message?.content || '').trim();
  const u = body?.usage || {};
  return {
    text: text || 'Tidak ada yang bisa dilihat.',
    usage: { model: MOTION_MODEL, prompt_tokens: Number(u.prompt_tokens) || 0, completion_tokens: Number(u.completion_tokens) || 0, prompt_tokens_details: { cached_tokens: Number(u.prompt_tokens_details?.cached_tokens) || 0 } },
  };
}
