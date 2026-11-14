# Canvas (services/spite): daftar bug

Ditulis 18 Okt 2026 dari laporan user. **Belum ada yang diperbaiki.**
Kode: `nexoclip-app/services/spite/`.

## 1. Upload video ke canvas (drag & drop, copy-paste) — ✅ `9e25028` (18 Okt)

Penyebab drag & drop: middleware Next memotong body request di 10 MB, jadi semua video
> 10 MB gagal di-upload (terbukti di lokal: "Request body exceeded 10MB"). Batas dinaikkan ke
200 MB (`middlewareClientMaxBodySize`). Ctrl+V sekarang juga menerima video dan audio.


- **Drag & drop:** kode sudah menerima video (`canvas-workspace.tsx` `handleDrop`, lalu
  `pasteImageFile` membuat node reference dengan `mediaType: 'video'`). Perlu dites langsung
  untuk tahu di mana gagalnya: upload (batas ukuran / timeout `uploadMediaFile`), preview node,
  atau pencatatan aset.
- **Copy-paste (Ctrl+V):** memang belum didukung. `onPaste` hanya mencari item `image/`.
  Tambahkan `video/` (dan `audio/`).

## 2. Trust gambar karakter (BytePlus) membingungkan

Gejala: status sering tidak sesuai. Hijau tapi ternyata belum di-trust, atau sebaliknya.
Kadang harus trust lewat tombol node, kadang lewat panel aset.

Penyebab yang terlihat di kode (`hooks/use-image-trust.ts`):
- Tiap tempat (node image, node reference, panel aset) punya **status sendiri-sendiri**,
  tidak saling sinkron. Trust di satu tempat tidak langsung terlihat di tempat lain.
- Di node image, cek status hanya jalan saat node **dipilih** (`enabled: Boolean(selected)`).
  Tiap kali dipilih ulang, status direset ke "not_trusted" lalu dicek lagi, jadi tampilannya berkedip.
- Trust berlaku **per project** (`canvasProjectId`), sedangkan panel aset bisa tanpa project,
  jadi statusnya bisa berbeda untuk gambar yang sama.

**✅ SELESAI 18 Okt (commit `d630144`, tayang 21.51 WIB). Pilihan C ("coba dulu, trust kalau ditolak").**
Director ikut pakai trust otomatis (commit `d3bb932`, tayang 22.01 WIB). Gambar canvas lama (`/api/r2-image/`) tidak bisa di-trust otomatis.
- Di server (video worker), dipakai bersama Canvas, Video Studio, dan Director.
  Kode trust milik Director nanti dihapus supaya tidak dobel.
- Alur:
  1. Kirim ke BytePlus tanpa trust.
  2. Kalau ditolak "content[n] may contain real person", trust gambar ke-n saja,
     tunggu aktif (node: "Menyiapkan referensi…"), lalu kirim ulang otomatis.
  3. Tandai aset itu "perlu trust", supaya lain kali langsung di-trust di awal.
  4. Setelah video selesai, trust dilepas (pinjam slot). Pinjaman dicatat di DB,
     sweep tiap 15 menit untuk yang tertinggal. Slot penuh: job menunggu di antrean.
- Hanya untuk model Seedance.
- Hapus tombol/indikator trust manual di node dan panel aset.
- Sebelum mulai: pastikan request yang ditolak BytePlus tidak ditagih,
  cek kuota slot trust akun, dan tambahkan klausul izin wajah di S&K.

**Rencana awal (referensi): trust otomatis seperti Director.**
- Director men-trust gambar referensi tepat sebelum generate video, menunggu sampai aktif,
  lalu melepasnya lagi setelah selesai (`generation.py` `_trust`, sweep tiap 15 menit di `app.py`).
- Di canvas: hapus tombol trust manual. Saat generate video Seedance, semua gambar referensi
  di-trust otomatis, dengan status "Menyiapkan referensi…" di node.
- Pakai mekanisme yang sama dengan Director supaya kuota trust di akun BytePlus dipakai bersama.
- Indikator trust di node/aset cukup info saja (opsional), bukan tombol.

## 2b. Seedance 2.5 Unfiltered sering gagal (dicek 18 Okt) — ✅ diperbaiki di `d630144`

64 job gagal sejak 16 Sep. Ke user hanya tampil "Video generation failed", padahal
BytePlus memberi alasan jelas (hanya ada di log worker, yang hilang setelah deploy).
Penyebab yang ketemu di log:
- **Gambar referensi bukan aset trusted** (17 Okt, 9 kali di semua model Seedance):
  "input image 'content[3]' may contain real person". Endpoint unfiltered pun tetap
  butuh trust untuk wajah. Diselesaikan oleh trust otomatis di nomor 2.
- **Gambar referensi terlalu kecil** (18 Okt, 2 kali): minimal 90.000 piksel untuk
  Seedance 2.5, yang dikirim 350×233 px. Perbaikan: perbesar otomatis gambar kecil
  sebelum dikirim (atau tolak saat dipasang dengan pesan jelas).
- 5–6 Okt dan sebelumnya: log sudah tidak ada.

Perbaikan umum:
1. Tampilkan alasan yang bisa dipahami user ("Gambar ke-3 berisi wajah, sedang di-trust…",
   "Gambar ke-12 terlalu kecil, minimal 300×300").
2. Simpan pesan asli BytePlus di `generation_jobs.error` (field internal) supaya bisa
   dicek dari admin walau log sudah hilang.

## 3. Prompt & node tidak bisa diklik

- ✅ **Select teks di prompt** (`9e25028`): direproduksi di browser headless, menarik di atas teks
  menggeser node 225 px tanpa seleksi. Sekarang di node prompt yang terpilih, tekan di teks langsung
  edit dan tarikan yang sama memblok teks; node yang belum terpilih tetap bisa diseret.
- ⏳ **Tombol node video/image**: BELUM bisa direproduksi. Di lokal (1 user, tanpa generate berjalan)
  semua tombol bereaksi di klik pertama dan node tidak render ulang saat diam. Satu temuan: node yang
  terpilih naik ke lapisan atas dan menutupi tombol node lain yang bertumpuk. Perlu info dari user:
  saat generate berjalan? di node yang bertumpuk? beberapa tab/user?

### Catatan lama

- **Select teks di prompt:** seleksi teks batal atau "mulur", seperti ikut men-drag node atau kanvas.
- **Tombol di node video/image gen kadang tidak bisa diklik**, seperti glitch,
  diduga node terus di-render ulang.
- Yang perlu dicek:
  - Kelas `nodrag nopan` di area prompt dan tombol (`image-node.tsx` ±1235, `video-node.tsx` ±1498).
  - Handler pointer di `image-node.tsx` ±1046 / `video-node.tsx` ±1248.
  - Apa yang memicu render ulang: update realtime, polling status, patch data node.
    Ukur pakai React Profiler.

## Cara kerja

Sama seperti `DIRECTOR_TODO.md`: build di Docker lokal dulu (`spite`), push ke `origin` dan
`railway-deploy`, minta izin sebelum generate berbayar.
