# NexoClip: audit COGS dan rancangan penjualan

Tanggal: 6 Oktober 2026. Status: rancangan, bukan perubahan tarif produksi.
Audit berdasarkan kode lokal; database, invoice provider, dan tarif eksternal belum diverifikasi.

## Kesimpulan

Fondasi pricing dan penjualan sudah ada, tetapi belum menjadi sistem unit economics yang lengkap. Masalah utama adalah konsistensi unit biaya, snapshot harga, biaya seluruh attempt, dan atribusi pendapatan dari kredit. Jangan memakai angka kredit sebagai biaya provider.

## Bukti implementasi

- `nexoclip-app/src/services/generationPricing.js`: biaya model berdasarkan token, gambar, durasi/resolusi; 100 kredit per USD, markup default 60%, faktor kurs relatif terhadap Rp17.915/USD. Ini referensi kode, bukan kurs pasar yang diverifikasi.
- `src/services/generationService.js`, `createImageGenerationJobWithReservation`: menyimpan `modelPrice.credits` sebagai `generation_jobs.estimated_cost`. `modelPrice.usd` tidak ikut disimpan oleh fungsi ini. Pricing version tersedia tetapi amount rule diganti hasil kalkulasi model.
- `src/queue/generationWorker.js`: meneruskan `job.estimated_cost` ke persistResult; berarti estimatedCost di jalur ini adalah kredit. Settlement membaca pricing/kurs saat selesai, dibatasi sebesar reservasi.
- `src/services/generationOutputService.js`: mengisi `provider_usage.actual_cost` dari `usage.cost`, sementara estimated_cost menerima nilai tadi. Kolom tidak menyatakan currency. Normalisasi `costUsd` dan token belum dilakukan di fungsi persistence ini.
- `src/db/migrations/013_generation_outputs_usage.sql`: provider_usage dan raw usage sudah tersedia. Worker yang diperiksa memanggil persistence dalam cabang sukses; belum membuktikan pencatatan semua attempt gagal/fallback.
- `src/services/topupService.js`: nominal dan kredit disimpan per order; grant melalui ledger idempotent setelah status gateway dikonfirmasi. Belum terlihat alokasi biaya pembayaran dan nilai kredit yang dipakai ke setiap job.
- `src/services/topupPackages.js`: empat paket aktif. Komentar menyebut margin Studio sekitar 33%, tetapi simulasi penuh memberi 27,19% sebelum biaya tambahan pada referensi kurs kode.
- `src/services/creditPricingService.js`: helper konversi terpisah tanpa markup/kurs. Perlu audit pemanggil sebelum penyatuan; keberadaan helper bukan bukti tagihan aktif salah.

## Simulasi paket sekarang

Asumsi: markup 1,6x, referensi kurs kode, semua kredit habis, tanpa efek pembulatan per job. Tidak menggunakan tarif provider live.

| Paket | Harga IDR | Kredit | IDR/kredit | Margin provider saja | Margin planning | Margin stress |
|---|---:|---:|---:|---:|---:|---:|
| Starter | 149.000 | 750 | 198,67 | 43,64% | 35,79% | 27,35% |
| Creator | 399.000 | 2.200 | 181,36 | 38,26% | 30,82% | 22,16% |
| Pro | 899.000 | 5.400 | 166,48 | 32,74% | 25,14% | 15,96% |
| Studio | 2.399.000 | 15.600 | 153,78 | 27,19% | 19,28% | 9,50% |

Planning: biaya pembayaran 2% + Rp2.000/order; biaya retry 5% dan infrastruktur variabel 3% dari biaya provider. Stress: 3% + Rp3.000/order; retry 15%, infrastruktur 5%. Semua tambahan ini ASUMSI, bukan tarif Pakasir atau pengukuran produksi. Retry berarti tambahan biaya, bukan persentase jumlah job gagal.

Margin planning/stress adalah margin kontribusi setelah delivery dan pembayaran, sebelum overhead tetap, pajak, akuisisi, support, dan refund komersial. Bukan laba bersih atau laporan akuntansi. Tidak mengandalkan kredit kedaluwarsa untuk laba.

Rumus simulasi:

```
provider_IDR = kredit_paket / (100 × markup) × kurs_referensi
delivery_IDR = provider_IDR × (1 + retry_ratio + infra_ratio)
payment_IDR = harga_paket × payment_ratio + fixed_fee
kontribusi = harga_paket - delivery_IDR - payment_IDR
margin = kontribusi / harga_paket
```

Untuk target kontribusi 40% pada asumsi planning dan jumlah kredit sekarang, multiplier minimum: Starter 1,719x; Creator 1,855x; Pro 2,011x; Studio 2,172x. Target 40% adalah parameter rancangan. Menaikkan multiplier memotong kredit lebih besar untuk semua pengguna; jangan menerapkannya otomatis atau mengubah janji kredit pelanggan lama tanpa kebijakan transisi.

## Rancangan COGS

Pisahkan tiga ukuran:

