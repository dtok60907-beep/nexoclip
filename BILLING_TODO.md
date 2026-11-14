# Billing, langganan & deal: catatan lanjutan

## Status 18–19 Okt 2026 (sudah tayang di production)

- ✅ **B. Kontrak enterprise** `50d7e9d`: kalkulator untung % di Admin → Business billing.
- ✅ **D. Dokumen** `ce7ec16`: penawaran, invoice, kuitansi (terbilang, e-meterai > Rp5 jt), konfirmasi
  aktivasi; profil perusahaan (nama PT, NPWP, rekening, penanda tangan) **masih kosong — isi dulu** di
  Admin → Business billing → "Profil perusahaan untuk dokumen".
- ✅ **C. Project & bagi hasil** `f670b0d`: Admin → Project & bagi hasil; modal AI otomatis dari workspace
  project; draf PKS (wajib cek konsultan hukum), BAST, rekap bagi hasil.
- ✅ **E. Impersonate** `547d96f`: Admin → Accounts → "Masuk sebagai user"; default lihat saja, 60 menit,
  tercatat di impersonation_sessions. Tambahkan klausul akses tim di S&K/Kebijakan Privasi.
- ✅ **A. Langganan** `e922385` — **MATI** sampai `SUBSCRIPTIONS_ENABLED=1` di Railway (ai-ugc-app).
  Harga draf di `src/services/subscriptionPlans.js`. Kredit bulanan hangus akhir bulannya; top-up tidak
  hangus dan hanya untuk subscriber saat flag nyala. Perpanjangan manual (belum ada auto-debit/email).
  Sebelum dinyalakan: final harga, update landing page, S&K langganan.
- Juga diperbaiki: semua aksi tulis admin ditolak 403 di balik proxy (cek Origin) — `50d7e9d`.

Sisa: masa berlaku kredit **kontrak enterprise** (sekarang tidak hangus), auto-debit, email pengingat,
tanda tangan digital, kirim dokumen via email.

---


Ditulis 18 Okt 2026. **Belum ada yang dieksekusi**, semua masih rencana.
Minta izin user dulu sebelum mulai mengerjakan.

## Status sekarang

- Hanya ada top-up kredit: Starter Rp149rb/750, Creator Rp399rb/2.200, Pro Rp899rb/5.400
  (`nexoclip-app/src/services/topupPackages.js`). Bayar lewat Pakasir, sekali bayar.
- Markup generate sama untuk semua orang: `CREDIT_MARKUP_PERCENT=60` (1,6x),
  `CREDITS_PER_USD=100`, kurs acuan Rp17.915 (`src/services/generationPricing.js`).
- Modal per kredit ± **Rp112**. Seedance 2.0 720p ± $0,153/detik = ± 24,5 kredit/detik.
- Admin backoffice sudah bisa memberi kredit manual ke workspace.
- Tabel `billing_plans` dan `workspace_subscriptions` sudah ada (migrasi 015), belum dipakai.
- Kredit belum punya tanggal kedaluwarsa.
- Pakasir: belum ditemukan dukungan auto-debit (perlu dicek).

## Tiga jenis client

| Jenis | Cara bayar | Cara hitung |
|---|---|---|
| **Enterprise** | Beli putus, bayar di depan | Nilai deal − untung % = modal, lalu diubah jadi kredit |
| **Project based** | Bagi hasil dengan agency per project besar | Nilai project − modal AI − biaya lain = laba, lalu dibagi |
| **End user** | Langganan monthly/yearly | Harga paket standar (markup 1,6x) |

Rumus penting: **markup = 1 ÷ (1 − untung %)**. Untung 30% dari harga = markup 1,43x.
Markup 1,6x = untung 37,5% dari harga. Selalu pakai istilah "untung % dari uang client".

## A. Langganan end user

Keputusan user (18 Okt):
- Ganti dari top-up ke langganan **monthly + yearly** untuk retensi.
- Kredit bulanan **hangus** di akhir periode (tanpa rollover).
- **Top-up hanya untuk subscriber** (sebagai tambahan).
- Perpanjangan **manual** tidak masalah kalau Pakasir tidak bisa auto-debit.

Tugas:
1. **Kredit punya masa berlaku (credit lot + expiry).** Pemakaian ambil dari lot yang paling cepat hangus.
2. **Paket langganan** di `billing_plans` (monthly & yearly). Yearly: kredit dibagi per bulan.
3. **Alur bayar & perpanjangan** via Pakasir + pengingat sebelum periode habis.
4. **Top-up dikunci untuk subscriber.**
5. **Halaman langganan di app** (pilih paket, status, tanggal perpanjangan, berhenti).
6. **Update landing page** (harga dan estimasi output di-hardcode di sana).

Draf angka (belum disetujui):

