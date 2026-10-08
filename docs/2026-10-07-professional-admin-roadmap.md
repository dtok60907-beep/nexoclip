# Roadmap admin NexoClip — 7 Oktober 2026

Panel admin platform mengelola bisnis dan operasi NexoClip. Admin workspace mengelola tim pelanggan. Keduanya perlu memiliki cakupan izin yang jelas. Dokumen ini adalah usulan prioritas, bukan pernyataan bahwa seluruh modul sudah dibangun.

## Modul dan kondisi saat ini

| Modul | Fungsi yang dibutuhkan | Kondisi repository | Prioritas |
| --- | --- | --- | --- |
| Overview | Pelanggan aktif, top-up berhasil, kredit terpakai, job gagal, biaya provider, indikator data belum lengkap | Belum ada overview admin terpadu | P0 |
| Customers & Workspaces | Pencarian pengguna/workspace, anggota, status akun, paket, saldo, riwayat aktivitas | Fondasi autentikasi dan membership tersedia; console pelanggan belum ada | P0 |
| Transactions | Daftar/detail top-up, status gateway, bukti pembayaran, webhook gagal dan rekonsiliasi | Backend top-up dan webhook tersedia; UI admin lengkap belum ada | P0 |
| Credits | Ledger, reserved/consumed/refunded, sumber kredit, penyesuaian dengan alasan dan bukti | Ledger, lot, FIFO dan settlement tersedia; console penyesuaian belum ada | P0 |
| Economics | Pendapatan kredit terpakai, seluruh biaya request, fee, kontribusi per model/provider, kelengkapan data | Dashboard workspace dan rekonsiliasi fee tersedia | P0; perlu perluasan terkontrol |
| Jobs & Providers | Antrean, running/stuck/failed, attempt/fallback, error aman, status worker dan provider | Backend job, audit workspace dan batas penggunaan tersedia; console operasi belum lengkap | P0 |
| Access & Audit | Role platform, hak akses per tindakan, audit perubahan, pencabutan sesi, MFA admin | Allowlist operator serta membership tersedia; RBAC platform dan audit terpadu belum lengkap | P0 sebelum tindakan sensitif |
| Pricing & Sales | Versi paket, harga, bonus, tarif model, kurs/markup, simulasi margin, jadwal berlaku | Paket dan snapshot quote tersedia; editor admin belum ada | P1 |
| Support | Timeline pelanggan, tiket, bukti job gagal, refund melalui alur resmi | Console support belum ada | P1 |
| Growth & Subscriptions | Conversion top-up, repeat purchase, cohort; recurring billing bila model bisnis dipilih | Analitik admin dan subscription belum ada | P2 |

## Urutan pembangunan

1. Bangun kerangka admin konsisten, Overview, Customers/Workspaces, Transactions/Credits dan Jobs sebagai tampilan baca. Filter workspace, tanggal, status, pencarian, pagination dan detail harus berfungsi. Semua endpoint memeriksa izin server.
2. Tetapkan role platform dan audit sebelum menambah suspend, refund, penyesuaian kredit, retry atau perubahan harga. Role yang diusulkan: Super Admin, Finance, Operations, Support dan Analyst. Analyst hanya membaca; Support tidak mengubah tarif atau mengakses rahasia provider.
3. Tambahkan tindakan terbatas melalui layanan bisnis yang transactional dan idempotent. Kredit tidak diedit langsung pada saldo. Retry harus melalui aturan lifecycle job dan mempertimbangkan kemungkinan biaya provider sebelumnya.
4. Tambahkan Pricing & Sales dengan versi baru untuk transaksi mendatang. Quote lama tetap memakai snapshotnya. Simulasi memperlihatkan pendapatan efektif per kredit setelah bonus/diskon, fee, estimasi biaya provider dan kontribusi.
5. Tambahkan support dan analitik pertumbuhan. MRR/churn subscription baru digunakan setelah recurring billing benar-benar tersedia; saat ini repeat top-up lebih relevan.

## Batas akses yang perlu dipertahankan

Operator saat ini tetap membutuhkan membership workspace; akun lokal baru hanya memiliki workspace NexoClip Admin. Akses platform lintas pelanggan memerlukan kebijakan izin tersendiri, endpoint khusus dan pengujian isolasi tenant. Jangan menghapus pemeriksaan membership secara umum untuk membuat laporan global.

Audit perubahan mencatat aktor, waktu, workspace, resource, tindakan, alasan, sebelum/sesudah, hasil dan request ID. Rahasia provider, password dan token tidak masuk audit. Pembagian izin mengikuti least privilege dan pemeriksaan setiap request; rujukan: [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) dan [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html).

## Definisi angka bisnis

- Top-up berhasil menunjukkan kas penjualan kredit; jangan menyamakannya dengan pendapatan dari kredit yang sudah dikonsumsi.
- Economics saat ini menghitung kontribusi setelah biaya provider dan fee pembayaran. Hosting, storage, egress, pajak dan OPEX belum dialokasikan; angka ini belum merupakan laba bersih.
- Data biaya atau basis penjualan yang belum diketahui ditandai tidak lengkap, bukan dianggap nol.
- Semua dashboard menyatakan zona waktu, periode dan cakupan workspace. Laporan agregat lintas workspace hanya tersedia setelah izin platform ditetapkan.

## Hasil tahap pertama yang bisa diterima

Admin dapat menemukan pelanggan, melihat workspace dan saldo beserta ledger, menemukan pembayaran dan job terkait, serta membuka Economics dalam cakupan izin yang benar. Pengguna biasa tidak melihat navigasi admin dan tetap ditolak oleh API admin. Data kosong memiliki penjelasan; kegagalan API ditampilkan sebagai kegagalan, bukan angka nol. Tidak ada mutasi keuangan melalui tampilan baca.

Menu Admin → Economics dan tujuan login operator sudah diverifikasi pada browser lokal. Modul tambahan di atas masih roadmap. Notion belum dapat diakses dalam sesi ini; catatan disimpan di repository.
