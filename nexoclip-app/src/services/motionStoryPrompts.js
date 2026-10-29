// The prompts of a drawn story (motionStory.js): ideas, then the script, then the drawing code of each scene.
// Each returns { system, user }; the system part stays the same between calls so the provider can cache it.
import { DRAW_STYLES, PACES, drawStyleOf, paceOf } from '../../components/motion/draw/story.js';
import { PATTERNS } from '../../components/motion/draw/backdrop.js';
import { SFX_NAMES } from '../../components/motion/draw/sfxLibrary.js';
import { layoutOf } from '../../components/motion/draw/layout.js';

// Ingredients handed to the five ideas so they never look alike: a metaphor lens, a kind of hook, a voice.
export const METAPHOR_LENSES = [
  'catur & strategi', 'pasar & tawar-menawar', 'es batu & suhu', 'cuaca & badai', 'balon udara', 'dapur & resep',
  'baterai HP & charger', 'peta & GPS', 'kebun & musim', 'lampu lalu lintas', 'koper & bagasi', 'tali sepatu',
  'jam pasir', 'kunci & gembok', 'kamera & fokus', 'kereta & stasiun', 'lift & tangga darurat', 'magnet',
  'layangan & angin', 'tabungan & celengan', 'sinyal Wi-Fi', 'panci presto', 'kompas', 'jembatan', 'roket & bahan bakar',
  'kipas angin', 'payung', 'remote TV', 'puzzle', 'lilin', 'mesin cuci', 'sepeda & rantai', 'bola salju', 'kapal & jangkar',
  'antrean', 'resleting', 'pensil & penghapus', 'lampu senter', 'botol & tutup', 'karet gelang',
];
export const HOOK_KINDS = [
  'mitos populer yang dipatahkan', 'perintah singkat 1-3 kata', 'skenario "bayangkan kalau..."',
  'angka atau fakta yang mengejutkan', 'percakapan imajiner dengan diri sendiri', 'pertanyaan yang menohok',
  'pengakuan jujur ("jujur, aku dulu...")', 'kebalikan dari nasihat umum',
];

function pick(list, count, random) {
  const pool = [...list];
  const out = [];
  while (out.length < count && pool.length) out.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  return out;
}

export function ideaIngredients(pace, random = Math.random) {
  const lenses = pick(METAPHOR_LENSES, 5, random);
  const hooks = pick(HOOK_KINDS, 5, random);
  return lenses.map((lens, i) => ({ lens, hook: hooks[i % hooks.length] }));
}

const PLAIN_LANGUAGE = `Bahasa: Indonesia sehari-hari yang langsung dipahami sekali dengar oleh siapa saja, dari anak SMP sampai orang tua.
- Pakai kata obrolan biasa. Jangan pakai kata tinggi atau serapan: esensi, eksistensi, paradigma, manifestasi, resiliensi, validasi, ekspektasi, transformasi, signifikan, fundamental, kontemplasi, hakikat, entitas, persepsi, narasi, fase, momentum, versi terbaik, potensi, makna hidup. Ganti dengan kata biasa ("ekspektasi" jadi "harapan", "konsisten" jadi "terus-terusan").
- Jangan puitis atau berbunga-bunga ("jiwa yang lelah", "langkah kecil menuju cahaya"). Katakan maksudnya langsung.
- Satu kalimat satu maksud, susunan biasa (subjek, kata kerja, objek). Tidak ada kiasan di dalam kiasan.
- Metafora boleh, asal bendanya sehari-hari dan artinya langsung dijelaskan.`;

const lookOf = (styleId) => drawStyleOf(styleId).look;

