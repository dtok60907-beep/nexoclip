# Social Publishing — catatan penting

Tanggal: 15 November 2026. Lingkungan aktif: Docker lokal, app `http://localhost`, publisher `/studio/publish`, TikTok Developer Sandbox.

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
- [x] Alur operasional `needs_review`: tombol **Check TikTok status** hanya memeriksa publish ID lama. **Resume existing upload** tersedia untuk video `PROCESSING_UPLOAD` yang masih memiliki upload URL terenkripsi; worker memvalidasi batas chunk. Tanpa publish ID tidak ada tombol resend. Pemeriksaan dibatasi lease 60 detik dan tidak menimpa webhook terminal yang datang bersamaan. Diuji mock; respons API nyata untuk alur recovery masih perlu diuji manual.
- [ ] Uji webhook nyata pada URL HTTPS publik: signature, duplicate delivery, dan event terlambat. Localhost saat ini mengandalkan polling.
- [ ] Siapkan konfigurasi production app/worker/database/Redis/R2 dan backup encryption key. Deployment dan perubahan secret production memerlukan persetujuan user.
- [ ] Siapkan review/audit TikTok untuk public publishing. Sandbox/unaudited tetap private-only; jangan menonaktifkan pembatasan hanya untuk lolos uji.
- [ ] Atur lifecycle/cleanup foto turunan di R2 (`workspace/social/job/`). Saat ini derivatif dipertahankan; jangan hapus original atau file yang masih ditarik TikTok.

## P1 — alur kerja user

- [x] **Draft tersimpan:** PostgreSQL menyimpan ID media, urutan foto, caption, akun, disclosure dan pengaturan; **Save draft → Saved drafts → Continue editing**. Media diotorisasi ulang saat dibuka, edit memakai versi untuk mencegah saling timpa. Consent tidak disimpan; wajib review dan konfirmasi lagi. Draft yang berhasil dikirim dihapus dengan pemeriksaan versi.
- [x] **Scheduling:** tanggal/jam lokal + zona waktu terlihat di composer, disimpan UTC, 1 menit–30 hari ke depan. Status `scheduled`, ubah waktu dan batal tersedia sebelum worker mengklaim job. Batalkan dan buat ulang dengan konfirmasi baru untuk mengganti isi/media post terjadwal. Jadwal merupakan antrean Nexoclip; waktu selesai tetap bergantung pada pemrosesan TikTok.
- [x] Worker memvalidasi ulang membership, akun aktif/tidak disuspend, scope, media, creator settings dan visibility sebelum pengiriman. Klaim atomik mencegah dua worker menjalankan job yang sama; restart mengambil job due yang tersimpan. Tes PostgreSQL membuktikan idempotency, race dua worker, jadwal future tidak terklaim, serta cancel. **Posting terjadwal nyata setelah restart masih harus diuji manual.**
- [ ] Upload media sendiri dari publisher. Saat ini video dipilih dari hasil generate milik user; foto dari aset workspace. Batas app: video MP4/MOV 250 MB, foto 1–35, source foto 20 MB dan 16 megapixel.
- [x] Pagination media: 24 item per tab + Load more; pilihan dipertahankan lintas tab dan refresh.
- [ ] Search media dan filter riwayat publishing.

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

## Verifikasi lanjutan 15 November

