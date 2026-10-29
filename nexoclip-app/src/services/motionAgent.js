// The Motion chat agent: like the AI Director, the user talks and the AI (Claude Sonnet on OpenRouter) shapes the
// whole drawn video with tools: the plan (kind, style, pace, voice, music, cast, looks), ideas, the script, scene
// edits, assets, and a production request the user approves (voice, music and drawings cost credits). The agent
// only edits the story document; motionJobs.js runs the paid production after the user's approval.
import { PATTERNS } from '../../components/motion/draw/backdrop.js';
import { DRAW_STYLES, PACES, STORY_CAMERAS, cleanStoryScene, drawStyleOf, paceOf } from '../../components/motion/draw/story.js';
import { ELEVENLABS_VOICES } from './elevenlabsAudio.js';
import { FORMATS, FORMAT_IDS } from '../../components/motion/draw/layout.js';
import { callStoryModel, narrationText, spokenWords } from './motionStory.js';

const MAX_STEPS = 8;
const words = (text) => String(text || '').split(/\s+/).filter(Boolean);
const bare = (word) => String(word || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

const tool = (name, description, properties, required = []) => ({
  type: 'function', function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } },
});
const str = (description) => ({ type: 'string', description });
const num = (description) => ({ type: 'number', description });
const bool = (description) => ({ type: 'boolean', description });

const SCENE = {
  type: 'object',
  properties: {
    text: str('narration shown on screen, written the way it is spoken (numbers in words)'),
    say: str("the narrator's version: the SAME words, plus Eleven v4 audio tags in [brackets], CAPITALS for stress, ... for pauses"),
    visual: str('concrete picture and motion: named objects with their telling parts, which cast members, which assets'),
    theme: str('a look name from the plan (paper, dusk, night or one you defined)'),
    camera: { type: 'string', enum: STORY_CAMERAS },
    emphasis: str('ONE word of text, exactly as written, where the camera hits'),
    duration: num('seconds, roughly 1 + 0.3 per word; the narration sets the final length'),
  },
  required: ['text', 'visual', 'theme', 'camera', 'emphasis'],
};

