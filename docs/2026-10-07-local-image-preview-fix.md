# Perbaikan preview gambar lokal

Upload lokal menyimpan file dan metadata asset, lalu mengembalikan URL `/api/assets/:id/download?workspace_id=...`. Endpoint download sebelumnya selalu memberikan HTTP 302 ke signed URL storage. Pada LocalObjectStorage URL itu menggunakan `local://download`, yang merupakan kapabilitas internal server dan tidak dapat dibuka browser.

Endpoint sekarang memeriksa sesi, membership dan asset tenant terlebih dahulu. Untuk local storage, server membaca signed URL melalui storage.get dan mengirim body HTTP, Content-Type, nosniff serta cache private/Vary Cookie. Konten aktif seperti HTML/SVG diunduh sebagai attachment; CSP sandbox diberikan pada body lokal. R2 tetap menggunakan redirect. File hilang menghasilkan 404; error storage tidak membocorkan path server.

Image Studio memakai cache key preview baru hanya pada URL asset same-origin, termasuk thumbnail pilihan, riwayat dan fullscreen, agar redirect local lama yang sudah tercache tidak dipakai kembali. URL asli yang disimpan dan dikirim untuk generasi tidak berubah. Signed URL eksternal/data/blob tidak dimodifikasi.

Verifikasi: sembilan tes endpoint, local signed storage, upload storage dan URL preview lulus. Gambar PNG asli yang sudah diupload pada workspace operator berhasil ditampilkan melalui HTTP di browser. Generasi provider tidak dijalankan; saldo kredit tidak diubah. Tidak ada migrasi database.
