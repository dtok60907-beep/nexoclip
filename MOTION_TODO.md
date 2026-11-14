# Motion TODO

Arah (2026-10-29): Motion jadi **AI chat seperti AI Director**. User cerita bebas, AI yang mengusulkan dan
meracik semuanya (jenis video, bentuk visual, gaya, tempo, durasi, suara, musik, aset), lalu membuat dan
merevisi per adegan. Tidak ada pilihan yang dikunci. Referensi kualitas: MOTION_FLOW_REFERENCE.md.

Sudah ada di lokal (belum di-commit): mesin gambar (components/motion/draw), alur 4 langkah
(src/services/motionStory*.js), player sandbox (/motion-player), perbaikan JSON repair. Tes betulan
"Lihat Kakimu": jalan, ±$1 per video 10 scene (Sonnet $0,71 + suara + musik).

## Status 2026-10-29 (lokal, BELUM di-push)
- [x] Engine: s.person/animal/bird/fish, s.icon (1.699 Lucide), s.map (Natural Earth), s.chart/counter/bubble/button/price/progress/timeline, s.image/s.lottie (aset), latar bebas (looks), gaya & tempo bebas. Titik hijau (s.glow) dibuang.
- [x] AI chat Motion (src/services/motionAgent.js): update_plan, propose_ideas, write_script, edit_scenes, find_assets, produce. Rencana produksi detail + rincian biaya, tidak ada biaya sebelum tombol Buat.
- [x] UI: tab AI / Adegan / Audio (edit manual + "Simpan & lihat rencana produksi"), kartu Rencana produksi, tab Template dihapus.
- [x] Pixabay + Noto lewat find_assets; PIXABAY_API_KEY di .env.production lokal.
- [x] Render MP4 di browser (Remotion web renderer di frame sandbox, @remotion/media Audio). Teruji: h264 1080×1920 + AAC.
- [ ] Sebelum push: PIXABAY_API_KEY di Railway (ai-ugc-motion-worker), build semua service, tes UI manual dengan login.
- [ ] Lisensi Remotion: web renderer minta licenseKey ("free-license" kalau memenuhi syarat Free License, perusahaan ≤3 orang) — keputusan user.

## Status 2026-10-30 (lokal, BELUM di-push)
- [x] Layout baru: chat kiri (bisa ditarik), pratinjau tengah lebih sempit + timeline adegan, panel kanan Adegan/Audio (editor form), tab YouTube dihapus.
- [x] Rencana produksi ringkas di chat + panel detail ("Lihat rencana"); kartu AI (brief/naskah/adegan/rencana) dengan tombol Lihat.
- [x] Streaming balasan AI (OpenRouter stream → progress "§…"), adegan masuk satu per satu saat digambar.
- [x] AI bisa ganti judul (update_plan.title, nama project ikut).
- [x] inspect_scene: cuplikan adegan (server @napi-rs/canvas) → Seed 2.1 (VLM) → temuan untuk Sonnet.
- [x] Patah-patah: garis tidak "boil" lagi, tekstur & latar & peta di-cache, geometri bentuk di-cache (Path2D), pratinjau 540×960 (render tetap 1080×1920).
- [ ] Ukur ulang kelancaran di browser asli; kalau masih berat, kurangi lapisan kedua garis.

## Status 2026-10-30 sore (lokal)
- [x] Rasio 9:16 / 16:9 / 1:1 / 4:5 (layout.js), dipilih AI atau dropdown; ganti rasio = gambar ulang semua adegan.
- [x] Kirim gambar/video di chat (📎 / drag): jadi referensi ref-N; gambar bisa dipakai di adegan (s.image("ref-1")). look_at_reference (Seed 2.1, gambar & video) untuk meniru gaya atau membuat motion graphic dari foto user.
- [x] read_web (baca halaman publik, aman dari alamat internal) + use_web_image (gambar milik/izin user).
- [ ] Composition plans musik untuk video panjang (nanti).