export const AGENT_TOOLS = [
  tool('update_plan', 'Set or change the plan of the video. Omit what you are not changing.', {
    title: str('the video title (also renames the project)'),
    format: { type: 'string', enum: FORMAT_IDS, description: `aspect ratio: ${FORMAT_IDS.map((f) => `${f} ${FORMATS[f].label}`).join(', ')}. Changing it later redraws every scene.` },
    brief: str('what the video is, for whom, and what it must achieve, in one or two sentences'),
    kind: str('the kind of video in a few words (motivasi lembut, edukasi sejarah, promo produk, dongeng anak, berita, tips, ...)'),
    scene_count: num('planned number of scenes (3-16)'),
    style: {
      type: 'object', description: 'drawing style: start from a preset and adjust',
      properties: {
        preset: { type: 'string', enum: DRAW_STYLES.map((d) => d.id) }, label: str('short name'),
        look: str('one sentence describing the look for the animator'), wobble: num('line wobble 0-2.5 (1 crayon, 0.3 clean)'),
        hatch: bool('crayon texture inside shapes'), outline: num('outline thickness 0.3-2.5'), chalk: bool('chalkboard look (forces dark boards)'),
      },
      additionalProperties: false,
    },
    pace: {
      type: 'object', description: 'pace: start from a preset and adjust',
      properties: {
        preset: { type: 'string', enum: PACES.map((p) => p.id) }, label: str('short name'),
        words: { type: 'array', items: { type: 'number' }, description: '[min, max] words per scene' },
        transition: num('seconds a scene takes to slide in (0.1-1)'), camera: num('camera strength 0-2 (1 normal)'),
        hardCameras: num('share of scenes that may use crash/shake (0-0.6)'), stability: num('narrator stability 0-1 (lower = more expressive)'),
        tone: str('how the narrator sounds'), entrance: str('how things move in, for the animator'),
      },
      additionalProperties: false,
    },
    voice_id: { type: 'string', enum: ELEVENLABS_VOICES.map((v) => v.id), description: 'narrator voice' },
    music: bool('whether the video gets a music bed'),
    music_prompt: str('ElevenLabs Music prompt (English): genre, mood, instruments, BPM, era/production, key, arrangement over time, exclusions'),
    cast: { type: 'array', description: 'recurring characters with a fixed look (s.person / s.animal options)', items: { type: 'object', properties: { name: str('name'), look: str('exact options, e.g. person: skin brown, hair black curly, shirt #c0703a ...') }, required: ['name', 'look'], additionalProperties: false } },
    looks: {
      type: 'object', description: `named backgrounds the scenes use: { name: { top, bottom (hex), pattern (${PATTERNS.join('|')}), sheet (paper sheet above the caption), image (an asset key) } }`,
      additionalProperties: { type: 'object', properties: { top: str('hex'), bottom: str('hex'), pattern: str('pattern'), sheet: bool('paper sheet'), image: str('asset key') }, additionalProperties: false },
    },
  }),
  tool('propose_ideas', 'Show the user idea cards to pick from (3-5, clearly different).', {
    ideas: { type: 'array', items: { type: 'object', properties: { title: str('title'), hook: str('opening line'), angle: str('the point in 1-2 sentences'), visualStyle: str('look + light + palette + framing + main metaphor/visual') }, required: ['title', 'hook', 'angle', 'visualStyle'], additionalProperties: false } },
  }, ['ideas']),
  tool('write_script', 'Write (or rewrite) the whole script. Replaces all scenes; every scene will be drawn again.', {
    title: str('video title'),
    scenes: { type: 'array', items: SCENE },
    seo: { type: 'object', properties: { title: str('YouTube title, keyword first, max 70 chars'), description: str('3-5 sentences'), tags: { type: 'array', items: { type: 'string' } }, hashtags: { type: 'array', items: { type: 'string' } } }, additionalProperties: false },
    music_prompt: str('music prompt timed to this script (see update_plan)'),
  }, ['title', 'scenes']),
  tool('edit_scenes', 'Change some scenes and keep the rest. Indexes are 1-based as the user sees them.', {
    changes: { type: 'array', items: { type: 'object', properties: { scene: num('scene number'), ...SCENE.properties, redraw: bool('draw the picture again even if the visual text did not change') }, required: ['scene'], additionalProperties: false } },
    insert: { type: 'array', items: { type: 'object', properties: { after: num('insert after this scene number (0 = at the start)'), scene: SCENE }, required: ['after', 'scene'], additionalProperties: false } },
    remove: { type: 'array', items: { type: 'number' }, description: 'scene numbers to delete' },
  }),
  tool('find_assets', 'Find pictures or animated emoji to use in scenes (stock illustrations, photos and vectors from Pixabay, Noto animated emoji). Returns keys for s.image / s.lottie.', {
    query: str('what to look for, in English'),
    kind: { type: 'string', enum: ['illustration', 'photo', 'vector', 'emoji'] },
    count: num('how many (1-3)'),
  }, ['query', 'kind']),
  tool('inspect_scene', 'Look at a drawn scene: snapshots of it go to a vision model that says what is really visible and what looks wrong. Use it before changing a scene the user complains about, or to check your own work.', {
    scene: num('scene number'),
    question: str('what to check, e.g. "is the mammoth recognisable?"'),
  }, ['scene']),
  tool('show_card', 'Attach a card to your reply with a "Lihat" button that opens the full details in a side panel: the brief, the whole script, one scene, or the production plan.', {
    kind: { type: 'string', enum: ['brief', 'script', 'scene', 'plan'] },
    scene: num('scene number (for kind scene)'),
    title: str('short card title'),
  }, ['kind']),
  tool('produce', 'Ask the user to approve making what is missing or changed: the narration, the music and the drawings. Shows the cost on a button; nothing runs until they press it.', {
    scenes: { type: 'array', items: { type: 'number' }, description: 'only redraw these scene numbers (omit for everything that needs it)' },
    note: str('one short line for the approval card'),
  }),
];

const voiceList = ELEVENLABS_VOICES.map((v) => `${v.id} ${v.name} (${v.gender === 'male' ? 'pria' : 'wanita'}, ${v.description})`).join('; ');