| Tier | Monthly | Kredit/bulan | Rp/kredit | Untung kotor |
|---|---|---|---|---|
| Starter | Rp149rb | 850 | Rp175 | +56% dari modal |
| Creator | Rp399rb | 2.400 | Rp166 | +48% |
| Pro | Rp899rb | 5.800 | Rp155 | +38% |

Yearly = harga 10 bulan (diskon ±17%). Pro yearly tipis (± +15%), perlu disesuaikan.

## B. Kontrak enterprise (beli putus) — ✅ sebagian, `50d7e9d` (18 Okt)

Dibangun di atas "Business billing" yang sudah ada (/admin/billing: invoice → tandai lunas → kredit masuk,
audit log). Ditambah: kalkulator untung % (kredit otomatis, untung Rp, peringatan < 15%, perkiraan menit
per model Seedance dan jumlah gambar), untung % + modal/kredit disimpan permanen di invoice.
Juga diperbaiki: semua aksi tulis admin (invoice, akses akun, review billing provider) ditolak 403 di
balik proxy karena cek Origin; belum pernah ada yang tersimpan di production.

Belum: masa berlaku kredit kontrak (kredit belum punya expiry), dokumen PDF (bagian D),
riwayat pemakaian per kontrak (saldo workspace sudah terlihat di Accounts).

### Rencana awal

Halaman admin **"Kontrak Enterprise"**:
1. Input: workspace, nilai deal, **untung %** (patokan: 37,5% normal, 30% menengah,
   20–25% deal besar, jangan di bawah ±15%), masa berlaku.
2. Preview otomatis: untung kita (Rp), kredit yang masuk, estimasi menit/output per model.
3. Setujui, lalu kredit masuk ke workspace (pakai mekanisme grant backoffice).
4. Riwayat per client: kredit terpakai, sisa, tanggal hangus.
5. Mesin harga generate **tetap 1,6x**. Untung % hanya mengubah jumlah kredit yang diberikan:
   kredit = (nilai deal × (1 − untung %)) ÷ Rp112.

## C. Project based (bagi hasil dengan agency)

Halaman admin **"Project & Bagi Hasil"**:
1. Data mitra agency (nama, rekening, persentase default).
2. Project: client akhir, nilai project, mitra, persentase bagi hasil, workspace untuk produksi.
3. **Modal AI tercatat otomatis** dari pemakaian kredit workspace project.
4. Rekap otomatis: nilai project − modal AI − biaya lain = laba, lalu dibagi per pihak.
5. Status pembayaran: client bayar, bagian agency dibayar.

## D. Dokumen otomatis dari panel admin (PDF)

Dibuat dari data kontrak/project, tinggal unduh atau kirim:

| Dokumen | Enterprise | Project | End user |
|---|---|---|---|
| Penawaran harga (quotation) | ✓ | ✓ | |
| Perjanjian layanan (order form + S&K) | ✓ | | |
| PKS bagi hasil + NDA (template sekali pakai berulang) | | ✓ | |
| Brief / lingkup kerja per project | | ✓ | |
| Invoice + kuitansi | ✓ | ✓ | ✓ (otomatis) |
| Konfirmasi aktivasi kredit | ✓ | | |
| BAST (berita acara serah terima) | | ✓ | |
| Laporan pemakaian kredit | ✓ | ✓ | |
| Rekap bagi hasil | | ✓ | |

Isi wajib:
- **Quotation:** catatan "estimasi menit mengikuti kurs". Janjikan sedikit di bawah angka sistem.
- **Perjanjian layanan:** kredit tidak bisa di-refund, masa berlaku, hak atas hasil, konten terlarang.
- **PKS:** modal AI dikembalikan dulu baru laba dibagi, siapa yang menagih client akhir,
  jadwal bayar bagi hasil, batas revisi, hak karya/portofolio, non-circumvention, pengakhiran.
- Nomor dokumen berurutan, data PT, tempat e-meterai (perjanjian, kuitansi > Rp5 jt).
- Penawaran memperhitungkan **PPh 23 (2%)** kalau client perusahaan.

End user (di app): S&K, Kebijakan Privasi, kebijakan langganan (hangus, berhenti, tanpa refund).

Alur di panel admin (satu halaman per deal, semua dokumen tersimpan di sana):
1. **Buat deal:** jenis (enterprise/project), data client, nilai deal, untung %.
2. **Quotation:** kredit & estimasi menit terisi otomatis, lalu unduh PDF.
3. **Deal disetujui:** perjanjian layanan / PKS dibuat dari data yang sama (tanpa ketik ulang).
4. **Tagih:** buat invoice. Tandai "lunas", lalu kuitansi keluar otomatis.
5. **Aktivasi:** kredit masuk ke akun client, lalu konfirmasi aktivasi keluar otomatis.
6. **Berjalan:** laporan pemakaian, BAST, rekap bagi hasil bisa diunduh kapan saja.
- Nomor dokumen otomatis berurutan. Riwayat semua dokumen per client.