// Step 1: five ideas for a topic.
export function ideasPrompt({ topic, pace: paceId, style: styleId, note, ingredients, seconds }) {
  const pace = paceOf(paceId);
  const system = `Kamu penulis konten video pendek berbahasa Indonesia (TikTok, Reels, Shorts) yang idenya selalu segar dan tidak pasaran.
Videonya berupa ${lookOf(styleId)}, dengan teks narasi yang muncul seperti mesin ketik dan suara narator.

Setiap ide:
- Punya satu pesan jelas yang bisa digambar lewat satu metafora benda nyata yang mudah dikenali.
- "visualStyle" ditulis dengan rumus: gaya gambar + cahaya/suasana + palet warna + komposisi/kamera + metafora utama. Contoh: "spidol bersih, cahaya pagi lembut, mint dan peach, sudut atas 45 derajat, rak buku yang tersusun".
- Hook harus bikin orang berhenti scroll di detik pertama. Bukan klise kosong.
- Hindari metafora dan kalimat pasaran: tangga kesuksesan, tetesan air melubangi batu, kepompong jadi kupu-kupu, pohon dari biji kecil, gunung es, "proses tidak mengkhianati hasil", "1% setiap hari". Kalau memakai benda umum, cari sudut yang tak terduga.
- Kelima ide berbeda jelas: beda pesan, beda metafora, beda jenis hook.

${PLAIN_LANGUAGE}

Jawab HANYA dengan satu blok kode \`\`\`json berisi {"ideas": [{"title": "judul singkat", "hook": "kalimat pembuka", "angle": "pesan inti 1-2 kalimat", "visualStyle": "..."}]}, tanpa penjelasan lain. Di dalam teks JSON jangan pakai tanda kutip ganda; untuk dialog atau kutipan pakai kutip tunggal ('...').`;
  const user = `Buat 5 ide video pendek, kira-kira ${seconds} detik.
Topik: ${topic}
Nuansa video: ${pace.label.toLowerCase()} (${pace.hint.toLowerCase()}); nada narasi ${pace.tone}.${note ? `\nCatatan dari kreator: ${note}` : ''}

Bahan wajib per ide (ide ke-n memakai baris ke-n; boleh ditafsirkan kreatif, tapi jangan diganti):
${ingredients.map((item, i) => `${i + 1}. lensa metafora "${item.lens}" · hook berupa ${item.hook}`).join('\n')}`;
  return { system, user };
}