export function agentSystemPrompt() {
  return `Kamu Motion Director NexoClip: sutradara video pendek animasi gambar yang ngobrol dengan user lewat chat, lalu membuat videonya dengan alat (tools). Balas dalam bahasa user (biasanya Indonesia), singkat, hangat, dan langsung ke inti.

## Cara kerja
1. Pahami kebutuhannya. Kalau brief masih kabur, tanya paling banyak 1-2 hal penting (untuk siapa, tujuan, durasi, nada). Kalau sudah cukup jelas, jangan bertanya: langsung usulkan.
2. Usulkan sendiri jenis video, bentuk visual, gaya gambar, tempo, durasi, suara, dan musik yang cocok dengan brief (update_plan), lalu 3-5 ide yang benar-benar berbeda (propose_ideas). Jelaskan singkat kenapa usulanmu cocok. User boleh mengubah apa saja.
3. Setelah user memilih ide (atau bilang "langsung saja"), tulis naskah (write_script), tentukan tokoh (cast) dan latar (looks) di update_plan, cari aset bila perlu (find_assets), lalu siapkan rencana produksi (produce).
4. Rencana produksi harus bisa direview sebelum apa pun dibuat. Di balasanmu jelaskan dengan jelas dan detail, dalam poin-poin: brief singkat; gaya, tempo, latar, dan tokoh; alur adegan (nomor + intinya); naskah voiceover yang akan dibacakan beserta suara naratornya dan nadanya; musik (suasana, BPM, instrumen) atau tanpa musik; durasi; dan apa yang akan dibuat (suara, musik, adegan mana yang digambar) beserta biayanya. Lalu minta user mereview: mereka bisa mengedit langsung di tab Adegan dan Audio, minta ubah lewat chat, atau menekan tombol Buat. Kartu persetujuan juga menampilkan rencana lengkapnya.
5. Revisi: ubah hanya yang diminta (edit_scenes), lalu produce lagi dan jelaskan apa yang berubah; hanya adegan yang berubah yang digambar ulang.
Jangan menuliskan ulang seluruh naskah di chat (user melihatnya lengkap di tab Adegan); cukup ringkas intinya seperti poin 4.

## Semua jenis video
Motivasi (lembut, keras, lucu), edukasi, sejarah, sains, dongeng, berita, tips, tutorial, review, promosi produk, ucapan, profil bisnis, dan lainnya. Alur menyesuaikan jenisnya:
- motivasi: hook yang kena → situasi nyata yang relatable → sudut pandang baru lewat satu metafora → satu langkah konkret hari ini → penutup yang membekas.
- edukasi/sejarah/sains: pertanyaan atau fakta pembuka → urutan kejadian/penjelasan → fakta kunci → "ternyata..." penutup. Fakta harus benar dan umum diterima; angka dan tahun kira-kira dengan "sekitar"; jangan mengarang.
- dongeng/cerita: tokoh → masalah → usaha → puncak → akhir (pesan).
- tips/tutorial: masalah → langkah 1-2-3 yang konkret → hasil.
- promosi: masalah → produk sebagai jawaban → satu manfaat utama → bukti (hanya yang user berikan) → ajakan yang sesuai janji hook. Jangan mengarang harga, testimoni, atau klaim.

## Naskah
- Narasi seperti orang ngomong langsung, satu cerita yang mengalir; potong per scene di jeda napas (kalimat boleh berlanjut ke scene berikutnya). Jumlah kata per scene sesuai tempo.
- Bahasa sehari-hari yang langsung dipahami siapa saja. Tanpa kata tinggi/serapan (esensi, paradigma, resiliensi, ekspektasi, transformasi, potensi, versi terbaik...), tanpa puitis berbunga, tanpa slogan beruntun, tanpa kata baku kaku ("adalah", "merupakan", "dirimu"). Konkret: jam berapa, pegang apa, ngerasa apa.
- "text" ditulis persis seperti diucapkan: angka, satuan, singkatan dalam kata ("tiga ratus ribu tahun", "lima puluh persen").
- "say" (Eleven v4): kata yang SAMA persis dengan text; boleh menambah audio tag berbahasa Inggris dalam [kurung siku] sebelum bagian yang diwarnai ([excited], [whispers], [sighs], [curious], [warmly], [short pause], atau yang spesifik seperti [low, steady voice]), HURUF KAPITAL untuk satu kata yang ditekan, ... untuk jeda, ! dan ? untuk nada. Paling banyak 1-2 tag per scene, sesuai suara narator. Tanpa <break>. Tag tidak pernah muncul di layar.
- "emphasis" satu kata dari text (persis). "camera": push, pull, pan-left, pan-right, tilt-up, tilt-down, roll, orbit, crash, handheld, shake; scene berurutan tidak sama; crash/shake hanya untuk benturan/kaget sesuai tempo.
- "visual": gambar KONKRET dan geraknya. Sebut benda nyata dengan ciri bentuknya ("motor skuter oranye: dua roda, jok cokelat, lampu bulat"), tokoh dari cast dengan namanya, hewan, ikon, peta, grafik, gelembung chat, harga, tombol, atau key aset yang sudah ditemukan. Satu fokus utama dan paling banyak 2-3 pendukung. Jaga benang merah visual, tapi variasikan benda dan komposisi antar scene supaya tidak satu benda terus.
- "theme": nama look dari plan. Selingi supaya tidak monoton.

## Yang bisa digambar mesin animasi
Bentuk dasar bergaya gambar tangan, manusia (s.person: pose, jalan, lari, lompat, melambai, rambut/kulit/baju, wajah sederhana titik), hewan (anjing, kucing, rubah, kuda, rusa, sapi, domba, beruang, gajah, mammoth, burung, ikan), ±1.700 ikon Lucide, peta dunia/region dengan rute dan label, grafik batang/garis/pie, angka berjalan, gelembung chat, label harga coret, tombol, progress bar, timeline, emoji animasi Noto, dan gambar dari find_assets. Tidak bisa: foto realistis atau wajah realistis yang digambar (pakai find_assets kind photo/illustration untuk itu), teks panjang di dalam gambar.

## Rasio
Tentukan rasio di update_plan.format sesuai tujuan: 9:16 untuk Reels/TikTok/Shorts (bawaan), 16:9 untuk YouTube, 1:1 atau 4:5 untuk feed Instagram. Kalau tidak jelas dan penting, tanya sekali. Mengganti rasio setelah adegan digambar berarti semua adegan digambar ulang (sebut biayanya).

## Gaya, tempo, latar, tokoh
- Gaya (update_plan.style) bebas diracik dari preset ${DRAW_STYLES.map((d) => `${d.id} (${d.hint})`).join(', ')}: look, wobble, hatch, outline, chalk. Contoh: "kapur di dinding gua, warna tanah" untuk sejarah purba; "spidol bersih, outline tebal" untuk promo modern.
- Tempo (update_plan.pace) bebas dari preset ${PACES.map((p) => `${p.id} (${p.hint})`).join(', ')}: kata per scene, transisi, kekuatan kamera, stabilitas narator, nada, cara objek masuk.
- Latar (looks): beberapa latar bernama khusus video ini, warna tidak generik, teks harus terbaca (sheet: true = lembar kertas terang dengan caption di bawah; tanpa sheet = latar penuh, caption putih di pita gelap). Boleh pakai gambar aset sebagai latar (image).
- Cast: tokoh yang muncul lebih dari sekali, dengan opsi s.person/s.animal yang persis (kulit, rambut, gaya rambut, baju, celana, dress), supaya sama di setiap scene.
- Suara narator: ${voiceList}. Pilih yang cocok dengan nada.
- Musik (opsional): prompt bahasa Inggris yang memutuskan genre, suasana, instrumen, BPM, dan era/produksi (istilah studio), nada dasar, aransemen berurutan sesuai alur video, dan diakhiri "instrumental only, no vocals, no lead melody, background bed under a voiceover".

## Kartu dan pemeriksaan
- Pakai show_card untuk menunjukkan detail tanpa memenuhi chat: brief (setelah update_plan), script (setelah write_script), scene (adegan tertentu yang kamu ubah atau bahas), plan (setelah produce). User menekan "Lihat" untuk membuka panel.
- Kalau user bilang sebuah adegan aneh, jelek, atau tidak sesuai, atau sebelum kamu mengubah gambar adegan yang sudah jadi, panggil inspect_scene dulu untuk melihat apa yang sebenarnya tergambar, lalu ubah visualnya (edit_scenes) berdasarkan temuan itu.
- Kamu juga bisa mengganti judul video (update_plan.title).

## Biaya
Ngobrol dan menulis naskah memakai sedikit kredit. Produksi (suara narator, musik, dan gambar animasi tiap adegan) yang paling mahal: kira-kira 15-25 kredit per adegan yang digambar, plus suara dan musik. Produksi baru berjalan setelah user menekan tombol persetujuan dari produce, jadi panggil produce setiap kali naskah atau adegan siap diproduksi.

## SEO
Saat menulis naskah, isi seo: title (kata kunci utama yang benar-benar dicari, di depan, maks 70 karakter), description 3-5 kalimat, 10-15 tags huruf kecil, 3-5 hashtags (tanpa #shorts).`;
}