Di luar sistem (tahap awal):
- **Tanda tangan & e-meterai:** unduh PDF, lalu tanda tangan dan e-meterai lewat layanan resmi
  (Peruri/meterai-elektronik). Integrasi tanda tangan digital nanti kalau deal sudah sering.
- **Pembayaran enterprise/project:** transfer bank, lalu tandai lunas manual di panel.
  Pakasir tetap untuk end user.
- **Kirim ke client:** manual via email/WhatsApp. Tombol "kirim email" nanti.

Template PKS sebaiknya dicek notaris/konsultan hukum sekali sebelum dipakai.

## E. Impersonate (admin masuk ke akun user)

Diminta user 18 Okt. Untuk support, cek kualitas hasil, dan keamanan.

1. Tombol **"Masuk sebagai user"** di admin, halaman Customers. Wajib isi alasan.
2. Sesi khusus: admin melihat app persis seperti user (project, canvas, hasil generate, saldo).
3. **Banner yang hanya terlihat admin:** "Kamu sedang sebagai X — Keluar".
4. **Default baca saja:** tidak bisa generate, top-up, ubah password/email, hapus project, billing.
   Opsi "izinkan aksi" (juga tercatat).
5. Sesi otomatis berakhir setelah 30–60 menit.
6. Tidak terlihat oleh user: tidak masuk daftar perangkat aktif, tidak mengubah "terakhir login".
7. **Audit log:** admin, akun yang dimasuki, alasan, mulai/selesai, halaman yang dibuka.
8. **Wajib disebut di S&K + Kebijakan Privasi** (UU PDP): tim dapat mengakses akun
   untuk support, cek kualitas, dan keamanan.

Belum diputuskan: default baca saja atau boleh aksi; siapa saja yang boleh impersonate.

## F. Temuan dari pembeli pertama (18 Okt)

Pembeli: `tredingbiru0011@gmail.com`, 17 Okt.
- Beli Starter + Creator (Rp548rb, 2.950 kredit), sisa 226,2 kredit.
- Hasil: 11 video Seedance 2.0 (95 detik) + 3 gambar. 1 video Kling gagal, kredit sudah dikembalikan.
- Modal provider ± Rp305rb ($16,92, kurs Rp18.015). Untung kotor ± Rp243rb (44%).

Yang perlu dicek:
1. ✅ (`45fde1a`, 18 Okt) **Video Studio tidak mengirim `resolution`.** Kredit dipesan dengan tarif 1080p,
   lalu disesuaikan setelah selesai. Contoh video 10 detik: dipesan 606,6, kembali 337,8,
   tagihan asli 268,8. User tidak rugi, tapi:
   - Estimasi harga di layar ± 2x lebih mahal dari tagihan asli, bisa menakuti user.
   - User dengan saldo cukup bisa ditolak "saldo kurang" karena pemesanan awal 2x lipat.
   Kirim resolusi yang dipilih (atau default 720p) supaya pemesanan sesuai.
2. ~~2 generate belum ditagih final~~: sudah dicek, itu 2 gambar Gemini 2.5 Flash
   (6,3 kredit, harga tetap) yang memang tidak perlu penyesuaian. Bukan bug.
3. Follow up `karyawanbosdd@gmail.com`: checkout Creator 14 Okt, tidak dibayar.
4. Hubungi pembeli pertama: minta masukan, pertimbangkan bonus kredit kecil.

## Belum diputuskan

1. Tier & harga langganan final, diskon yearly.
2. Saldo kredit user lama (saran: tidak ikut hangus).
3. Kredit top-up tambahan subscriber: hangus di akhir periode atau tetap berlaku selama berlangganan.
4. User baru tanpa kredit gratis: perlu tier coba murah (mis. Rp49rb bulan pertama)?
5. Enterprise: masa berlaku kredit (6/12 bulan?) dan apakah boleh top-up dengan untung % yang sama.
6. Kontrak dengan termin/cicilan atau satu kali bayar.
7. Pakasir: bisa auto-debit atau tidak.

## Urutan yang disarankan

1. B. Kontrak enterprise (kecil, langsung terpakai).
2. D. Dokumen untuk enterprise (quotation, perjanjian, invoice, konfirmasi aktivasi).
3. C. Project & bagi hasil + dokumennya.
4. A. Langganan (perubahan terbesar).

## Cara kerja

Sama seperti `DIRECTOR_TODO.md`: build di Docker lokal dulu, push ke `origin` dan
`railway-deploy`, minta izin sebelum generate berbayar.