// Step 2: the chosen idea as a scene-by-scene script, plus the backgrounds and YouTube metadata.
export function scriptPrompt({ idea, pace: paceId, style: styleId, sceneCount, note }) {
  const pace = paceOf(paceId);
  const style = drawStyleOf(styleId);
  const themes = style.themes?.length ? style.themes : ['paper', 'dusk', 'night'];
  const cameras = pace.hardCamerasPerScene > 0
    ? `Pakai "shake" atau "crash" untuk momen benturan, kaget, gagal, atau ledakan, paling banyak sekitar ${Math.round(pace.hardCamerasPerScene * 100)}% dari scene.`
    : 'Jangan pakai "shake" dan "crash": video ini tenang.';
  const system = `Kamu penulis naskah video pendek berbahasa Indonesia. Visualnya ${style.look}; teks narasi muncul seperti mesin ketik dan dibacakan narator.
Nuansa video: ${pace.label.toLowerCase()} (${pace.hint.toLowerCase()}). Nada narasi: ${pace.tone}.

Ubah ide yang dipilih menjadi narasi scene per scene.

## Narasi (paling penting)
Tulis seperti orang yang ngomong langsung ke temannya, bukan poster kata mutiara. Kalau seluruh narasi dibaca sekali jalan tanpa melihat layar, harus terdengar seperti satu cerita utuh yang mengalir.
- Susun dulu satu monolog utuh di kepala, lalu potong per scene di jeda napas yang wajar. Satu kalimat boleh berlanjut ke scene berikutnya.
- Panjang teks per scene ${pace.words[0]}-${pace.words[1]} kata, kalimatnya tetap jelas. Satu kata saja ("Sekarang.") paling banyak 1-2 kali per video.
- Bahasa lisan anak muda yang natural: boleh "kamu", "gak", "udah", "aja", "kok", "sih", "tuh", "kan", "ya", "jujur", "padahal". Pakai kata sambung (karena, tapi, padahal, terus, makanya, jadi) supaya antar scene nyambung.
- Konkret, bukan abstrak. Ganti kata besar ("kesuksesan", "zona nyaman") dengan situasi nyata: jam berapa, lagi ngapain, pegang apa, ngerasa apa.
- Satu benang merah: metafora dari ide dipakai dari awal sampai akhir dan dijelaskan, bukan disebut sekilas lalu ditinggal.
- Jangan: deretan slogan tanpa hubungan, perintah beruntun ("Bangkit! Lawan! Gas!"), kalimat ala terjemahan, kata baku kaku ("adalah", "merupakan", "oleh karena itu", "dirimu"), atau quote klise.
- Alur: hook yang langsung kena, situasi nyata yang relatable, sudut pandang baru lewat metafora, satu langkah konkret yang bisa dilakukan hari ini, penutup yang membekas.

${PLAIN_LANGUAGE}

Rasa bahasa (jangan dipakai mentah): kaku "Berhenti menunda." / "Raih mimpimu."; natural "Kamu bilang besok aja," / "padahal kemarin juga bilang gitu." / "Masalahnya bukan kamu malas," / "tapi langkah pertamanya kegedean."

## Field per scene
- "text": teks narasi scene ini, persis seperti tampil di layar. Angka, satuan, dan singkatan ditulis seperti diucapkan ("tiga ratus ribu tahun", "lima puluh persen", "kilometer"), karena narator membaca teks yang sama.
- "say": versi yang dibacakan narator (Eleven v4). KATANYA HARUS SAMA PERSIS dengan "text"; yang boleh ditambah hanya:
  - audio tag dalam kurung siku, ditulis dalam bahasa Inggris dan menggambarkan suara, ditaruh tepat sebelum bagian yang diubah: [excited], [whispers], [sighs], [laughs], [curious], [sarcastic], [determined], [warmly], [short pause], [long pause], atau yang lebih spesifik seperti [quietly, with controlled fear] atau [voice rising into firm resolve]. Jangan tag gerakan atau musik ([standing], [music]).
  - HURUF KAPITAL untuk satu kata yang ditekan, titik-titik (...) untuk jeda atau ragu, tanda seru atau tanya untuk nada.
  - Jangan tag SSML (<break>). Jangan menambah, mengganti, atau membuang kata.
  - Pakai tag secukupnya dan selaras dengan nuansa video: paling banyak satu atau dua per scene, tidak di setiap scene. Di awal video tentukan nada lewat satu tag pembuka bila perlu.
- "visual": ilustrasi KONKRET dan gerakannya untuk kanvas video. Sebut benda nyata secara spesifik beserta ciri bentuknya (mis. "motor skuter oranye: dua roda, jok cokelat, stang, lampu depan bulat"), karena objek dirakit dari bentuk dasar dan harus langsung dikenali. Jangan ganti dengan bentuk abstrak atau sebagian saja. Hindari manusia detail; pakai benda dan metafora. TANPA WAJAH: tidak ada mata, hidung, atau mulut pada apa pun. Satu objek utama dan paling banyak 2-3 objek pendukung. Benda utama metafora boleh muncul lagi di scene lain dengan ciri yang sama.
- "theme": ${themes.map((t) => `"${t}"`).join(', ')}${themes.length > 1 ? ' ("paper" = latar terang krem, "dusk" = langit senja, "night" = biru malam untuk momen sunyi atau merenung). Selingi supaya tidak monoton' : ''}.
- "duration": ${pace.sceneSeconds[0]}-${pace.sceneSeconds[1]} detik (kira-kira 1 detik + 0.3 detik per kata). Nanti disesuaikan dengan suara narator.
- "emphasis": SATU kata terpenting dari "text", ditulis persis seperti di teks. Kamera menghentak saat kata ini diucapkan.
- "camera": push (mendekat, fokus), pull (mundur, reveal), pan-left (perjalanan, waktu), pan-right (maju, progres), tilt-up (harapan, bangkit), tilt-down (jatuh, beban), roll (bingung, overthinking), orbit (ragu, menimbang), crash (kejutan), handheld (jujur, curhat), shake (benturan, gagal, panik). Scene berurutan tidak memakai gerakan yang sama. ${cameras}

## Latar ("background")
Tiga versi latar khusus video ini (jangan warna generik), selaras dengan gaya dan suasana pesan: "paper" versi terang (teks gelap terbaca), "dusk" versi berwarna, "night" versi gelap (teks terang terbaca). Masing-masing "top" dan "bottom" (hex, membentuk gradasi) dan "pattern" salah satu: ${PATTERNS.join(', ')}.

## Musik latar ("music")
Satu prompt musik (bahasa Inggris) untuk ElevenLabs Music yang mengalun di bawah narasi selama seluruh video. Putuskan kelimanya, jangan dibiarkan terbuka: genre, suasana, instrumen, BPM, dan era/produksi (pakai istilah studio: sidechained, close-mic'd, tape saturation, plate reverb, vinyl crackle). Sebut nada dasar (mis. "in A minor"). Ceritakan aransemennya berurutan sesuai alur video, dengan detik kira-kira dari durasi scene: mulai dari apa, kapan masuk yang lain, kapan memuncak, bagaimana menutup ("start with just ..., bring in ... at 10 seconds, ..."). Akhiri dengan "instrumental only, no vocals, no lead melody, background bed under a voiceover". Selaras dengan nuansa ${pace.label.toLowerCase()}.

## SEO YouTube ("seo")
- Tentukan dulu satu kata kunci utama 2-4 kata yang benar-benar diketik orang di kolom cari YouTube.
- "title": maksimal 70 karakter, kata kunci utama di awal, lalu alasan jujur untuk mengklik. Tanpa huruf kapital semua, tanpa hashtag, emoji paling banyak 1.
- "description": 3-5 kalimat. Kalimat pertama memuat kata kunci utama dan apa yang didapat penonton. Lalu ringkasan dengan 2-3 kata kunci turunan secara alami, dan ajakan (simpan, bagikan, follow). Jangan menyalin narasi.
- "tags": 10-15 kata kunci huruf kecil tanpa "#" (utama, variasi, long-tail, 2-3 topik umum), total di bawah 400 karakter.
- "hashtags": 3-5 hashtag dari yang paling spesifik ke umum. "#shorts" ditambahkan otomatis.

Jawab HANYA dengan satu blok kode \`\`\`json: {"title": "...", "music": "...", "seo": {"title": "...", "description": "...", "tags": [], "hashtags": []}, "background": {"paper": {"top": "#hex", "bottom": "#hex", "pattern": "..."}, "dusk": {...}, "night": {...}}, "scenes": [{"text": "...", "say": "...", "visual": "...", "theme": "...", "duration": 2.4, "emphasis": "...", "camera": "..."}]}. Tanpa penjelasan lain. Di dalam teks JSON jangan pakai tanda kutip ganda; untuk dialog atau kutipan pakai kutip tunggal ('...').`;
  const user = `## Ide terpilih
- Judul: ${idea.title}
- Hook: ${idea.hook}
- Pesan: ${idea.angle}
- Gaya visual: ${idea.visualStyle}

Tulis narasi sebanyak ${sceneCount} scene.${note ? `\nCatatan dari kreator: ${note}` : ''}`;
  return { system, user };
}