// What the agent sees of the story at the start of a turn (kept short).
export function storySummary(story) {
  const style = drawStyleOf(story.styleSpec || story.style);
  const pace = paceOf(story.paceSpec || story.pace);
  const lines = [
    `Rasio: ${story.format || '9:16'} | Brief: ${story.brief || '(belum)'} | jenis: ${story.kind || '(belum)'} | gaya: ${style.label} (${style.look}) | tempo: ${pace.label} | suara: ${story.voiceId || '(belum)'} | musik: ${story.music ? 'ya' : 'tidak'}`,
    story.cast?.length ? `Tokoh: ${story.cast.map((c) => `${c.name} = ${c.look}`).join('; ')}` : 'Tokoh: -',
    `Latar: ${Object.keys(story.background || {}).filter((k) => story.background[k]?.top).join(', ') || 'paper, dusk, night (bawaan)'}`,
    Object.keys(story.assets || {}).length ? `Aset: ${Object.entries(story.assets).map(([k, a]) => `${k} (${a.type}: ${a.description})`).join('; ')}` : 'Aset: -',
    story.ideas?.length ? `Ide yang ditawarkan: ${story.ideas.map((i, n) => `${n + 1}. ${i.title}`).join(' | ')}` : '',
    story.scenes?.length
      ? `Naskah "${story.title}" (${story.scenes.length} scene):\n${story.scenes.map((s, i) => `${i + 1}. [${s.theme}, ${s.camera}${s.code ? '' : ', belum digambar'}${s.redraw ? ', akan digambar ulang' : ''}] ${s.text} || visual: ${s.visual}`).join('\n')}`
      : 'Naskah: (belum)',
    story.voice ? `Narasi sudah direkam${story.voiceText !== narrationText(story.scenes, story.paceSpec || story.pace) ? ' (teks berubah, perlu rekam ulang)' : ''}.` : 'Narasi: belum direkam.',
  ];
  return lines.filter(Boolean).join('\n');
}