## Catatan user 2026-10-30 (belum dikerjakan)
- [x] Pratinjau patah-patah: setelah video tenang, otomatis dirender setengah resolusi di belakang lalu diputar sebagai file (mulus); live canvas hanya sementara. Perlu dites di browser asli.
- [x] Kanvas bebas (story.canvas 2): tanpa template latar/pita caption; AI menggambar latar tiap adegan (s.backdrop, di-cache), palet dan tampilan teks per video (5 font OFL baru). Video lama tetap canvas 1 sampai naskahnya ditulis ulang.
- [x] Tokoh didesain AI per video (designCast → kode per tokoh, s.cast(nama, ...)), didesain ulang hanya kalau look berubah. s.person/s.animal tinggal untuk figuran jauh.
- [x] Pixabay dihapus (find_assets tinggal emoji Noto; gambar dari kiriman user/web milik user).
- [x] Jangan default krayon (default sekarang flat modern; krayon hanya kalau diminta).
- [x] UI mirip AI Director (chat, panel tengah, timeline lane, panel kanan) — lokal, belum commit.

## 1. Engine (gratis, tes tanpa AI dulu)
- [x] Manusia: `s.person(...)` berpose (berdiri, jalan, lari, jongkok, menunjuk, membawa benda), rambut/kulit/baju diatur, wajah sederhana opsional.
- [x] Hewan: berkaki empat, burung, ikan.
- [x] Latar bebas per video/scene: warna/gradasi + tekstur racikan AI, lingkungan digambar scene, gambar stok sebagai latar (Seedream/foto upload user belum), atau tanpa latar. Keterbacaan caption tetap dijaga engine. Ganti 3 tema tetap (paper/dusk/night).
- [x] Gaya bebas: deskripsi + parameter (tebal/goyang garis, tekstur, palet, font) diracik AI; Krayon/Spidol/Kapur cuma titik awal.
- [x] Tempo bebas: kata per scene, cara baca narator, kecepatan transisi, kekuatan kamera, musik.
- [x] Bahan dari mode Template di engine: label harga, grafik, bubble chat, tombol CTA, progress, timeline.
- [ ] Bahan template yang belum: kode promo, timer hitung mundur, daftar poin.
- [x] Infografik: grafik, angka bergerak, timeline, peta.
- [x] Aset (lihat bagian 4): `s.lottie`, `s.icon`, `s.image`, `s.map`, disimpan di storage kita, lisensi & kredit dicatat (tampil di tab Audio). Kredit belum otomatis masuk deskripsi video karena tab YouTube dihapus.
- [x] Efek suara: baru 6 file, sisanya dipetakan ke yang terdekat. Buat sisanya (synth sendiri, scripts/make-motion-sfx.mjs) atau paket berlisensi.

## 2. AI chat Motion (seperti AI Director)
- [x] Sonnet 5.5 (OpenRouter) dengan tools: usulkan brief/ide, tulis naskah, daftar tokoh (cast) konsisten, rekam suara, buat musik, gambar scene, cari aset, revisi per adegan (teks, gambar, kamera, durasi), tambah/hapus/urutkan adegan, ubah gaya/warna/musik.
- [x] Semua jenis video: motivasi, edukasi/sejarah/sains (fakta benar, tahun "sekitar"), dongeng, berita, tips/tutorial, review, promosi produk, ucapan, profil bisnis, dll. Alur cerita sesuai jenis.
- [x] Bentuk visual dicampur: animasi gambar tangan, infografik, tipografi (s.text3d/tag), gambar stok.
- [ ] Bentuk visual yang belum: ilustrasi/foto via Seedream, klip Seedance, foto/logo upload user di chat.
- [x] Sebut biaya sebelum aksi berbayar (seperti AI Director).
- [x] Revisi satu adegan: gambar ulang hanya adegan itu; teks berubah → rekam ulang narasi, cek ulang timing.
- [x] Mode Template dihapus dari tab Motion setelah chat jadi (project lama tetap bisa dibuka masa transisi).

## 3. Render MP4
- [x] Render di browser (@remotion/web-renderer), download langsung. BELUM: simpan hasil ke R2 / riwayat, dan putuskan apakah render dikenai kredit (sekarang gratis karena jalan di browser user).
- [x] Memori worker motion: tidak perlu dinaikkan untuk render (render di browser); inspect_scene memakai canvas di worker, pantau memorinya.

