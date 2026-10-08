# COGS, atribusi pendapatan, dan dashboard — 7 Oktober 2026

Tahap kedua melanjutkan fondasi snapshot pricing. Implementasi tersedia di working tree. Migrasi sampai 033 sudah diterapkan pada database aplikasi lokal untuk aktivasi akun operator; deployment produksi belum dilakukan.

## Hasil

- `generation_cost_events` mencatat observasi biaya provider secara append-only, termasuk request gagal, retry, fallback, timeout, dan hasil provider yang selesai setelah worker kehilangan claim. Dispatch dicatat sebelum request berbayar dikirim.
- `latest_generation_cost_observations` menggabungkan observasi per request provider. Poll berulang tidak menggandakan biaya; observasi unknown tidak menghapus biaya yang diketahui. Koreksi biaya baru menggantikan nilai sebelumnya dalam laporan, sementara bukti lama tetap tersimpan.
- Gangguan polling atau worker memakai status observasi `interrupted`. Biaya parsial tetap provisional sampai ada bukti terminal provider. USD nol yang dilaporkan secara eksplisit valid; data yang belum diketahui tetap NULL.
- `credit_lots` menyimpan nilai perolehan kredit dari top-up terverifikasi. Kredit bonus termasuk dalam jumlah kredit pembagi, sehingga diskon paket tercermin pada pendapatan per kredit. Kredit promo dan sandbox bernilai nol; saldo historis dan sumber yang belum diketahui tidak diasumsikan sebagai penjualan.
- Reservasi mengambil kredit FIFO. Capture mengakui kredit yang dikonsumsi; release/refund mengembalikan kredit ke lot asal dalam transaksi yang sama dengan ledger. Basis nilai perolehan tidak dapat diubah.
- Dashboard `/admin/economics` menampilkan pendapatan kredit terpakai, biaya provider, fee pembayaran yang dialokasikan, kontribusi, dan kelengkapan data per workspace. Tersedia filter tanggal UTC, ringkasan model/provider akhir, dan riwayat job dengan pagination.
- Form rekonsiliasi fee menerima nilai aktual dan referensi invoice/gateway. Daftar pembayaran memiliki pagination agar top-up lama tetap dapat dipilih. Koreksi disimpan sebagai observasi baru; replay bukti lama tidak menimpa koreksi terbaru.

## Definisi laporan

Pendapatan job = jumlah kredit yang benar-benar dikonsumsi dari setiap lot × nilai pembelian lot / total kredit lot. Fee pembayaran dialokasikan dengan proporsi konsumsi yang sama. Kontribusi = pendapatan tersebut − biaya seluruh request provider job − fee pembayaran yang dialokasikan.

Contoh fixture teruji: konsumsi 5 dari 10 kredit senilai Rp1.000 menghasilkan pendapatan Rp500. Fee lot Rp100 mengalokasikan Rp50. Request gagal Rp300 dan request sukses Rp450 menghasilkan kontribusi −Rp300.

Laporan mengikuti job yang selesai atau gagal dalam periode UTC. Job baru menyimpan `finished_at`; job historis tanpa tanggal tersebut memakai `created_at` dan diberi penjelasan di UI. Kelompok provider menggunakan provider akhir job, dengan seluruh biaya fallback tetap termasuk. Job yang memakai kredit sandbox dikecualikan dan jumlahnya ditampilkan.

Pendapatan atau biaya yang diketahui tetap ditampilkan sebagai komponen parsial. Kontribusi/margin tidak ditampilkan sebagai angka final jika ada nilai kredit, fee, request, kurs, attempt, finalitas provider, atau settlement yang belum lengkap. Periode kosong tidak menghasilkan persentase margin.

## Akses dan API

Dashboard dan API memerlukan sesi pengguna, keanggotaan workspace, serta ID pengguna pada allowlist server `NEXOCLIP_OPERATOR_USER_IDS` (UUID dipisahkan koma). Role owner workspace saja tidak memberikan akses COGS. Nilai default kosong menolak akses operator. Contoh env dan kedua konfigurasi Compose sudah menyediakan variabel ini.

- `GET /api/admin/economics?from=YYYY-MM-DD&to=YYYY-MM-DD&groupBy=model&page=1&pageSize=25`
- `GET /api/admin/economics/payment-fees?page=1&pageSize=20`
- `POST /api/admin/economics/payment-fees`: `topupId`, `feeIdr`, `evidenceReference`, `reconciliationKey`

