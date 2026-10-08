# Fondasi COGS — implementasi 7 Oktober 2026

Tahap pertama dari audit 6 Oktober. Harga paket, jumlah kredit, dan markup default tidak diubah.

## Perubahan

- Job image/video baru menyimpan `estimated_provider_cost_usd` terpisah dari `estimated_cost` yang tetap merupakan kredit pelanggan.
- `pricing_snapshot` menyimpan model, basis tarif provider, kurs USD/IDR, markup, konversi kredit, waktu quote, dan versi pricing aplikasi. Snapshot dan estimasi provider terkunci di PostgreSQL setelah disimpan.
- Settlement job bersnapshot memakai tarif/kurs/markup quote tersebut. Tidak mengambil katalog atau kurs baru saat settlement. Tagihan tetap dibatasi reservasi; penggunaan lebih murah menghasilkan pengembalian selisih kredit.
- Worker menyimpan USD provider yang dilaporkan atau dihitung dari usage menggunakan tarif snapshot. USD nol valid; usage belum diketahui tetap SQL NULL. Kolom `cost_source` membedakan `reported`, `calculated`, `unknown`, dan `legacy`.
- Recovery job sukses yang belum settled membaca usage request sukses di workspace yang sama dan snapshot job. Data usage asli dipertahankan untuk reproduksi tagihan, termasuk kasus promo biaya provider nol. Job lama atau usage tidak lengkap mempertahankan kebijakan capture reservasi.
- Field COGS/snapshot baru dikeluarkan dari response generation customer, internal Canvas, dan status ViMax. Endpoint harga yang sudah ada tidak diubah.

## Migrasi dan rollout

Migrasi `029_generation_pricing_snapshot.sql` dan `030_provider_usage_cost_units.sql` bersifat penambahan. Terapkan migrasi sebelum menjalankan kode app/worker baru: dari `nexoclip-app/`, gunakan `npm run db:migrate` dengan konfigurasi database deployment yang sudah dipilih.

Database aplikasi/produksi belum diubah pada pekerjaan ini. Jangan mengonversi nilai biaya lama berdasarkan dugaan: snapshot dan estimasi provider lama tetap NULL; currency lama tetap NULL dan source `legacy`. Job lama memakai jalur compatibility. Laporan COGS berikutnya harus memisahkan nilai legacy/unknown.

## Batas tahap ini

Pencatatan usage ini masih berada pada hasil sukses. Cost ledger append-only semua attempt/retry/fallback, tagihan gagal, worker/storage/egress, fee pembayaran, credit lots, atribusi pendapatan, rekonsiliasi invoice, dan dashboard margin belum dibuat. Biaya `calculated` merupakan rekonstruksi penggunaan dengan tarif quote, belum biaya terkonfirmasi invoice.

Penetapan harga paket atau subscription final tetap membutuhkan tarif efektif, biaya gateway aktual, distribusi penggunaan, dan target margin. Simulasi sebelumnya tidak menggantikan data tersebut.

## Verifikasi

Suite terkait: `node --test tests/generations/*.test.mjs tests/pricing/*.test.mjs tests/credits/*.test.mjs tests/queue/*.test.mjs tests/api/*.test.mjs tests/db/*.test.mjs` dari `nexoclip-app/`.

Hasil: 273 lulus, 0 gagal, 3 tes database opt-in dilewati pada suite umum. `npm run lint` di root dan `git diff --check` lulus. Verifikasi terpisah pada PostgreSQL sementara: 10 tes repository/schema lulus, 1 tes baseline penuh dilewati; recovery bersamaan menghasilkan satu refund dan memilih request sukses meski terdapat request gagal yang lebih baru.

Tes database opt-in memakai `NEXOCLIP_TEST_DATABASE_URL` ke database uji terisolasi. PostgreSQL lokal versi 14 dapat memeriksa migrasi baru dengan fixture schema minimal. Migrasi penuh dari schema kosong membutuhkan PostgreSQL 15+ karena baseline migrasi 006 sudah memakai sintaks referential action column-list; tes baseline tersebut dilewati di PostgreSQL 14. PostgreSQL deployment dikonfigurasi versi 16.

Tidak ada panggilan provider berbayar dalam tes, perubahan harga jual, atau deployment pada pekerjaan ini.