// Step 3: the drawing code of a group of scenes. `scenes` carry their final duration and spoken word times.
// `cast` [{ name, look }] and `assets` ({ key: { type, description } }) go in the user part, so the system part
// (the contract) stays the same for every group and is cached.
// The canvas sentence for a format: size, picture area, ground, centre, and where the caption is.
function canvasRules(format) {
  const L = layoutOf(format);
  const [x0, y0, x1, y1] = L.art;
  const shape = L.w > L.h ? 'mendatar' : L.w === L.h ? 'persegi' : 'tegak';
  return `${L.w} x ${L.h} (${format}, ${shape}), origin kiri atas. Area ilustrasi x ${x0}-${x1}, y ${y0}-${y1}, pusat kira-kira (${L.center[0]}, ${L.center[1]}). Garis tanah standar y = ${L.ground}. JANGAN menggambar di bawah y = ${L.captionTop - 10} (area teks narasi). Nilai ini juga ada di kode: \`s.W\`, \`s.H\`, \`s.art\` [x0, y0, x1, y1], \`s.cx\`, \`s.cy\`, \`s.groundY\`.${shape === 'mendatar' ? ' Kanvas lebar: manfaatkan kiri-kanan (objek utama di satu sisi, pendukung di sisi lain, gerak menyamping).' : ''}`;
}

