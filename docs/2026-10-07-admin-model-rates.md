# Katalog model dan tarif admin — 7 Oktober 2026

Halaman `/admin/models` menampilkan model tanpa bergantung pada job. Navigasi admin dan tautan dari Economics mengarah ke halaman tersebut. Layout memakai AdminShell dan gaya admin bersama.

## Cakupan

Katalog diambil dari model Studio yang dipetakan ke jalur provider SaaS untuk text-to-image, image-to-image, text-to-video dan image-to-video: 87 varian operasi saat implementasi. Nama Studio dan ID provider tetap tersedia; pencarian menerima nama maupun ID (Gemini ditampilkan dengan nama Nano Banana sesuai Studio). Model legacy tanpa pemetaan SaaS tidak diklaim sudah memiliki tarif.

Contoh setiap baris adalah satu output: prompt 300 karakter, satu referensi untuk operasi image-to-image/image-to-video, resolusi/durasi default dari metadata, serta varian 480p mengikuti suffix Studio. Bila metadata resolusi tidak tersedia, memakai default mesin pricing dan ditampilkan sebagai contoh, bukan validasi kemampuan provider.

Detail memperlihatkan sumber tarif, kurs quote, markup, basis per gambar/per detik/per token dan estimasi token. Parameter simulasi dapat mengubah durasi, resolusi yang tercantum, panjang prompt, jumlah referensi serta audio. Simulasi tidak mengirim generation, mengubah harga, mengurangi kredit atau menyimpan job. Parameter mengikuti metadata katalog yang tersedia; API generator tetap menjadi validasi kemampuan provider yang sebenarnya.

`GET /api/admin/models` membutuhkan sesi, membership workspace dari `x-workspace-id`, dan allowlist operator server. `key` memilih varian, disertai parameter simulasi. Identitas operator diambil dari sesi. Data/error memakai private no-store, error internal disamarkan, dan model tak dikenal ditolak. Angka unknown tetap null.

Estimasi menggunakan `estimateGenerationCredits` yang sama dengan admission. Tidak menyalin tabel tarif ke komponen UI. Loader tetap memakai metadata publik OpenRouter dan kurs sebagaimana mesin pricing saat ini, dengan fallback tersimpan. Request metadata identik dalam satu pembacaan katalog digabung agar 87 quote tidak memicu 87 request jaringan. Helpers estimasi token diekspor tanpa perubahan rumus pricing.

## Batas laporan proyek

Halaman menampilkan penjelasan cakupan: gambar/video memiliki pencatatan biaya job; assets tambahan dan regenerasi revisi belum dikelompokkan per proyek. Brainstorm/storyline, editing dan transisi belum memiliki emitter biaya yang terhubung. Total COGS proyek belum dihitung dan komponen tersebut tidak dianggap nol. Tarif terkonfigurasi bukan invoice provider atau konfirmasi bahwa semua model tersedia untuk akun provider deployment.

## Verifikasi

38 tes katalog, izin, parameter, FX/markup, fallback, pricing snapshot serta frontend Economics lulus. Browser memeriksa daftar model dengan sesi operator, pencarian/filter Seedance, detail dan perubahan durasi dari 5 ke 15 detik. Lint root dan git diff whitespace lulus. Tidak ada generation berbayar atau migrasi database baru. Notion tidak tersedia; catatan disimpan di repository.