function cleanScene(raw, themes) {
  const scene = cleanStoryScene({ ...raw, code: '', words: [] });
  if (!themes.includes(scene.theme)) scene.theme = themes[0];
  const target = bare(scene.emphasis);
  if (!words(scene.text).some((w) => bare(w) === target)) {
    scene.emphasis = words(scene.text).reduce((a, b) => (bare(b).length > bare(a).length ? b : a), '').replace(/[^\p{L}\p{N}]/gu, '');
  }
  return scene;
}

const themesOf = (story) => {
  const custom = Object.keys(story.background || {}).filter((k) => story.background[k]?.top || story.background[k]?.image);
  const style = drawStyleOf(story.styleSpec || story.style);
  return style.themes?.length ? style.themes : [...new Set([...custom, 'paper', 'dusk', 'night'])];
};

function varyCameras(scenes) {
  let last = '';
  for (const scene of scenes) {
    if (scene.camera === last) scene.camera = STORY_CAMERAS.filter((c) => c !== last && c !== 'shake' && c !== 'crash')[words(scene.text).length % 6];
    last = scene.camera;
  }
  return scenes;
}

// What still has to be made: { voice, music, draw: [indexes] }.
export function productionNeeds(story, only = null) {
  const text = story.scenes.length ? narrationText(story.scenes, story.paceSpec || story.pace) : '';
  const voice = Boolean(text) && (!story.voice || story.voiceText !== text || (story.voiceFor && story.voiceId && story.voiceFor !== story.voiceId));
  const music = Boolean(story.music) && Boolean(story.scenes.length) && (!story.musicTrack || story.musicFor !== (story.musicPrompt || ''));
  // a new narration can also stretch scenes; those are added after the recording (motionJobs.js)
  const draw = story.scenes.map((s, i) => i).filter((i) => (!only || only.includes(i)) && (!story.scenes[i].code || story.scenes[i].redraw));
  return { voice, music, draw };
}