- 43 tes Node mock/unit/route lulus (`node --test --test-isolation=none --test-reporter=spec src/services/socialPublishingRoutes.test.mjs src/services/socialPublishingWorkflow.test.mjs src/services/tiktokService.test.mjs src/services/tiktokPublishing.test.mjs src/services/tiktokPostSync.test.mjs src/services/tiktokProfileSync.test.mjs src/services/tiktokVideoQuery.test.mjs`). Termasuk CSRF, tanpa sesi, timezone, version conflict, status review, multipart resume, dan kehilangan scope.
- Suite `socialPublishing.integration.test.mjs` lulus pada database PostgreSQL Docker terpisah: seluruh migrasi dari kosong/rerun, concurrent create, cross-tenant denial, scheduled cancel, race worker, draft persistence/ownership/version, serta jadwal foto. TikTok dan R2 tidak dipanggil oleh suite ini.
- Delapan skenario PostgreSQL termasuk status-check lease/cooldown dan webhook terminal yang datang saat pemeriksaan berjalan. Database test sementara sudah dihapus; database aplikasi lokal hanya menerima migrasi `071`.
- Verifikasi akhir 16 November: build Docker app/worker lulus, migrasi lokal diterapkan, kedua service diperbarui dan `/studio/publish` merespons HTTP 200. Tes browser Playwright dengan seluruh API dimock lulus untuk pilih foto → simpan draft → buka kembali → caption/jadwal pulih → consent tetap kosong → konfirmasi schedule. Desktop dan mobile 390px diperiksa; tidak ada horizontal overflow. Ini tidak membuktikan posting terjadwal nyata.
- Tidak ada posting nyata baru yang dikirim oleh agent. Hasil nyata video/foto pada 14 November tetap terpisah dari tes mock di atas.
- Notion MCP tidak tersedia pada sesi ini; task state Notion belum diverifikasi atau diperbarui.

## Perbaikan loading media dan rotasi R2 — 17 November

- Penyebab yang ditemukan: daftar awal mengambil sampai 100 video dan 100 foto; semua tile video memakai preload metadata. Route aset lokal mengabaikan Range dan mengembalikan file penuh. Database lokal memiliki 53 video, total sekitar 333 MB (bukan pengukuran byte transfer browser).
- Daftar sekarang mengambil satu jenis media per permintaan, 24 item per halaman. Load more, cache per tab, pembatalan request saat pindah tab dan selection cache dipakai agar pilihan tidak hilang. Foto gallery memakai thumbnail 512px; original tetap digunakan saat review/publish.
- LocalObjectStorage kini mendukung existence check, thumbnail lewat signed upload/download capabilities, dan streaming byte ranges. Respons video 206/Content-Range dan 416 diuji; HEAD membatalkan stream tanpa body. Otorisasi tenant tetap dijalankan sebelum akses storage. R2 redirect tetap dipertahankan.
- 63 tes Node terkait aset/storage/publisher lulus. Tes browser dengan API dimock lulus: hanya satu permintaan metadata awal, 9 preview terlihat dari 24 item pada viewport test, pagination, pilihan lintas tab/refresh dan layout mobile. Tidak mengirim post nyata atau mengukur latensi produksi.
- Pasangan R2 access key/secret terbaru dibaca dari Railway production (app, video worker, image worker, Spite cocok), diverifikasi dengan HeadBucket read-only, lalu disimpan ke `.env.r2.local` yang diabaikan git dengan permission 600. App, image/video/motion workers dan Spite lokal dimuat ulang; seluruh nilai environment lainnya dipertahankan. Bucket, URL publik dan mode storage tidak diganti. Railway tidak dimutasi/deploy; snapshot privat sementara dihapus.
- Build Docker web lulus dan `/studio/publish` melalui domain dev merespons HTTP 200. Instagram posting tetap belum diimplementasikan: koneksi Meta saat ini hanya discovery akun dan laporan iklan.

## Instagram follow-up (17 November 2026)

- Local implementation adds owned-account post sync and confirmed single-photo/photo-carousel/Reels publishing through Unified Login. Setup and test steps: [meta-unified-login.md](meta-unified-login.md#instagram-publishing-and-post-sync-local-implementation).
- Reconnect after adding instagram_content_publish to the existing Meta login configuration. Personal accounts are unsupported; use Creator/Business. Dev mode needs app test roles/assigned assets; customer rollout needs Meta approval.
- No real Instagram publishing is triggered by automated verification. Confirm a real test post manually in /studio/publish → Instagram.
- Mixed-media carousels, Stories, IG scheduling/cancellation, IG publishing webhooks, campaign creation, transcoding of incompatible videos and lifecycle cleanup of publication derivatives remain follow-ups. Existing TikTok scheduling stays separate.
