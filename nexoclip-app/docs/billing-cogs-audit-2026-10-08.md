# Pemeriksaan billing dan COGS — 8 Oktober 2026

Lingkup: alur bukti tagihan provider, pencocokan request, koreksi biaya, pendapatan kredit, payment fee, settlement worker, dan pembatasan akses admin. Pemeriksaan ini tidak menyatakan aplikasi siap production atau biaya sudah final.

## Perbaikan

- Economics sebelumnya dapat menggunakan observasi terminal dari akun provider lain untuk menganggap biaya polling selesai, jika provider, job, request ID, dan nominal sama. Pencarian observasi terminal kini juga mensyaratkan akun provider yang sama, termasuk kecocokan NULL. Tes PostgreSQL membuktikan biaya sementara tetap memblokir kontribusi sampai akun yang benar memiliki observasi terminal.
- Retry pencocokan awal setelah koreksi biaya turun dapat ditolak ketika request lain telah memakai sisa kapasitas SKU. Retry identik kini memvalidasi bukti awal tanpa menghitungnya sebagai alokasi baru. Bukti berbeda tetap ditolak; pencocokan baru tetap dibatasi nilai SKU. Tidak ada event biaya baru pada retry.
- Fixture integrasi credit lots belum menyertakan migrasi 041 walaupun repository generation sudah membaca environment. Fixture diperbarui dengan migrasi yang sama; tidak mengubah perilaku produksi.

## Verifikasi

- 210 tes regresi lulus: billing, admin, keamanan tenant, worker/queue, dan frontend provider billing.
- 10 tes PostgreSQL lulus: Economics dan provider billing, termasuk pencocokan konkuren, bukti append-only, koreksi, isolasi akun, dan tidak mengubah kredit customer.
- 9 tes PostgreSQL tambahan lulus: FIFO credit lots, release/refund idempotent, pendapatan promo/sandbox, fee reconciliation, serta biaya provider pada kegagalan/fallback.
- Semua integrasi database memakai schema sementara yang dibersihkan atau transaksi rollback. Tidak memasukkan bukti pembayaran maupun biaya request nyata.
- git diff --check lulus. Tidak melakukan push. Pemeriksaan ini tidak mencakup build/deployment production maupun tes browser menyeluruh.

## Batas yang masih ada

- Biaya calculated berasal dari usage/tarif; biaya reported dari observasi provider atau bukti pencocokan. Kelengkapan laporan berarti komponen pencatatan tersedia, bukan jaminan cocok dengan invoice akhir bulan.
- File billing agregat tidak otomatis menjadi biaya aktual per job. Diperlukan identitas request dan bukti nominal untuk pencocokan langsung.
- Alokasi pembelian paket baru tersedia per SKU; belum dialokasikan ke setiap request/job. Request dengan usage paket atau savings plan tidak mendukung pencocokan langsung.
- Kontribusi mengurangi biaya provider dan fee pembayaran dari pendapatan kredit terpakai. Hosting, storage, egress, pajak, dan biaya operasional lain belum termasuk; angka ini bukan laba bersih.
- Nilai trial 750 kredit tetap simulasi, bukan pembayaran nyata.
- Customer dibatasi melalui identitas sesi dan allowlist operator server. Konfigurasi operator serta identitas akun provider production tetap perlu diverifikasi pada lingkungan deployment yang sesungguhnya.

Catatan berada di repository lokal. Notion tidak diperbarui karena konektor tidak tersedia pada sesi ini.