// Runs the tools of one model step against a working copy of the story. Returns tool messages and side info.
async function runTools(calls, story, deps) {
  const results = [];
  for (const call of calls) {
    let args = {};
    try { args = JSON.parse(call.arguments || '{}'); } catch { /* bad JSON → empty */ }
    let result;
    try {
      result = await TOOL_RUNNERS[call.name]?.(args, story, deps);
      if (result === undefined) result = { error: `unknown tool ${call.name}` };
    } catch (error) {
      result = { error: String(error?.message || error) };
    }
    results.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 6000) });
  }
  return results;
}

const TOOL_RUNNERS = {
  update_plan(a, story) {
    if (typeof a.title === 'string' && a.title.trim()) story.title = a.title.trim().slice(0, 120);
    if (FORMAT_IDS.includes(a.format) && a.format !== story.format) { story.format = a.format; story.scenes.forEach((s) => { s.redraw = true; }); }
    if (typeof a.brief === 'string') story.brief = a.brief.slice(0, 600);
    if (typeof a.kind === 'string') story.kind = a.kind.slice(0, 80);
    if (a.style && typeof a.style === 'object') story.styleSpec = { ...(story.styleSpec || {}), ...a.style };
    if (a.pace && typeof a.pace === 'object') story.paceSpec = { ...(story.paceSpec || {}), ...a.pace };
    if (a.voice_id && ELEVENLABS_VOICES.some((v) => v.id === a.voice_id)) story.voiceId = a.voice_id;
    if (typeof a.music === 'boolean') story.music = a.music;
    if (typeof a.music_prompt === 'string') story.musicPrompt = a.music_prompt.slice(0, 1000);
    if (Number.isFinite(Number(a.scene_count))) story.sceneCount = Math.min(16, Math.max(3, Math.round(Number(a.scene_count))));
    if (Array.isArray(a.cast)) story.cast = a.cast.slice(0, 8).map((c) => ({ name: String(c.name || '').slice(0, 40), look: String(c.look || '').slice(0, 300) })).filter((c) => c.name);
    if (a.looks && typeof a.looks === 'object') story.background = { ...(story.background || {}), ...a.looks };
    if (a.style || a.cast || a.looks) story.scenes.forEach((s) => { s.redraw = true; });
    return { ok: true, plan: storySummary(story).split('\n').slice(0, 3).join(' / ') };
  },
  propose_ideas(a, story, { ideasOut }) {
    const ideas = (a.ideas || []).slice(0, 5).map((i) => ({ title: String(i.title || ''), hook: String(i.hook || ''), angle: String(i.angle || ''), visualStyle: String(i.visualStyle || '') })).filter((i) => i.title);
    story.ideas = ideas;
    ideasOut.push(...ideas);
    return { ok: true, shown: ideas.length };
  },
  write_script(a, story) {
    const themes = themesOf(story);
    const scenes = varyCameras((a.scenes || []).slice(0, 16).map((raw) => ({ ...cleanScene(raw, themes), redraw: true })).filter((s) => s.text.trim()));
    if (scenes.length < 2) return { error: 'a script needs at least 2 scenes' };
    story.scenes = scenes;
    story.title = String(a.title || story.title || '').slice(0, 120);
    if (a.seo) story.seo = a.seo;
    if (typeof a.music_prompt === 'string' && a.music_prompt) story.musicPrompt = a.music_prompt.slice(0, 1000);
    const seconds = Math.round(scenes.reduce((sum, s) => sum + s.duration, 0));
    return { ok: true, scenes: scenes.length, seconds_estimate: seconds };
  },
  edit_scenes(a, story) {
    const themes = themesOf(story);
    const list = story.scenes;
    for (const change of a.changes || []) {
      const i = Math.round(Number(change.scene)) - 1;
      if (!list[i]) continue;
      const before = list[i];
      const next = cleanScene({ ...before, ...Object.fromEntries(Object.entries(change).filter(([k]) => k !== 'scene' && k !== 'redraw')) }, themes);
      next.code = before.code;
      next.words = before.words;
      next.redraw = Boolean(change.redraw || before.redraw || next.visual !== before.visual || next.theme !== before.theme || next.text !== before.text || !before.code);
      list[i] = next;
    }
    const removed = new Set((a.remove || []).map((n) => Math.round(Number(n)) - 1));
    let scenes = list.filter((_, i) => !removed.has(i));
    for (const ins of [...(a.insert || [])].sort((x, y) => Number(y.after) - Number(x.after))) {
      const at = Math.min(scenes.length, Math.max(0, Math.round(Number(ins.after))));
      scenes.splice(at, 0, { ...cleanScene(ins.scene || {}, themes), redraw: true });
    }
    story.scenes = varyCameras(scenes);
    return { ok: true, scenes: story.scenes.length };
  },
  async find_assets(a, story, { findAssets }) {
    if (!findAssets) return { error: 'asset search is not available' };
    const found = await findAssets({ query: a.query, kind: a.kind, count: Math.min(3, Math.max(1, Number(a.count) || 2)), taken: story.assets || {} });
    story.assets = { ...(story.assets || {}), ...found };
    const keys = Object.entries(found).map(([key, x]) => ({ key, type: x.type, description: x.description }));
    return keys.length ? { ok: true, assets: keys } : { ok: false, message: 'nothing found; try other words or draw it' };
  },
  async inspect_scene(a, story, { inspect, extra }) {
    if (!inspect) return { error: 'inspecting is not available' };
    const i = Math.round(Number(a.scene)) - 1;
    if (!story.scenes[i]) return { error: 'no such scene' };
    const seen = await inspect({ story, index: i, question: String(a.question || '') });
    if (seen.usage) extra.push(seen.usage);
    return { scene: i + 1, seen: seen.text };
  },
  show_card(a, story, { cardsOut }) {
    const card = { kind: ['brief', 'script', 'scene', 'plan'].includes(a.kind) ? a.kind : 'brief', title: String(a.title || '').slice(0, 80) };
    if (card.kind === 'scene') {
      const i = Math.round(Number(a.scene)) - 1;
      if (!story.scenes[i]) return { error: 'no such scene' };
      card.scene = i;
    }
    cardsOut.push(card);
    return { ok: true };
  },
  async produce(a, story, { estimate }) {
    if (!story.scenes.length) return { error: 'write the script first' };
    const only = Array.isArray(a.scenes) && a.scenes.length ? a.scenes.map((n) => Math.round(Number(n)) - 1).filter((i) => story.scenes[i]) : null;
    if (only) only.forEach((i) => { story.scenes[i].redraw = true; });
    const needs = productionNeeds(story, null);
    const what = [needs.voice && 'voice', needs.music && 'music', needs.draw.length && 'draw'].filter(Boolean);
    if (!what.length) return { ok: true, message: 'everything is already made' };
    const { credits, breakdown } = await estimate({ story, needs });
    story.pending = { what, scenes: needs.draw, credits, breakdown, note: String(a.note || '').slice(0, 300) };
    return { ok: true, waiting_for_user: true, credits, breakdown, voice: needs.voice, music: needs.music, scenes_to_draw: needs.draw.map((i) => i + 1) };
  },
};

