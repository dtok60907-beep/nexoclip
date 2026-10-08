# Admin console tahap pertama — 7 Oktober 2026

## Hasil

- `/admin`: Overview anggota dan saldo saat ini, top-up non-sandbox, pembayaran pending, job dibuat/aktif/gagal dan running lebih dari 30 menit pada cohort tanggal dibuat.
- `/admin/customers`: anggota workspace, pencarian email/nama, role workspace, tanggal bergabung, detail pengguna, identitas workspace, saldo dan batas generasi yang dikonfigurasi.
- `/admin/transactions`: order, paket, jumlah pembayaran, kredit, gateway, status, penanda sandbox dan referensi ledger pada detail.
- `/admin/credits`: ledger kredit, alasan, perubahan, saldo setelah transaksi dan detail.
- `/admin/jobs`: model, jenis, status, estimasi kredit, settlement, attempt serta waktu mulai/selesai pada detail.
- Navigasi bersama menghubungkan semua modul dengan Economics dan Studio. Sidebar Studio menyediakan Overview dan Economics bagi operator.

Daftar mendukung periode UTC, pencarian, pagination 25 baris, serta status untuk transaksi/job. Detail memakai field yang dipilih server; password, token, payment URL, prompt, metadata dan respons mentah provider tidak dikirim. Keadaan kosong, loading dan kegagalan API memiliki tampilan berbeda. Pergantian workspace/filter membuang data dan detail lama.

## Akses dan implementasi

`GET /api/admin/console?section=overview|customers|transactions|credits|jobs&from=YYYY-MM-DD&to=YYYY-MM-DD&q=&status=&page=1` membutuhkan header `x-workspace-id`, sesi valid, membership workspace dan allowlist operator server. Workspace dan pengguna diambil dari konteks terverifikasi; query tidak dapat mengganti identitas. Respons sukses/error memakai `private, no-store`; error internal disamarkan.

Lapisan: route → adminConsoleService → adminConsoleRepository → PostgreSQL. Tidak ada migrasi baru. Semua query memakai parameter untuk nilai/filter dan membatasi workspace, termasuk query count. Tanggal dibandingkan dengan batas UTC eksplisit meskipun timezone PostgreSQL berbeda.

Modul ini merupakan console baca dalam workspace yang diizinkan. Akses global seluruh pelanggan, RBAC platform, audit mutasi, refund manual, suspend, retry, editor pricing dan subscription belum ditambahkan. Penjualan top-up dihitung dari order dibuat dalam periode yang sekarang completed dan non-sandbox; bukan pendapatan kredit terpakai atau laporan arus kas berdasarkan tanggal settlement. Job aktif/long-running hanya mengikuti cohort dibuat dalam periode, bukan seluruh antrean. Indikator 30 menit bukan kepastian job macet.

## Verifikasi

- 46 tes admin, API Economics/payment fee dan frontend lulus, tanpa kegagalan.
- Satu tes integrasi PostgreSQL lulus: fixture dua workspace, UTC boundary dengan timezone database Asia/Jakarta, pengecualian sandbox, pencarian karakter literal, pagination 26 job dan whitelist field. Fixture selalu di-rollback.
- Query baca pada workspace operator lokal berhasil; workspace baru mempunyai satu anggota dan belum mempunyai transaksi/job.
- Browser: Overview, Customers dan detail, pencarian tanpa hasil, Transactions, Credits, Jobs serta navigasi Economics diperiksa pada sesi operator.
- API tanpa sesi mengembalikan 401 pada port 3000.
- Lint root dan diff whitespace lulus. Next dev mengompilasi halaman/API terkait. Build produksi penuh tidak dijalankan dalam tahap ini.

Preview utama port 3000 dipulihkan dengan restart proses Next dev yang sudah diverifikasi berasal dari checkout ini karena proses lama mengembalikan respons kosong. Preview sementara port 3017 dihentikan. Tidak ada panggilan provider berbayar atau perubahan data produksi. Notion tidak tersedia; catatan implementasi disimpan di repository.

## Konsistensi desain

Semua halaman admin memakai `AdminShell` untuk header, navigasi, judul dan lebar konten. `adminStyles` menyatukan gaya filter, input, tombol, kartu ringkasan, panel, loading dan error. CSS dibatasi pada `.admin-console` untuk menyamakan tabel dan fokus keyboard tanpa mengubah Studio. Economics memakai layout yang sama dengan console lain. Filter beradaptasi ke satu kolom pada layar sempit dan membagi ruang menurut jumlah kontrol pada layar besar; tabel tetap dapat digulir horizontal. Logika keuangan dan hak akses tidak diubah.

Verifikasi desain: enam tes frontend terkait lulus; lint root dan diff whitespace lulus. Browser memeriksa Overview, Economics dan Customers/detail pada viewport sempit yang tersedia.

## Format angka kredit dan pemeriksaan generasi lokal

Angka kredit pada ledger, detail, Overview, workspace, Jobs, Economics dan katalog model memakai format Indonesia tanpa nol desimal di belakang. Contoh 750.000000 → 750, 743.700000 → 743,7 dan -6.300000 → -6,3. Formatter mempertahankan presisi string NUMERIC; tidak mengubah saldo atau perhitungan.

Job gambar lokal yang lama menunggu ditemukan queued tanpa attempt. Worker image sebelumnya tidak berjalan dan REDIS_URL belum diisi pada .env.local. Redis lokal DB 9 yang kosong dipakai untuk antrean aplikasi, lalu worker dijalankan. Job diproses tetapi gagal DIRECT_PROVIDER_UNAVAILABLE: model Gemini membutuhkan GEMINI_API_KEY/GOOGLE_API_KEY atau OPENROUTER_API_KEY, semuanya kosong pada konfigurasi worker lokal. Settlement melepaskan reservasi. Kredensial provider tidak disalin dari chat atau ditampilkan; konfigurasi diperlukan sebelum Nano Banana dapat menghasilkan gambar.
