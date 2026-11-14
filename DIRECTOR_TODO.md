# AI Director: catatan lanjutan

Ditulis 13 Okt 2026, ±04:00 WIB. Untuk dilanjut siang ini.

## Status sekarang

- Production (app.nexoclip.com) sudah di commit `f4340b4`, sama di `origin` dan `railway-deploy`.
  Semua service Railway SUCCESS.
- Yang sudah jalan:
  - Agent chat dengan tool calling.
  - Board: brief, konsep, naskah, aset, scene, shot.
  - Reference sheet otomatis: satu sheet per karakter/lokasi/properti, tanpa batas jumlah.
  - Generate frame/video lewat kartu approve.
  - Export MP4 (ffmpeg, gratis, maks 200 MB).
  - Timeline:
    - Video final dengan posisi shot yang akurat.
    - Drag untuk ubah urutan dan hapus shot.
    - Zoom pas layar.
    - Filmstrip.
- Model:
  - Video: `byteplus/seedance-2.5-unfiltered`.
  - Gambar: `bytedance-seed/seedream-4.5`.
  - LLM: `gpt-5.6-terra`, reasoning low. Hanya GPT-5 ke atas, tanpa -pro / -sol (`PRICES_PER_MILLION` di `llm.py`, harus sama dengan `storyboardTextPricing.js`).
  - Brief punya `look` (wajib sebelum aset/shot). Sheet properti tanpa orang kecuali ada `interaction`.
  - Dikunci di `director_service/nexoclip.py` dan `STORYBOARD_MODELS` di
    `nexoclip-app/app/api/internal/storyboard/route.js`.

## Kesamaan dengan OpenArt Director (acuan: https://director-user-manual.vercel.app/)

Diminta user 14 Okt 2026: alur dan fitur harus seperti OpenArt Director.

- [x] **Fase 1 — audio & timeline** (commit `d319e6a`, belum di-push):
  - Timeline punya lane VO / Musik / Caption + toolbar "+ Shot / + Musik / + Voiceover / + Caption".
  - Panel kanan per shot dengan tab Media / Musik / Voiceover / Caption.
  - Preview memutar musik dan VO bersama klip.
  - Caption dirender ke video.
  - Shot bisa di-duplicate dan ditambah sebelum/sesudah shot lain.
  - VO per shot, AI mengusulkan opsi audio sendiri, ElevenLabs (VO `eleven_v3`, musik `music_v1`).
- [x] **Fase 2 — run mode** (commit `d8ae4a7`) + streaming chat, lampiran gambar/video di chat, `@mention`:
  - "Guide me" vs "Just make it" (auto-approve kredit).
  - Credit gate di chat (Upgrade lalu Continue).
  - Minimal 100 kredit untuk mulai.
- [x] **Fase 3 — Shot & Scene** (selesai 14 Okt):
  - Upload media.
  - Toggle Grid / By Scene.
  - Pilih banyak shot lalu generate batch.
  - Add scene.
  - `@shot` di chat.
  - Fullscreen preview.
- [ ] **Fase 4 — export:**
  - Dialog Export: resolusi, MP4/MOV, 30/60 fps.
  - Download Assets.
  - Tombol cepat UGC ads / music video / short film.
- [ ] **Fase 5 — konsistensi:**
  - Suara per karakter + dialog lip-sync.
  - Upload suara sendiri.
  - Brand kit (warna, font, logo).
  - Perlu riset model lip-sync.

Catatan audio:
- Key ElevenLabs masih free: Music API tidak bisa dipakai, dan tidak punya izin `voices_read`.
- Daftar suara ditulis tetap di `src/services/elevenlabsAudio.js` dan `director_service/nexoclip.py`.

## Yang masih kurang (urutan yang disarankan)

1. **Omni reference per shot.** Ini kunci konsistensi banyak karakter.
2. **Take per shot.**
3. **Upload referensi user** (produk/logo/wajah).
4. **Generate semua sekaligus + biaya dalam kredit.**
5. **Extend dan edit video.**
6. **Add shot dan trim/durasi di timeline.**
7. **Transisi, teks/caption, musik/VO di render.**

Draft mode (480p lalu 1080p): **di-skip**, kata user tidak perlu.

### A. Generate video (Seedance 2.5)
1. **Omni reference.**
   - Sekarang video hanya menerima 1 gambar (frame shot) lewat `referenceImages`.
     Sheet karakter tidak ikut ke video.
   - Rencana: di `board.media_specs()`, `deps` video = `[frame:<shot>, element:<id> untuk tiap element_ids]`.
     `generation._run_tier` sudah mengirim `referenceImages` sesuai urutan deps.
   - Prompt video ditambah keterangan referensi:
     "image 1 = frame pembuka, image 2 = sheet Dimas, …".
   - Sebelum menulis format itu, cek format penyebutan referensi yang dipakai Canvas di
     `nexoclip-app/services/spite/app/api/generate/submit/route.ts`
     (ada test "reference images 1-2" / "reference image 3").
   - Efek: video lama akan ditandai stale, karena spec/deps berubah.