1. Estimasi untuk quote/admission dan reserve.
2. Biaya delivery aktual: semua attempt provider, worker, storage, dan egress yang dapat diatribusikan.
3. Kontribusi: nilai kredit yang dikonsumsi dikurangi delivery dan alokasi fee pembayaran. Overhead tetap dilaporkan terpisah.

Provider cost aktual nol harus dapat dicatat sebagai nol; nilai belum diketahui harus null dengan status `unknown`/`estimated`, bukan dipaksa nol. Harga jual tetap dapat mengikuti quote walaupun provider memberikan promo gratis.

Simpan snapshot quote immutable: provider/model, parameter, rate card version, sell policy version, FX dan waktu/sumber FX, estimasi provider USD, estimasi delivery IDR, kredit reservasi, dan masa berlaku quote. Settlement menggunakan kebijakan yang disetujui di snapshot; jangan mengambil markup dan FX terbaru untuk menagih job lama.

Tambahkan cost events tenant-scoped dan append-only: workspace_id, job_id, attempt_id, provider_request_id, component, quantity/unit, amount/currency, amount_idr, FX snapshot, source, certainty, incurred_at, idempotency_key. Koreksi menggunakan event adjustment. Bedakan estimasi dari aktual sehingga tidak dijumlahkan dua kali. Provider request yang sama dipoll ulang tidak membuat biaya tambahan.

Catat biaya request yang gagal tetapi ditagih, fallback, dan hasil yang datang setelah timeout. Kredit yang dikembalikan ke pelanggan tidak menghapus biaya tersebut. Jika biaya melewati quote, catat loss/variance dan gunakan untuk koreksi quote berikutnya; jangan menagih tambahan diam-diam.

Rekonsiliasi periodik dengan usage/invoice provider; laporkan coverage biaya aktual, unknown cost, variance estimasi, margin per model/provider/workspace, serta biaya gagal. Data null menghalangi klaim margin aktual lengkap.

## Rancangan skema penjualan

Tahap awal: kredit prabayar dengan katalog model dan estimasi kredit sebelum Generate. Pertahankan empat segmen paket sebagai bahan evaluasi; jangan menjual janji jumlah video/gambar tetap ketika biaya model berbeda.

- Tetapkan harga dasar kredit dan batas diskon berdasarkan biaya kredit maksimum, bukan bonus marketing terlebih dahulu.
- Versikan paket. Snapshot price, purchased credits, bonus credits, dan fee aktual pada order.
- Gunakan credit lots per pembelian dengan nilai IDR/kredit dan FIFO attribution ke konsumsi job. Refund job mengembalikan lot asal. Kredit gratis/promosi dilacak terpisah dengan anggaran biaya.
- Konsumsi sebagian paket mengalokasikan pendapatan dan fee pembayaran secara proporsional; jangan mencatat seluruh top-up sebagai revenue job pertama. Pengakuan akuntansi formal perlu kebijakan tersendiri.
- Definisikan sebelum peluncuran: masa berlaku, refund pembayaran, gagal generation, rollover, kuota storage/retensi, dan aturan penghapusan asset. Jangan mengandalkan asumsi expiry yang belum dijual kepada pengguna.
- Hitung guardrail dengan paket paling murah per kredit, biaya retry, payment fee, dan model mahal. Promosi tidak boleh melewati guardrail tanpa budget promo.

Tahap berikutnya: subscription dengan kredit bulanan dan manfaat platform (seat, storage, workflow), setelah data konsumsi tersedia. Kredit top-up dan bulanan harus punya aturan expiry/rollover terpisah. Hindari unlimited generation tanpa batas biaya yang terukur.

## Urutan implementasi yang diusulkan

1. Normalisasi unit: provider USD/IDR terpisah dari credits; persist estimasi USD; snapshot quote dan settlement.
2. Cost event seluruh attempt, unknown/zero handling, rekonsiliasi provider.
3. Credit lots dan atribusi pendapatan/fee; pisahkan gratis dan berbayar.
4. Dashboard operator unit economics beserta coverage dan variance.
5. Versi paket dan guardrail promosi; subscription sesudah data nyata tersedia.

Acceptance: replay tidak menggandakan cost/revenue; perubahan kurs/markup tidak mengubah quote lama; fallback/gagal tetap tercatat; refund mengembalikan lot asal; penggunaan paket diskon menghasilkan margin sesuai lot; missing usage ditandai unknown; angka biaya agregat cocok dengan invoice pada periode rekonsiliasi.

## Data yang diperlukan untuk keputusan harga final

Invoice/usage provider, tarif efektif termasuk diskon, biaya payment per metode dan penanggungnya, tagihan hosting/storage/egress, distribusi model/durasi/resolusi, biaya retry/fallback, biaya promo/refund, dan target kontribusi. Harga produksi belum diubah.

## Reproduksi

Jalankan `node scripts/simulate-cogs.mjs`. Simulator offline membaca paket dan referensi kurs kode, lalu menghasilkan tiga skenario. Ini simulasi unit economics, bukan verifikasi runtime aplikasi.