## 4. Aset luar (riset 2026-10-29)
Aman, simpan di server sendiri:
- [x] Google Noto Animated Emoji (sudah ada) — CC BY 4.0, wajib kredit.
- [x] Ikon Lucide (1.699, ISC) terpasang. Tabler/Phosphor belum (tidak perlu dulu).
- [ ] Open Peeps — CC0.
- [x] Natural Earth (peta) — domain publik.

Lewat API, dengan syarat:
- [x] **Pixabay** (foto, ilustrasi, vektor, video). Key sudah ada di user — simpan sebagai env `PIXABAY_API_KEY` (Railway ai-ugc-app + ai-ugc-motion-worker, .env.production), jangan di kode/catatan.
  - Endpoint: `GET https://pixabay.com/api/` (gambar), `GET https://pixabay.com/api/videos/` (video). Param penting: `q` (≤100 karakter), `lang=id` bisa, `image_type` (photo/illustration/vector), `orientation=vertical`, `category`, `safesearch=true`, `per_page` 3–200, `colors` (termasuk `transparent`).
  - Limit 100 request / 60 detik per key; header X-RateLimit-*. HTTP 429 kalau lewat.
  - **Wajib cache hasil pencarian 24 jam.** Jangan kirim banyak query otomatis; jangan mass download.
  - **Jangan hotlink permanen**: gambar yang dipakai harus diunduh ke storage kita. `webformatURL` (640px) hanya berlaku 24 jam; `largeImageURL` 1280px. fullHD/original hanya kalau akun disetujui full API access.
  - Video boleh embed, tapi tetap simpan di storage kita. Ukuran: large (±4K, bisa kosong), medium (1080p), small (720p), tiny (540p).
  - Tampilkan sumber (Pixabay) saat hasil pencarian ditampilkan ke user; catat `user`, `pageURL` untuk kredit di deskripsi.
  - Lisensi: komersial boleh, ubah boleh, tanpa kredit wajib; jangan jual/sebar konten tanpa diubah, jangan pakai konten bermerek untuk produk, jangan menyesatkan/ilegal (terutama orang yang dikenali).
  - Limit bisa dinaikkan kalau implementasi benar.
- [ ] **Pexels** (foto/video): link ke Pexels saat request, kredit fotografer kalau bisa, 200/jam & 20k/bulan (bisa dinaikkan gratis), jangan meniru fungsi inti Pexels. Perlu API key.
- [ ] **Openverse** (gambar/audio CC, data lisensi + teks kredit per hasil): user setuju dipakai. Filter `license_type=commercial` atau `license=cc0,by`, kredit CC BY wajib. Anonim: 20/menit, 200/hari (dari header API); daftar OAuth (`/v1/auth_tokens/register`) untuk limit lebih tinggi. Pencarian dari WSL sempat timeout 2026-10-29 — tes lagi dari server. Openverse tidak menjamin data lisensi: simpan lisensi + sumber per aset.

Tunda / lewati:
- [ ] LottieFiles: lisensi animasi publik boleh komersial, tapi tidak ada API pencarian resmi, dilarang mengumpulkan file untuk layanan serupa, akun Starter/Individual tidak boleh komersial. Tanya LottieFiles dulu (kemungkinan perlu paket Team). Link/upload dari user tetap jalan.
- Unsplash: wajib hotlink + lapor download + kredit tiap tampil, sublisensi butuh izin tertulis. Tidak cocok untuk video render.

## ElevenLabs Eleven v4 (2026-10-29, sudah di lokal)
- [x] Voiceover pakai `eleven_v4` (app, Motion, AI Director lewat bridge). Tidak ada speed/style/SSML; stability 0..1.
- [x] Narasi Motion: tiap scene punya "say" (kata sama dengan teks + audio tag, KAPITAL, ...). Angka/satuan ditulis seperti diucapkan. Tag disaring dari timing caption.
- [x] AI Director: aturan audio tag / tanda baca / angka ditulis seperti diucapkan / tanpa <break> di prompt set_audio + skill voice-performance-director.
- [ ] Harga v4: satu tes 40 karakter = header `character-cost: 16` (v3 dihitung 1 kredit/karakter). Ukur ulang dengan teks panjang, lalu sesuaikan ELEVENLABS_PRICES kalau v4 memang lebih murah.
- [ ] Dengarkan hasil v4 untuk suara-suara premade (bahasa Indonesia) dan tag yang dipakai.

