# Custom AI Video Production
## Estimasi Direct COGS — Seedance 2.0 & Seedance 2.5

**Dokumen untuk pembahasan awal dengan client**  
**Status:** Estimasi indikatif, bukan quotation final

---

## 1. Pendekatan Customized

Produksi video AI dilakukan secara customized, bukan berdasarkan paket tetap. Estimasi biaya disusun berdasarkan brief dan spesifikasi setiap project.

Faktor utama yang memengaruhi direct COGS:

- Model: Seedance 2.0 atau Seedance 2.5
- Resolusi output: 480p, 720p, 1080p, atau 4K
- Durasi output video
- Jumlah dan jenis reference image
- Ada atau tidaknya reference video
- Durasi reference video
- Jumlah output final
- Jumlah generation atau iteration
- Kompleksitas gerakan dan konsistensi visual
- Kebutuhan editing, upscale, compositing, audio, atau subtitle

---

## 2. Estimasi COGS API — Tanpa Reference Video

Estimasi berikut menggunakan output berdurasi **5 detik** dan berlaku untuk **satu successful generation**.

| Model | Resolusi | Estimasi COGS API / generation |
|---|---:|---:|
| Seedance 2.0 | 480p | USD 0,35 |
| Seedance 2.0 | 720p | USD 0,76 |
| Seedance 2.0 | 1080p | USD 1,87 |
| Seedance 2.0 | 4K | USD 3,89 |
| Seedance 2.5 | 480p | USD 0,514 |
| Seedance 2.5 | 720p | USD 1,156 |
| Seedance 2.5 | 1080p | USD 2,843 |

Biaya aktual dapat berubah mengikuti token consumption yang dilaporkan oleh API.

---

## 3. Estimasi COGS API — Dengan Reference Video

Estimasi berikut menggunakan output berdurasi **5 detik**.

| Model | Resolusi output | Durasi input video | Estimasi COGS API / generation |
|---|---:|---:|---:|
| Seedance 2.0 | 480p | 2–15 detik | USD 0,39–0,86 |
| Seedance 2.0 | 720p | 2–15 detik | USD 0,84–1,86 |
| Seedance 2.0 | 1080p | 2–15 detik | USD 2,06–4,57 |
| Seedance 2.5 | 480p | 2–30 detik | USD 0,553–2,152 |
| Seedance 2.5 | 720p | 2–30 detik | USD 1,244–4,838 |
| Seedance 2.5 | 1080p | 2–30 detik | USD 3,062–11,907 |

Durasi input video yang lebih panjang umumnya meningkatkan konsumsi token dan biaya generation.

---

## 4. Reference Image

Reference image tidak menggunakan skema tarif reference video. Namun, jumlah dan kompleksitas reference dapat meningkatkan kebutuhan iteration.

Untuk estimasi internal, faktor berikut dapat digunakan:

| Kondisi | Faktor estimasi terhadap base generation cost |
|---|---:|
| Tanpa reference image | 1,0× |
| 1–3 reference image | 1,0–1,2× |
| 4–8 reference image | 1,2–1,5× |
| Lebih dari 8 reference image | Technical review terlebih dahulu |

Faktor ini merupakan asumsi estimasi internal, bukan harga resmi API.

---

## 5. Rumus COGS

### Tanpa reference video

```text
COGS API = jumlah generation × estimasi biaya per generation
```

### Total direct COGS

```text
Total direct COGS = COGS API
                  + editing
                  + upscale atau enhancement
                  + audio atau voice-over
                  + storage atau rendering
                  + biaya operasional langsung lainnya
```

### Harga jual

```text
Harga jual = total direct COGS
           + production fee
           + margin
           + pajak, jika berlaku
```

---

## 6. Contoh Perhitungan Internal

**Brief contoh:**

- Model: Seedance 2.5
- Output: 720p, durasi 5 detik
- Reference image: 3 gambar
- Video final: 10
- Estimasi: 3 generation per video
- Tanpa reference video

```text
10 video × 3 generation × USD 1,156
= USD 34,68 estimasi COGS API
```

Nilai tersebut hanya merupakan estimasi direct API cost. Angka ini belum termasuk prompt development, art direction, seleksi hasil, review, editing, project management, dan margin perusahaan.

---

## 7. Data yang Dibutuhkan untuk Costing

Sebelum quotation final, sales perlu mengumpulkan:

- Model yang diinginkan
- Resolusi output
- Durasi setiap video
- Jumlah video final
- Jumlah reference image
- Durasi dan jumlah reference video
- Target kualitas visual
- Estimasi iteration atau tingkat eksplorasi
- Kebutuhan editing, audio, subtitle, dan upscale
- Deadline project

---

## 8. Ketentuan Estimasi

- Angka di dalam dokumen ini adalah estimasi direct COGS API.
- Estimasi bukan harga jual dan bukan quotation final.
- Satu video final dapat memerlukan beberapa generation.
- Generation yang berhasil tetapi tidak dipilih tetap dapat masuk ke biaya produksi.
- Generation yang gagal karena moderation umumnya tidak dikenakan biaya API.
- Perubahan konsep, reference utama, durasi, atau resolusi dapat mengubah estimasi.
- Harga final dikonfirmasi setelah brief dan reference material ditinjau.
- Biaya dalam USD dapat dikonversi ke Rupiah menggunakan kurs internal perusahaan.

---

## Disclaimer

Estimasi biaya dapat berubah mengikuti harga layanan, token consumption aktual, spesifikasi teknis, dan jumlah generation yang diperlukan. Client akan menerima quotation final setelah scope produksi disepakati.