export function animatePrompt({ scenes, numbers, before, pace: paceId, style: styleId, cast = [], assets = {}, format = '9:16' }) {
  const pace = paceOf(paceId);
  const style = drawStyleOf(styleId);
  const system = `Kamu animator motion graphics yang menulis kode JavaScript untuk menggambar satu scene animasi di HTML Canvas, gaya ${style.look}.

## Kontrak
Tulis HANYA isi body fungsi \`function (s, ctx) { ... }\`. Fungsi ini dipanggil setiap frame (30fps) dan tidak boleh menyimpan state antar frame: semua posisi dihitung dari waktu \`s.t\`. Jangan pakai Math.random() (pakai \`s.rand(i)\`), jangan akses window, document, fetch, atau jaringan apa pun, jangan pakai loop tak terbatas, eval, Function, atau import. Latar, teks narasi, transisi, gerakan kamera, dan suara narator sudah diurus engine; jangan digambar.

## Kanvas
${canvasRules(format)}

## Waktu dan easing
- \`s.t\` detik sejak scene mulai, \`s.dur\` durasi scene, \`s.p\` progres 0..1.
- \`s.at(start, len = 0.6)\` 0..1 dengan ease-out, mulai di detik start selama len detik.
- \`s.pop(start, len = 0.5)\` 0..~1.1..1, membal; cocok untuk scale saat objek muncul.
- \`s.ease.out(x)\`, \`s.ease.in(x)\`, \`s.ease.inOut(x)\`, \`s.ease.back(x)\`, \`s.ease.elastic(x)\`, \`s.ease.linear(x)\`.
- \`s.lerp(a, b, k)\`, \`s.clamp(x, a, b)\`, \`s.wave(freq = 1, amp = 1, phase = 0)\` sinus berbasis waktu (freq dalam Hz), \`s.rand(i)\` 0..1 deterministik.

## Menggambar
Opsi \`o\` (opsional): \`{ fill, stroke, width, alpha, draw, wobble, hatch, pen }\`. fill = warna isian; stroke = warna outline (default tinta, "none" tanpa outline); width default 3; alpha 0..1; draw 0..1 menggambar outline progresif (isian ikut muncul); wobble goyangan garis (default 1); hatch tekstur isian (default sesuai gaya); pen: true = titik cahaya di ujung garis selama draw < 1.
- \`s.line(x1, y1, x2, y2, o)\`, \`s.polyline([[x, y], ...], o)\`, \`s.shape([[x, y], ...], o)\` (poligon tertutup), \`s.curve([[x, y], ...], o)\` kurva halus (\`o.closed = true\` untuk tertutup)
- \`s.rect(x, y, w, h, o)\` (\`o.r\` radius sudut), \`s.circle(cx, cy, r, o)\`, \`s.ellipse(cx, cy, rx, ry, o)\`, \`s.arc(cx, cy, r, a0, a1, o)\`
- \`s.text(str, x, y, o)\` tulisan tangan, tengahnya di (x, y) (\`o.size\`, \`o.color\`, \`o.align\` default "center"); \`s.text3d(str, x, y, o)\` huruf tebal berbayang; \`s.tag(str, x, y, o)\` label bulat (\`o.fill\`)
- \`s.check(x, y, size, o)\`, \`s.cross(x, y, size, o)\`, \`s.dash(x1, y1, x2, y2, o)\`
- \`s.sparkle(x, y, size, o)\`, \`s.rays(cx, cy, r1, r2, count, o)\`, \`s.burst(x, y, r, { draw, count, stroke })\`
- \`s.burst\` = ledakan garis energi sekilas: tak terlihat sebelum draw naik dari 0, memancar, lalu hilang saat draw = 1. Pasang tepat di momen objek mendarat atau meledak, mis. \`draw: s.at(0.9, 0.4)\`.
- \`s.rays\` tampil penuh sejak awal kalau tanpa draw/alpha; munculkan bersama objeknya (\`draw: s.at(t0, 0.4)\`). Efek tidak boleh muncul lebih dulu dari objeknya.
- \`s.ground(y = s.groundY, x1, x2, o)\`
- \`s.group({ x, y, rotate, scale, alpha }, () => { ... })\` transformasi relatif (koordinat lokal).
- SEMUA sudut dalam RADIAN: 0.1 ≈ 6°, Math.PI = 180°. Miring kecil \`rotate: -0.08\`, goyang halus \`rotate: s.wave(2, 0.06)\`. Jangan menulis \`rotate: -8\` atau \`* 360\`.
- Palet \`s.c\`: ink, paper, red, pink, orange, yellow, green, teal, blue, navy, purple, brown, sky, white, gray. Boleh hex. \`s.theme\` = "paper" | "dusk" | "night"; di tema gelap \`s.c.ink\` otomatis terang. \`ctx\` = CanvasRenderingContext2D mentah (untuk gradient atau glow; bungkus dengan ctx.save()/ctx.restore()).

## Efek suara
\`s.sfx(name, time, gain = 1, pitch)\` menjadwalkan suara di detik \`time\` scene ini. WAJIB dipanggil di level atas kode (tidak di dalam if atau kondisi waktu). pitch opsional (0.5 lebih rendah untuk benda berat, 1.5-2 untuk benda kecil).
Pilih suara yang cocok dengan bendanya (riser dan reverse-cymbal dijadwalkan ±0.9 detik sebelum puncak): ${SFX_NAMES.filter((n) => !['transition', 'scene-boom', 'word-tick'].includes(n)).join(', ')}.
Whoosh transisi, boom di awal scene, dan tick saat kata muncul sudah otomatis; jangan ditambahkan di detik 0. Pakai 1-4 efek per scene, selaras dengan gerakan.

## Arahan gerak (nuansa: ${pace.label.toLowerCase()})
- Komposisi bersih, objek utama besar (lebar 200-420px), banyak ruang kosong.
- Frame pertama TIDAK boleh kosong: latar suasana dan objek utama (atau sebagiannya) sudah terlihat di detik 0.0-0.2, lalu bergerak masuk atau berubah. Jangan menunggu kata pertama untuk memunculkan sesuatu.
- Ritme: ${pace.entrance}.
- Sebar gerakan di sepanjang durasi, jangan habis di awal. Taruh aksen (pop, burst, centang, perubahan) tepat saat kata pentingnya diucapkan (lihat "Waktu kata diucapkan").
- Tidak boleh ada momen diam: selalu ada rotasi, bounce, pulsa, atau getar halus. Klimaks di sekitar 55-80% durasi. Semua animasi masuk selesai sebelum \`s.dur - 0.25\`.

## Manusia dan hewan (siap pakai, jangan digambar dari nol)
- \`s.person(x, y, size = 260, o)\`: (x, y) titik di antara kaki, size tinggi berdiri. o: \`pose\` stand|sit|crouch|point|wave|cheer|think|carry|push|fall, atau \`action\` walk|run|jump|wave|clap (bergerak sendiri; \`speed\`, \`phase\`), \`facing\` 1 (kanan) / -1 (kiri), \`skin\` light|tan|brown|dark|deep atau hex, \`hair\` black|brown|blond|red|gray|white atau hex, \`hairStyle\` short|long|bun|curly|bald|cap, \`shirt\`, \`pants\`, \`shoes\`, \`dress: true\`, \`mood\` happy|sad|surprised|neutral, \`face: 'none'\` untuk tanpa wajah, \`holding: () => { ... }\` benda di tangan depan (koordinat lokal di tangan), \`joints\` [hipL, kneeL, hipR, kneeR, shoulderL, elbowL, shoulderR, elbowR, lean] (radian, 0 = lurus ke bawah, positif = ke depan) untuk pose khusus. Pindahkan orang dengan mengubah x/y dari waktu.
- \`s.animal(kind, x, y, size = 1, o)\`: kind dog|cat|fox|horse|deer|cow|sheep|bear|elephant|mammoth; o: \`action\` walk|run, \`facing\`, \`color\`, \`face: 'none'\`. \`s.bird(x, y, size, o)\` (terbang mengepak, \`perched: true\` hinggap), \`s.fish(x, y, size, o)\`.
- Wajah HANYA lewat alat ini (mata titik dan mulut sederhana). Jangan menggambar wajah sendiri, wajah realistis, atau emoji wajah. Tokoh yang sama di beberapa scene: pakai opsi yang sama persis (lihat daftar tokoh).

## Bahan siap pakai
- \`s.icon(name, x, y, size = 96, o)\`: ikon Lucide (nama kebab-case, mis. flame, heart, rocket, star, sun, moon, cloud-rain, house, car, bike, plane, phone, laptop, book-open, graduation-cap, brain, lightbulb, clock, calendar, map-pin, globe, wallet, shopping-cart, gift, trophy, medal, target, check, x, thumbs-up, users, user, baby, dog, cat, fish, tree-pine, mountain, leaf, flower, apple, coffee, pizza, music, camera, mic, wifi, battery, lock, key, shield, flag, rocket, zap, sparkles, gem, crown). o: \`fill\`, \`stroke\`, \`width\`, \`draw\`, \`rotate\`, \`alpha\`. Nama yang tidak ada akan ditolak.
- \`s.image(key, x, y, w, h, o)\` gambar dan \`s.lottie(key, x, y, size, o)\` animasi: HANYA key dari daftar aset tersedia (lihat tugas). o image: \`fit\` cover|contain, \`radius\`, \`rotate\`, \`alpha\`, \`frame: false\`. o lottie: \`start\`, \`speed\`, \`loop: false\`, \`alpha\`.
- \`s.map(o)\` peta (mengembalikan \`{ at(lon, lat) }\` untuk menaruh benda di atasnya): \`region\` world|africa|europe|asia|southeast-asia|indonesia|americas|north-america|south-america|oceania|middle-east atau [lonBarat, latUtara, lonTimur, latSelatan], \`x, y, w, h\`, \`land\`, \`sea\`, \`highlight\` { kode ISO2: warna }, \`draw\`, \`labels\` [{ at: ISO2 atau [lon, lat], text, dx, dy }], \`route\` [[lon, lat], ...] dengan \`routeDraw\` 0..1, \`dots\` [{ at, r, color }].
- Infografik dan promo: \`s.chart({ type: 'bar'|'line'|'pie', x, y, w, h, data: [{ label, value, color }], draw })\`, \`s.counter(from, to, x, y, { start, len, prefix, suffix, size, decimals })\`, \`s.bubble(text, x, y, { side: 'left'|'right', w, draw })\` (gelembung chat), \`s.button(text, x, y, { fill, size, pulse })\`, \`s.price(lama, baru, x, y, { start, size, currency })\`, \`s.progress(x, y, w, nilai0..1, { fill, label })\`, \`s.timeline([{ label, text }], x, y, w, { draw })\`.
- Gambar sendiri dengan bentuk dasar untuk semua yang tidak ada di sini.

## Objek harus langsung dikenali
- Gambar benda yang disebut sebagai benda itu sendiri, bukan bola atau kotak polos, bukan cuma sebagiannya.
- Rakit dari 5-15 bentuk dasar sesuai bagian khasnya (roda, badan, jok, stang, lampu; layar, tombol, kamera), dari sudut yang paling mudah dikenali (biasanya samping atau 3/4).
- Bungkus semua bagian satu objek dalam \`s.group\` supaya bergerak bersama.
- Kalau benda atau tokoh yang sama muncul di beberapa scene, gambar dengan bentuk, warna, dan opsi yang sama.
- Kode rapi, paling banyak sekitar 160 baris per scene.

## Bebas berkreasi
- Kamu art director sekaligus animator: ganti komposisi antar scene (close-up besar, wide, dari atas, objek terpotong tepi layar), skala, dan arah gerak.
- Bangun kedalaman: lapisan depan, tengah, belakang, bayangan, parallax kecil, partikel, cahaya.
- Gerak yang punya rasa: antisipasi, overshoot lalu menetap, gerakan saling menyusul, elemen yang tetap hidup pelan setelah masuk.

## Contoh (kalender dicentang)
\`\`\`js
const cx = s.cx;
s.ground();
const k = s.pop(0, 0.6);
s.group({ x: cx, y: s.cy, scale: k }, () => {
  s.rect(-190, -170, 380, 330, { fill: s.c.white, r: 10 });
  s.rect(-190, -170, 380, 70, { fill: s.c.red, r: 10 });
  s.text("kebiasaan", 0, -135, { size: 30, color: s.c.white });
  for (let i = 0; i < 14; i++) {
    const x = -170 + (i % 7) * 50, y = -80 + Math.floor(i / 7) * 55;
    const a = s.at(0.6 + i * 0.12, 0.3);
    if (a <= 0) continue;
    s.rect(x, y, 42, 42, { fill: [s.c.yellow, s.c.green, s.c.sky][i % 3], alpha: a, r: 4 });
    s.check(x + 21, y + 22, 26, { draw: s.at(0.75 + i * 0.12, 0.25) });
  }
});
s.sfx("click", 0.8, 0.6);
\`\`\`

## Format jawaban
Tulis semua scene dalam SATU blok kode \`\`\`js. Awali kode tiap scene dengan baris penanda persis "// ===== SCENE n =====" memakai nomor scene yang diminta. Tanpa penjelasan di luar blok kode.`;
  const castLines = (cast || []).map((c) => `- ${c.name}: ${c.look}`).join('\n');
  const assetLines = Object.entries(assets || {}).map(([key, a]) => `- "${key}" (${a.type === 'lottie' ? 's.lottie' : 's.image'}): ${a.description || ''}`).join('\n');
  const user = `${castLines ? `Daftar tokoh (gambar selalu sama di setiap scene):\n${castLines}\n\n` : ''}Aset tersedia: ${assetLines ? `\n${assetLines}` : 'tidak ada (jangan pakai s.image / s.lottie)'}

Tulis kode animasi untuk ${numbers.length} scene berikut. Tiap scene berdiri sendiri (kodenya hanya bisa melihat \`s\` dan \`ctx\`). Variasikan gerakan dan komposisi antar scene.${before ? `\nScene sebelum kelompok ini: ${before} (jaga kesinambungan, jangan diulang persis).` : ''}

${scenes.map((scene, i) => `### SCENE ${numbers[i]}
- Teks narasi: "${scene.text}"
- Visual: ${scene.visual}
- Tema latar: ${scene.theme}
- Durasi: ${scene.duration} detik (gerakan harus mengisi seluruh durasi ini)
- Waktu kata diucapkan (detik dari awal scene): ${(scene.words || []).map((w) => `${w.w} ${w.s}`).join(' · ') || '-'}`).join('\n\n')}`;
  return { system, user };
}

// One more try for scenes whose code failed the check.
export function repairPrompt({ broken }) {
  return `Kode scene berikut gagal dijalankan. Perbaiki supaya jalan tanpa error, tetap mengikuti kontrak, dan pertahankan idenya.

${broken.map((item) => `// ===== SCENE ${item.number} =====\n// Error: ${item.error}\n${item.code}`).join('\n\n')}

Jawab dengan SATU blok kode \`\`\`js berisi kode yang sudah diperbaiki, tiap scene diawali penanda "// ===== SCENE n =====" yang sama.`;
}

export const STORY_PACES = PACES.map((pace) => pace.id);
export const STORY_STYLES = DRAW_STYLES.map((style) => style.id);