## ElevenLabs Music (2026-10-29, sudah di lokal)
- [x] Prompt musik memutuskan 5 hal (genre, suasana, instrumen, BPM, era/produksi), istilah studio, nada dasar, aransemen berurutan sesuai alur video, larangan ("instrumental only, no vocals, no lead melody").
- [x] Motion: naskah menulis prompt musik sendiri ("music"); prompt tempo jadi cadangan. AI Director: aturan yang sama di set_audio + skill music-gen-usage.
- Music Marketplace: lagu yang dibeli dilisensikan ke pembeli dan tidak boleh dijual ulang/disublisensikan → jangan dipakai untuk video user. Musik yang kita generate lewat API yang dipakai.
- [x] Cek syarat lisensi musik (lihat catatan ⚠️ di bagian Sound Effects).
- [ ] Composition plans (struktur per bagian) untuk video panjang, nanti.

## ElevenLabs Sound Effects (dokumentasi dibaca 2026-10-29)
- API text-to-sound-effects: deskripsi teks + `duration` (0.1–30 dtk, 40 kredit per detik kalau ditentukan), `loop` (ambience yang bisa diulang tanpa sambungan), `prompt_influence` (tinggi = harfiah, rendah = kreatif). MP3, atau WAV 48 kHz untuk non-loop.
- Prompt: efek sederhana jelas ("glass shattering on concrete"), urutan ("footsteps on gravel, then a metallic door opens"), unsur musik ("vintage brass stabs in F minor"), istilah: impact, whoosh, ambience, one-shot, loop, stem, braam, glitch, drone.
- [x] (2026-10-29) Pustaka 131 jenis / 308 file di public/motion-sfx/lib, prompt di nexoclip-app/scripts/motion-sfx-library.json, manifest components/motion/draw/sfxLibrary.js; biaya 2.994 kredit ElevenLabs. Rencana awal: ganti 6 SFX sintetis dengan pustaka ±50 cue dari kontrak `s.sfx` (pop, tick, click, thud, boing, swish, whoosh, boom, riser, ding, coin, cash, type, tock, notify, drop, paper, chalk, beep, blip, laser, step, pageflip, bubble, snap, clap, impact, kick, swipe, whip, glitch, stamp, slide, scratch, buzzer, correct, tada, magic, braam, ...). Sekali buat, simpan di public/motion-sfx (2–3 variasi per cue, satu set per keluarga gaya kalau perlu). Perkiraan ±50 detik total ≈ 2.000 kredit ElevenLabs (±$0,30).
- [x] Ambience per scene/video (hujan, api unggun, gua, kota) dibuat AI sesuai cerita (add_sound kind ambience, loop), dibuat saat produksi, dikenakan kredit.
- [x] Efek khusus per momen (add_sound kind effect → s.sfx("custom:key")), dibuat saat produksi, dikenakan kredit.
- [x] Lisensi SFX (Sound Effects Terms, update 12 Feb 2026): boleh dipakai di video, iklan, game, dll. kalau paket mengizinkan komersial; TIDAK boleh dijual/dibagikan sebagai file audio lepas atau pustaka suara. Pustaka kita hanya dipakai di dalam video → aman. Community Sharing opt-in.
- [ ] ⚠️ Lisensi Music (Model-Specific Terms, update 26 Mei 2026, tabel Music Commercial Rights): Starter/Creator/Pro = "For Individual Use Only", komersial online/offline boleh kecuali film/TV/radio/game studio, Starter batas generate 17 menit/bulan (Creator 62, Pro 304). Musik untuk video user (pihak ketiga) kemungkinan butuh paket Business/Enterprise; dan 17 menit/bulan habis setelah ±20 video. Putuskan sebelum fitur musik dibuka luas.

## 5. Sebelum push
- [ ] Build semua service di Docker lokal (worker Railway pakai deploy/nexoclip/Dockerfile.worker).
- [x] `OPENROUTER_API_KEY` di ai-ugc-motion-worker (2026-10-29).
- [ ] `PIXABAY_API_KEY` (dan Pexels/Openverse kalau dipakai) di Railway.