Ketiga endpoint menerima header `x-workspace-id` dan memverifikasi membership; identitas user/workspace untuk penulisan fee diambil dari sesi terverifikasi. Response memakai `Cache-Control: no-store`. Nilai fee kosong tidak dianggap nol. Referensi koreksi harus memakai reconciliation key baru; retry payload yang sama memakai key yang sama.

## Aktivasi

1. Jadwalkan maintenance untuk menghentikan writer kredit lama (admission, settlement worker, dan pemrosesan top-up) selama backfill dan pergantian versi. Migration 032 mengambil saldo serta reservasi berjalan; writer lama yang tetap aktif sesudah backfill dapat membuat saldo lot tidak konsisten.
2. Terapkan migrasi berurutan melalui `npm run db:migrate` dari `nexoclip-app/` pada database deployment yang telah dipilih. Tahap ini menambah `031_generation_cost_events.sql`, `032_credit_lots.sql`, dan `033_payment_fee_reconciliation.sql`, setelah fondasi 029–030.
3. Jalankan versi app dan worker yang sama, lalu isi `NEXOCLIP_OPERATOR_USER_IDS` pada server web dengan akun operator yang memiliki membership workspace terkait.
4. Buka `/admin/economics`, pilih workspace/periode, dan rekonsiliasi fee dari bukti gateway. Kredit lama tetap unknown; dashboard tidak mengarang nilai perolehan historis.

Harga paket dan jumlah kredit tidak diubah. Markup kode memiliki fallback 60%, sedangkan contoh env/Compose menggunakan 30%; hasil harus dibaca dari snapshot quote yang dipakai deployment, bukan dari asumsi simulasi sebelumnya.

## Verifikasi

- Suite regresi generation, pricing, credits, queue, API, DB, billing, admin, providers, dan frontend: 484 tes; 466 lulus, 0 gagal, 18 tes database opt-in dilewati tanpa URL database uji.
- PostgreSQL sementara terisolasi: 17 tes; 16 lulus, 0 gagal, 1 baseline penuh dilewati karena PostgreSQL lokal 14. Baseline lama memerlukan PostgreSQL 15+; deployment menggunakan PostgreSQL 16.
- Pengujian mencakup transaksi bersamaan, replay, drift saldo, FIFO/refund, snapshot immutable, dedup biaya, biaya request gagal, provisional cost, akses lintas tenant, sandbox, fee correction, dan pagination pembayaran lama.
- Next.js berhasil mengompilasi halaman dashboard serta API. Akses tanpa sesi mengarahkan halaman ke login dan menghasilkan HTTP 401 pada API. Rendering komponen dashboard diuji melalui SSR. Pengujian browser dengan akun operator lokal memastikan login menuju `/admin/economics`, tautan Buka Studio berfungsi, dan menu Admin → Economics muncul di sidebar Studio serta kembali membuka dashboard.
- Regresi autentikasi tanpa integrasi database: 17 tes lulus. Dua tes integrasi login PostgreSQL lulus pada schema sementara terisolasi yang dibersihkan setelah pengujian. Pengujian frontend mencakup menu khusus operator dan tujuan login.
- `npm run lint` di root dan `git diff --check` lulus. `npm test` di root: 19 lulus dan 4 gagal pada tes deployment yang masih mengharapkan layanan/file `ai-clip` serta pola Caddy lama. Keempat kegagalan direproduksi pada salinan file dari `HEAD` sebelum perubahan COGS, sehingga merupakan masalah baseline yang terpisah.

Tidak ada panggilan provider berbayar atau perubahan data produksi dalam pengujian. Notion tidak tersedia pada sesi ini, sehingga catatan implementasi disimpan di repository.

## Batas cakupan

Laporan ini adalah kontribusi setelah provider dan pembayaran. Hosting, biaya worker, storage, egress, pajak, dan OPEX belum dialokasikan. Pencatatan request terintegrasi pada worker image/video; alur lain yang belum mengirim observasi akan terlihat tidak lengkap. Biaya `calculated` berasal dari usage dan tarif snapshot, sehingga belum merupakan rekonsiliasi invoice provider. Nilai IDR provider menggunakan kurs snapshot quote, bukan kurs settlement bank aktual.

Rekonsiliasi fee gateway tersedia di dashboard. Rekonsiliasi invoice provider otomatis, backfill basis penjualan historis, subscription, dan penetapan paket harga baru masih merupakan pekerjaan terpisah.