// One user message: the model works with the tools until it answers. Returns { story, reply, ideas, usages }.
// `onText(soFar)` streams the reply as it is written; `inspect` is the vision check (motionInspect.js).
export async function runAgentTurn({ story, message, call = callStoryModel, findAssets = null, inspect = null, estimate = async () => 0, onStep = async () => {}, onText = null }) {
  const working = JSON.parse(JSON.stringify(story));
  working.pending = null;
  const history = (story.chat || []).slice(-16).map((m) => ({ role: m.role, content: m.content || '' })).filter((m) => m.content);
  const messages = [
    ...history,
    { role: 'user', content: `[Keadaan video sekarang]\n${storySummary(working)}\n\n[Pesan user]\n${message}` },
  ];
  const usages = [];
  const ideas = [];
  const cards = [];
  const extra = []; // usages of tools that call other models (inspect_scene)
  let reply = '';
  for (let step = 0; step < MAX_STEPS; step += 1) {
    const answer = await call({ system: agentSystemPrompt(), messages, tools: AGENT_TOOLS, maxTokens: 24000, ...(onText ? { onText } : {}) });
    usages.push(answer.usage);
    if (!answer.toolCalls.length) { reply = answer.text.trim(); break; }
    messages.push(answer.message);
    await onStep(answer.toolCalls.map((c) => c.name));
    messages.push(...await runTools(answer.toolCalls, working, { findAssets, estimate, inspect, ideasOut: ideas, cardsOut: cards, extra }));
    if (step === MAX_STEPS - 1) reply = answer.text.trim() || 'Sudah aku siapkan. Cek panel adegan, lalu bilang kalau mau diubah.';
  }
  return { story: working, reply, ideas, cards, usages, extra };
}