2. **Take per shot.** Setiap generate/extend/edit jadi take; user memilih take aktif yang dipakai di
   timeline dan render. Saat ini `board.media[key]` hanya satu entri dan ditimpa.
3. **Extend.**
   - `omniReferenceTaskType: 'extend'`, `referenceVideos: [clip]`, `aspectRatio: 'adaptive'`.
   - Hanya Seedance 2.5.
   - Biaya input video perlu dicek di `generationPricing.js` sebelum dipasang.
4. **Edit.**
   - `omniReferenceTaskType: 'edit'`, `duration: -1` (wajib), `aspectRatio: 'adaptive'`, butuh video sumber.
5. **Grab last frame.** `returnLastFrame: true` → jadi frame awal shot berikutnya.
6. **First/last frame.** Pakai `frameImages`, maksimal 2. Tidak bisa dicampur dengan referensi lain
   (lihat `src/services/videoTaskType.js`).
7. **Toggle audio Seedance di UI.** `brief.generate_audio` sudah ada di backend, default false.

- Batas Seedance 2.5 di nexoclip: 30 gambar, 10 video, 10 audio per request; durasi 4–30 detik.
  Validasinya di `validateVideoGenerationInput` (`src/services/generationService.js`).

### B. Aset
8. **Upload referensi sendiri** (produk/logo/wajah) sebagai elemen dengan sheet dari foto asli.
9. **Referensi video/audio dari user** (omni).

### C. Alur dan biaya
10. **Generate semua sekaligus:** satu estimasi total, atau auto-approve dengan batas kredit.
11. **Biaya di chat dalam kredit**, bukan USD (`DirectorApp.js`, "Biaya AI project ini"), plus
    ringkasan kredit per project.
12. **Progres/ETA generate.**

### D. Timeline dan render
13. **"+ Add shot" di timeline.**
14. **Ubah durasi dan trim di track.**
15. **Transisi (crossfade) di `render.py`.**
16. **Teks / title card / caption.**
    - ffmpeg dari imageio-ffmpeg TIDAK punya `drawtext`, jadi teks harus dibuat sebagai gambar dulu.
17. **Musik dan voiceover di render.**
18. **Pilihan resolusi export dan riwayat render.**

### E. Chat dan AI
19. **Streaming jawaban.**
20. **Jumlah shot terlalu sedikit:** iklan 30 detik cuma 3 shot. Perbaiki instruksi di
    `director_service/agent.py`.
21. **Review konsistensi otomatis** (skill `reviewer`).

### F. Project dan operasional
22. **Rename/hapus/duplikat project, galeri.**
23. **Timeline di HP.**
24. **Pembersihan file render lama di R2 + antrean render.**
    - Render jalan di satu service `ai-ugc-director`.
25. **Rate limit per user + dashboard admin.**
26. **Test otomatis UI Director.**
27. **Hal kecil:**
    - CSP memblokir Cloudflare Insights di production.
    - Container Jellyfish lokal masih menyala (`docker ps`).
    - Project lokal "[Contoh] Render video final" (`contoh-render-video-final`) masih ada.
      - Di project itu sudah terpakai 26 kredit untuk 5 sheet karakter (dari tombol generate).
    - MP4 uji di R2 lokal: asset `e3d572eb…`.

## Cara kerja (wajib)

- **Selalu build di Docker lokal dulu sebelum push:**
  `docker compose --env-file .env.production build <service>` lalu `up -d --no-build <service>`.
- **Push ke dua remote:** `git push origin main && git push railway-deploy main`.
  Railway deploy dari `railway-deploy` (dtok60907-beep/nexoclip).
- **Test Director:**
  ```
  cd nexoclip-app/services/OpenMontage
  DIRECTOR_TEST_DATABASE_URL=postgresql://postgres:test@127.0.0.1:55432/director_test \
    .venv/bin/python -m pytest -q tests/director_service
  ```
  Butuh container `director-test-pg`.
- **Test nexoclip-app:** `node --test $(find tests app src -name "*.test.mjs")`.
  Ada 7 kegagalan lama: login integration, asset download, compose ingress, page guard,
  generations route.
- **Generate berbayar:** selalu minta izin dan sebutkan biaya dulu.
  Pengecualian: reference sheet aset memang otomatis.

## File penting

- Service: `nexoclip-app/services/OpenMontage/director_service/`
  - `agent.py`: tool dan instruksi AI.
  - `board.py`: data dan media spec.
  - `generation.py`: generate lewat bridge.
  - `render.py`: export MP4.
  - `session.py`: background job.
  - `nexoclip.py`: bridge dan upload render.
- UI: `nexoclip-app/components/director/`
  - `DirectorApp.js`, `ChatView.js`, `Workspace.js`, `BoardViews.js`.
- Bridge nexoclip:
  - `nexoclip-app/app/api/internal/storyboard/route.js`
  - `nexoclip-app/app/api/internal/director/render-upload/route.js`
    (dikecualikan dari middleware karena batas body 10 MB).
