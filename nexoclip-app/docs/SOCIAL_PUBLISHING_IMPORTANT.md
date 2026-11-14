# Social Publishing — catatan penting

Tanggal: 14 November 2026. Lingkungan aktif: Docker lokal, app `http://localhost`, publisher `/studio/publish`, TikTok Developer Sandbox.

## Status yang sudah terbukti

- TikTok OAuth Desktop localhost dengan PKCE, akun terhubung dan token terenkripsi.
- Satu Direct Post **video** sudah mencapai `published / PUBLISH_COMPLETE` dari TikTok.
- `/v2/video/query/` berhasil memperbarui metadata satu video nyata.
- Publishing foto/carousel, status polling, sinkronisasi video publik, profil/statistik dan UI sudah diimplementasikan.
- 31 tes runtime mock lulus; tes database untuk ownership, idempotency, urutan foto dan metadata lulus dengan rollback.
- Posting foto pertama gagal dengan `url_ownership_unverified`. Setelah perbaikan verifikasi oleh user, Direct Post **3 foto** berhasil mencapai `published / PUBLISH_COMPLETE` pada 14 November 2026 pukul 17:27 WIB, tanpa error. User juga mengonfirmasi foto berhasil.

## P0 — sebelum dipakai pelanggan

- [x] **Bereskan verifikasi URL foto sandbox.** URL `assets.nexoclip.com` telah diterima oleh TikTok; dibuktikan dengan posting foto nyata yang berhasil. Untuk production client, verifikasi property yang sesuai tetap harus dicek terpisah.
- [x] Setelah verifikasi benar, user review dan konfirmasi ulang foto; job 3 foto mencapai `PUBLISH_COMPLETE` dan user mengonfirmasi berhasil. Job pertama tetap disimpan sebagai gagal; tidak di-requeue otomatis.
- [ ] Uji carousel, urutan/cover, caption, AI disclosure, komentar, dan photo Upload-to-inbox sampai selesai di TikTok.
- [ ] Uji video multipart nyata serta recovery setelah worker terputus. Pertahankan pemeriksaan publish ID sebelum retry agar tidak membuat posting ganda.
- [ ] Buat alur operasional `needs_review`: tampilkan penyebab, periksa status TikTok, dan tawarkan langkah aman. Tidak boleh sekadar requeue semua job.
- [ ] Uji webhook nyata pada URL HTTPS publik: signature, duplicate delivery, dan event terlambat. Localhost saat ini mengandalkan polling.
- [ ] Siapkan konfigurasi production app/worker/database/Redis/R2 dan backup encryption key. Deployment dan perubahan secret production memerlukan persetujuan user.
- [ ] Siapkan review/audit TikTok untuk public publishing. Sandbox/unaudited tetap private-only; jangan menonaktifkan pembatasan hanya untuk lolos uji.
- [ ] Atur lifecycle/cleanup foto turunan di R2 (`workspace/social/job/`). Saat ini derivatif dipertahankan; jangan hapus original atau file yang masih ditarik TikTok.

## P1 — alur kerja user

- [ ] **Draft tersimpan:** media, urutan foto, caption, akun, disclosure dan pengaturan; bisa dilanjutkan setelah reload. Draft bukan posting yang sudah dikirim.
- [ ] **Scheduling:** tanggal/jam + zona waktu, simpan waktu UTC, edit/batal sebelum pengiriman, dan konfirmasi eksplisit. Kolom `scheduled_at` sudah ada; API/composer scheduling belum dibuat.
- [ ] Validasi ulang izin, koneksi akun, media, creator settings, dan visibility saat waktu publish tiba. Pastikan restart worker tidak mengirim jadwal dua kali.
- [ ] Upload media sendiri dari publisher. Saat ini video dipilih dari hasil generate milik user; foto dari aset workspace. Batas app: video MP4/MOV 250 MB, foto 1–35, source foto 20 MB dan 16 megapixel.
- [ ] Pagination/search media melebihi 100 item dan filter riwayat publishing.

## P2 — insights dan platform berikutnya

- [ ] Analytics per posting: refresh otomatis metadata/statistik, snapshot berkala dan grafik perubahan. Saat ini refresh detail per video dan counter akun terbaru tersedia.
- [ ] Instagram dan YouTube melalui adapter/authorization masing-masing, setelah alur TikTok stabil.
- [ ] `video.manage`: endpoint inspect/edit/status/delete belum terverifikasi. Scope tercantum di TikTok tetapi Target APIs kosong. Jangan menebak endpoint atau menampilkan fitur edit/hapus seolah sudah bekerja.

## Hal yang harus diingat

- `video.list` hanya menampilkan video publik; draft dan video privat tidak ikut sinkronisasi. Foto tidak boleh diasumsikan ikut `/video/list/`.
- Scope tambahan harus diaktifkan di sandbox/production app yang benar, lalu user reconnect dan memberikan izin. Scope yang ditolak user tidak boleh dianggap aktif.
- `SEND_TO_USER_INBOX` membutuhkan tindakan user di aplikasi TikTok. `PUBLISH_COMPLETE` adalah selesai terbit; ID publik mungkin baru tersedia setelah moderasi dan tidak dijanjikan untuk posting privat.
- URL Prefix harus cocok origin dan path; berbeda dengan verifikasi Domain yang menurut dokumentasi mencakup subdomain. TikTok tetap menjadi sumber kebenaran untuk penerimaan URL.
- Server hanya menerima ID aset workspace, bukan URL foto bebas dari browser. Token tetap server/worker-only.
- Jangan membaca/menampilkan `.env.local`, memasukkan secret ke git, deploy production, submit app review, atau mengirim post nyata tanpa instruksi/konfirmasi yang sesuai.

Panduan implementasi dan sandbox: [tiktok-publishing.md](./tiktok-publishing.md).
