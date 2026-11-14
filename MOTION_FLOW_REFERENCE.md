# Motion: alur referensi (web lain yang hasilnya bagus)

Dicatat 2026-10-29 dari contoh yang ditunjukkan user. Web itu tidak memanggil AI sendiri: tiap tahap memberi user
prompt untuk ditempel ke Claude, lalu balasan JSON Claude ditempel balik ke web. Tujuan kita: meniru alurnya di
Motion (AI kita yang menjalankan tiap tahap), bukan menyuruh user copy-paste.

Status: langkah 1, 2, dan 3 sudah dicatat (lihat "Langkah 3" di bawah). Kode scene contoh dari langkah 3 ada di
MOTION_FLOW_STEP3_EXAMPLES.js.

## Ringkasan alur

1. **Ide** – user isi topik/kata kunci (mis. "disiplin") → AI membuat 5 ide. Tiap ide sudah dikunci "bahan wajib":
   lensa metafora + jenis hook + nada (beda per ide), jadi kelima ide pasti berbeda.
   Output per ide: title, hook, angle, visualStyle (rumus: gaya + cahaya + palet + komposisi + metafora utama).
2. **Naskah** – user pilih satu ide (+ jumlah scene, catatan kreator mis. "tutup dengan ajakan follow") → AI menulis
   naskah scene per scene + background khusus + SEO YouTube.
3. **Animasi per scene** – untuk tiap scene AI menulis KODE JavaScript Canvas (isi `function (s, ctx) {...}`) yang
   menggambar dan menganimasikan "visual"-nya. Dikirim per kelompok (4 + 4 + 2 scene untuk 10 scene), dengan
   baris kesinambungan "Scene sebelum kelompok ini: <visual scene terakhir>". Engine mereka yang menggambar latar,
   teks narasi (mesin ketik), transisi, kamera, dan SFX otomatis; kode AI hanya ilustrasi + SFX benda.

## Yang membuat hasilnya bagus (dibanding Motion kita sekarang)

| # | Mereka | Motion kita (Okt 2026) |
|---|---|---|
| 1 | Tahap ide dulu, 5 ide dengan bahan dikunci (metafora/hook/nada) | Langsung rencana scene |
| 2 | Narasi = satu monolog utuh dipotong di jeda napas; scene boleh melanjutkan kalimat scene sebelumnya | Per scene (hook/heading/list), terasa seperti poster |
| 3 | Satu metafora benda nyata dipegang dari awal sampai akhir (mis. motor skuter oranye) | Tidak ada benang merah visual |
| 4 | "visual" = ilustrasi benda NYATA spesifik + ciri bentuknya, dirakit dari bentuk dasar, tanpa wajah, 1 objek utama + 2-3 pendukung | Hanya emoji Lottie + layer template |
| 5 | "emphasis": satu kata per scene; kamera menghentak/zoom tepat saat kata itu muncul; teks muncul seperti mesin ketik | Tidak ada |
| 6 | 11 gerakan kamera (push, pull, pan-left, pan-right, tilt-up, tilt-down, roll, orbit, crash, handheld, shake) + aturan variasi; shake/crash ≤ ~1 dari 4 scene | 4: push, pull, drift, still |
| 7 | Background khusus per video: 3 tema (paper terang / dusk menengah / night gelap), hex top+bottom + pattern; scene bergantian tema | Dari gaya (styles.js) |
| 8 | SEO YouTube: title ≤70 char kata kunci di depan, description 3-5 kalimat, 10-15 tags, 3-5 hashtags (#shorts otomatis) | Tidak ada |
| 9 | Durasi per scene 1.5-4.5 s ≈ 1 s + 0.28 s per kata; teks 4-12 kata | readingSeconds() |
| 10 | Aturan bahasa keras: daftar kata tinggi terlarang, larang puitis/slogan/klise, contoh kaku vs natural, alur hook → situasi nyata → sudut baru (metafora) → satu langkah konkret hari ini → penutup | Aturan hook/arc umum di motionCraft/motionSkills |

## Langkah 1: prompt ide (persis seperti contoh)

```text
Kamu adalah penulis konten video pendek motivasi berbahasa Indonesia (TikTok, Reels, Shorts, Threads) yang terkenal karena idenya selalu segar dan tidak pasaran.
Gaya video: ilustrasi gambar tangan ala krayon 2D, teks narasi muncul seperti mesin ketik. Nuansa: energik dan membakar semangat, ritme cepat, potongan scene pendek, banyak gerakan. Durasi 30-45 detik.

Saat diminta ide:
- Setiap ide punya pesan yang jelas dan bisa divisualkan dengan metafora benda nyata yang mudah dikenali.
- "visualStyle" ditulis lengkap dengan formula: [gaya] + [pencahayaan/suasana] + [palet warna] + [komposisi/kamera] + [metafora utama]. Contoh: "isometrik pastel, cahaya pagi lembut, mint dan peach, sudut atas 45 derajat, rak buku yang tersusun".
- Hook harus menohok dan bikin berhenti scroll dalam 1 detik pertama, bukan klise kosong.
- HINDARI metafora dan kalimat pasaran: tangga kesuksesan, tetesan air melubangi batu, kepompong jadi kupu-kupu, pohon dari biji kecil, gunung es, "proses tidak mengkhianati hasil", "1% setiap hari". Kalau memakai benda umum, beri sudut yang tak terduga.
- Setiap ide harus berbeda jelas satu sama lain: beda pesan, beda metafora, beda jenis hook.
- Bahasa Indonesia yang natural untuk anak muda, tidak alay. Judul, hook, dan pesan inti ditulis dengan kata-kata sederhana.
Bahasa SEDERHANA, harus langsung dipahami sekali dengar oleh siapa saja (anak SMP sampai orang tua):
- Pakai kata sehari-hari yang biasa diucapkan di obrolan. JANGAN pakai kata tinggi/serapan/akademis: esensi, eksistensi, paradigma, manifestasi, resiliensi, validasi, ekspektasi, transformasi, signifikan, fundamental, kontemplasi, hakikat, entitas, persepsi, narasi, fase, momentum, versi terbaik, potensi, makna hidup. Ganti dengan kata biasa (mis. "ekspektasi" -> "harapan", "konsisten" -> "terus-terusan", "validasi" -> "pengakuan orang").
- JANGAN puitis, filosofis, atau berbunga-bunga ("jiwa yang lelah", "langkah kecil menuju cahaya", "dirimu yang sejati"). Katakan maksudnya langsung.
- Satu kalimat satu maksud, pendek, susunan biasa (subjek-kata kerja-objek). Hindari kalimat bertingkat dan kiasan di dalam kiasan.
- Metafora boleh, tapi bendanya sehari-hari dan artinya langsung dijelaskan dengan kata biasa; penonton tidak boleh harus mikir untuk paham.

## Tugas
Buat 5 ide video motivasi pendek.
Topik / kata kunci: disiplin. Dekati topik ini dari sudut yang berbeda di setiap ide.

Bahan wajib per ide (ide ke-n memakai baris ke-n; boleh ditafsirkan kreatif, tapi jangan diganti):
1. lensa metafora "catur & strategi" · hook berupa mitos populer yang dipatahkan · nada tegas seperti pelatih
2. lensa metafora "pasar & tawar-menawar" · hook berupa perintah singkat 1-3 kata · nada tenang seperti ngobrol malam
3. lensa metafora "es batu & suhu" · hook berupa skenario "bayangkan kalau..." · nada tenang seperti ngobrol malam
4. lensa metafora "cuaca & badai" · hook berupa angka atau fakta yang mengejutkan · nada tegas seperti pelatih
5. lensa metafora "balon udara" · hook berupa percakapan imajiner dengan diri sendiri · nada hangat seperti kakak

## Format jawaban
Jawab HANYA dengan satu blok kode ```json berisi:
{
  "ideas": [
    {
      "title": "judul singkat",
      "hook": "kalimat pembuka yang bikin berhenti scroll",
      "angle": "pesan inti 1-2 kalimat",
      "visualStyle": "gaya + pencahayaan + palet + komposisi + metafora utama"
    }
  ]
}
Jangan gunakan artifact/canvas dan jangan menambahkan penjelasan di luar format yang diminta.
```

Catatan: "bahan wajib" (lensa metafora · jenis hook · nada) tampaknya diacak web itu dari daftar tetap tiap kali
generate. Jenis hook yang terlihat: mitos dipatahkan, perintah 1-3 kata, "bayangkan kalau...", angka/fakta
mengejutkan, percakapan imajiner dengan diri sendiri. Nada: tegas seperti pelatih, tenang seperti ngobrol malam,
hangat seperti kakak.

### Contoh balasan langkah 1

```json
{
  "ideas": [
    {
      "title": "Pion yang Tidak Takut Maju",
      "hook": "Katanya disiplin itu harus kuat dulu. Salah besar.",
      "angle": "Disiplin bukan soal kuat atau lemah. Disiplin itu punya rencana dan jalan satu langkah demi satu langkah. Pion cuma bisa maju satu kotak, tapi kalau sampai ujung papan, dia jadi ratu.",
      "visualStyle": "gambar tangan krayon 2D, cahaya lampu meja hangat dari samping, hitam, putih krem, dan oranye bara, sudut atas menghadap papan catur dengan kamera zoom ke satu pion, pion catur kecil yang berjalan pelan menembus barisan bidak besar sampai ujung papan"
    },
    {
      "title": "Harga Pas",
      "hook": "Bayar dulu.",
      "angle": "Semua yang kamu mau ada harganya, dan harganya dibayar di depan. Mau badan sehat, bayar dengan bangun pagi. Mau tabungan penuh, bayar dengan tahan jajan. Jangan menawar, karena penjualnya tidak pernah kasih diskon.",
      "visualStyle": "gambar tangan krayon 2D, lampu gantung kuning redup suasana pasar malam, merah bata, kuning lampu, dan biru tua, sudut sejajar mata di depan lapak dengan timbangan di tengah, penjual yang menggeleng setiap kali pembeli menawar harga"
    },
    {
      "title": "Es Batu di Gelas Kosong",
      "hook": "Bayangkan kalau es batu cuma mau mencair sedikit tiap hari. Hasilnya?",
      "angle": "Es batu tidak berubah karena sekali panas besar. Dia berubah karena suhu yang terus ada. Kebiasaanmu sama: yang penting suhunya terjaga tiap hari, bukan sekali semangat besar lalu padam.",
      "visualStyle": "gambar tangan krayon 2D, cahaya jendela sore yang tenang, biru muda, putih, dan jingga hangat, sudut dekat dari samping gelas dengan balon uap kecil, es batu di dalam gelas yang menyusut pelan di bawah lampu belajar"
    },
    {
      "title": "Hujan Tidak Tanya Kamu Siap atau Belum",
      "hook": "Dalam setahun, ada ratusan hari mendung. Kamu mau tunggu hari cerah terus?",
      "angle": "Kalau menunggu cuaca bagus, kamu hampir tidak pernah mulai. Orang disiplin tetap jalan saat hujan, tetap kerja saat mendung. Pakai jas hujan, lalu jalan.",
      "visualStyle": "gambar tangan krayon 2D, langit kelabu dengan kilat sesekali sebagai sorotan, abu gelap, biru tua, dan kuning jas hujan, sudut rendah dari jalan basah menatap ke depan, orang berjas hujan kuning yang tetap berjalan sementara orang lain berteduh"
    },
    {
      "title": "Buang Karungnya",
      "hook": "Kamu: \"Besok aja.\" Aku: \"Kemarin juga bilang gitu.\" Kamu: \"...\"",
      "angle": "Balon udara naik bukan karena ditiup kencang. Dia naik karena karung pemberatnya dibuang satu per satu. Karung kita adalah alasan, tunda-tunda, dan HP. Buang satu karung hari ini.",
      "visualStyle": "gambar tangan krayon 2D, cahaya fajar keemasan, jingga, ungu muda, dan krem, sudut dari bawah menatap keranjang yang naik ke langit, balon udara yang naik tiap satu karung pasir berlabel alasan dilempar keluar"
    }
  ]
}
```

## Langkah 2: prompt naskah (persis seperti contoh)

Bagian "Ide terpilih" di contoh masih berisi placeholder (judul singkat, hook, ...); di web aslinya diisi dari ide
yang dipilih.

```text
Kamu adalah penulis naskah video pendek motivasi berbahasa Indonesia. Gaya visual: ilustrasi gambar tangan ala krayon 2D, teks narasi muncul seperti mesin ketik. Nuansa: energik dan membakar semangat, ritme cepat, potongan scene pendek, banyak gerakan.
Kalau ada arahan gaya dari kreator, tulis setiap "visual" dan pilih "theme" mengikuti arahan itu.

Ubah ide yang dipilih menjadi narasi scene per scene.

## Cara menulis narasi (paling penting)
Tulis seperti orang yang NGOMONG LANGSUNG ke temannya, bukan seperti poster kata-kata mutiara. Bayangkan seluruh narasi dibaca sekali jalan tanpa melihat layar: harus terdengar seperti satu cerita utuh yang mengalir, jelas maksudnya, dan enak didengar.
- Tulis dulu narasinya sebagai satu monolog utuh di kepala, baru dipotong per scene di jeda napas yang wajar. Scene boleh berisi potongan kalimat yang dilanjutkan scene berikutnya.
- Panjang teks per scene: 4-12 kata. Ritmenya cepat, tapi tetap kalimat yang lengkap dan jelas. Kata tunggal ("Sekarang.") hanya sesekali untuk penekanan, maksimal 1-2 kali per video.
- Bahasa lisan anak muda yang natural: boleh "kamu", "gak", "udah", "aja", "kok", "sih", "tuh", "kan", "ya", "jujur", "padahal". Pakai kata sambung (karena, tapi, padahal, terus, makanya, jadi) supaya antar-scene nyambung.
- Bahasa SEDERHANA, langsung dipahami sekali dengar oleh siapa saja (anak SMP sampai orang tua). Tes: kalau ada kata yang jarang dipakai di obrolan warung kopi, ganti.
- Pakai kata sehari-hari yang biasa diucapkan di obrolan. JANGAN pakai kata tinggi/serapan/akademis: esensi, eksistensi, paradigma, manifestasi, resiliensi, validasi, ekspektasi, transformasi, signifikan, fundamental, kontemplasi, hakikat, entitas, persepsi, narasi, fase, momentum, versi terbaik, potensi, makna hidup. Ganti dengan kata biasa (mis. "ekspektasi" -> "harapan", "konsisten" -> "terus-terusan", "validasi" -> "pengakuan orang").
- JANGAN puitis, filosofis, atau berbunga-bunga ("jiwa yang lelah", "langkah kecil menuju cahaya", "dirimu yang sejati"). Katakan maksudnya langsung.
- Satu kalimat satu maksud, pendek, susunan biasa (subjek-kata kerja-objek). Hindari kalimat bertingkat dan kiasan di dalam kiasan.
- Metafora boleh, tapi bendanya sehari-hari dan artinya langsung dijelaskan dengan kata biasa; penonton tidak boleh harus mikir untuk paham.
- Konkret, bukan abstrak. Ganti kata besar ("kesuksesan", "potensi", "versi terbaik dirimu", "zona nyaman") dengan situasi nyata yang bisa dibayangkan: jam berapa, lagi ngapain, pegang apa, ngerasa apa.
- Jaga satu benang merah: metafora dari ide dipakai dari awal sampai akhir dan dijelaskan dengan jelas, bukan disebut sekilas lalu ditinggal.
- JANGAN: deretan slogan pendek tanpa hubungan, kalimat perintah beruntun ("Bangkit! Lawan! Gas!"), kalimat ala terjemahan, kata baku kaku ("adalah", "merupakan", "oleh karena itu", "sesungguhnya", "dirimu"), atau quote klise.
- Alur: hook yang langsung kena -> situasi nyata yang relatable -> sudut pandang baru (lewat metafora) -> satu langkah konkret yang bisa dilakukan hari ini -> penutup yang membekas dan bikin orang pengen langsung gerak.

Contoh beda kaku vs natural (jangan dipakai mentah-mentah, hanya untuk rasa bahasa):
- Kaku: "Berhenti menunda." / "Waktu terus berjalan." / "Mulai sekarang." / "Raih mimpimu."
- Terlalu tinggi: "Esensi perjalanan ini bukan tentang destinasi, melainkan transformasi dirimu." -> Sederhana: "Yang penting bukan cepat sampai. Tapi kamu jadi lebih kuat di jalan."
- Natural: "Kamu bilang besok aja," / "padahal kemarin juga bilang gitu." / "Masalahnya bukan kamu malas," / "tapi langkah pertamanya kegedean." / "Jadi kecilin aja:" / "buka laptopnya dulu. Itu doang."
- "visual": deskripsi ilustrasi KONKRET + gerakannya, untuk kanvas vertikal 9:16. Gerakan tenang dan jelas. Sebut benda NYATA yang dimaksud teks secara spesifik (motor, HP, celengan, laptop, kunci) lengkap dengan ciri khas bentuknya (mis. "motor skuter oranye: dua roda, jok cokelat, stang, lampu depan bulat"), karena objek akan dirakit dari banyak bentuk dasar dan harus langsung dikenali. JANGAN menggantinya dengan bentuk abstrak atau cuma sebagiannya (motor jangan jadi roda saja). Hindari manusia detail; pakai benda dan metafora. TANPA WAJAH: jangan menggambar mata, hidung, atau mulut pada benda apa pun. Satu objek utama + maksimal 2-3 objek pendukung.
- "theme": "paper" = latar krem (default), "night" = biru malam bertekstur (sunyi/merenung), "dusk" = langit senja (kota/harapan). Selingi agar tidak monoton.
- "duration": 1.5 - 4.5 detik (kira-kira 1 detik + 0.28 detik per kata).
- "emphasis": SATU kata terpenting dari "text" (tulis persis seperti di teks) untuk di-highlight. Kamera akan menghentak/zoom tepat saat kata ini muncul.
- "camera": gerakan kamera scene ini, pilih id yang paling cocok dengan isi dan emosinya:
  - "push": mendekat pelan ke objek; membangun fokus/ketegangan
  - "pull": mundur dari dekat; reveal, lega, gambaran besar
  - "pan-left": kamera menyapu ke kiri; perjalanan, waktu berjalan
  - "pan-right": kamera menyapu ke kanan; maju, progres
  - "tilt-up": kamera naik; harapan, bangkit, target
  - "tilt-down": kamera turun; jatuh, beban, kenyataan
  - "roll": frame berputar miring; bingung, dunia terbalik, overthinking
  - "orbit": kamera mengayun kiri-kanan; ragu, menimbang pilihan
  - "crash": zoom kilat + hentakan; kejutan, tamparan kenyataan
  - "handheld": goyang tangan alami; jujur, curhat, dekat
  - "shake": frame bergetar keras; benturan, gagal, ledakan, marah, panik
  Buat kameranya dinamis: scene berurutan JANGAN memakai gerakan yang sama, pakai banyak variasi sepanjang video. Pakai "shake" atau "crash" untuk momen benturan/kaget/gagal/ledakan, tapi jangan lebih dari sekitar 1 dari 4 scene supaya tetap terasa menghentak.

## Ide terpilih
- Judul: judul singkat
- Hook: kalimat pembuka yang bikin berhenti scroll
- Pesan: pesan inti 1-2 kalimat
- Gaya visual: gaya + pencahayaan + palet + komposisi + metafora utama

## Tugas
Tulis narasi sebanyak 10 scene.
Catatan tambahan dari kreator: tutup dengan ajakan follow

## Latar
Desain latar khusus untuk video ini (unik, jangan pakai warna generik): 3 versi yang dipakai sebagai tema scene.
- "paper" = versi terang (teks gelap harus terbaca), "dusk" = versi menengah/berwarna, "night" = versi gelap (teks terang harus terbaca).
- Warna "top" dan "bottom" (hex) membentuk gradasi; selaraskan dengan gaya "Scribble 2D" dan suasana pesan video.
- "pattern" salah satu: none, dots, grid, bigGrid, lines, stars, halftone, grain, chalk, wash, horizon, sunburst, mist, hud, stripes, dotsup, neonwave, slash, hills, peaks, house, dither, washi, plate, sunset, film, room, deepgrid, shore, craft, softgrid, ridge.

## SEO YouTube ("seo")
Metadata upload YouTube supaya video ini mudah ditemukan lewat pencarian dan saran video. Tulis dalam bahasa video ini, untuk penonton yang mengetik di kolom cari YouTube.
- Tentukan dulu 1 KATA KUNCI UTAMA: frasa 2-4 kata yang benar-benar diketik orang saat mencari topik ini (mis. "cara berhenti overthinking", "motivasi kerja keras", "tips hemat uang"), bukan istilah puitis.
- "title": maksimal 70 karakter, kata kunci utama di awal, lalu alasan untuk mengklik (manfaat, angka, atau rasa penasaran) yang jujur sesuai isi video. Tanpa huruf kapital semua, tanpa hashtag, tanpa emoji berlebihan (maksimal 1).
- "description": 3-5 kalimat. Kalimat pertama memuat kata kunci utama dan menjelaskan apa yang didapat penonton (dua baris pertama tampil di hasil pencarian). Lalu ringkasan isi dengan 2-3 kata kunci turunan secara alami, dan ajakan penutup (simpan, bagikan ke teman yang butuh, follow). Jangan menyalin narasi kata per kata, jangan menumpuk kata kunci.
- "tags": 10-15 kata kunci, campuran: kata kunci utama, variasi dan sinonimnya, frasa panjang yang spesifik (long-tail), dan 2-3 topik umum. Huruf kecil, tanpa "#", total di bawah 400 karakter.
- "hashtags": 3-5 hashtag paling relevan (tanpa spasi), dari yang paling spesifik ke yang umum. "#shorts" ditambahkan otomatis, jangan ditulis.

## Format jawaban
Jawab HANYA dengan satu blok kode ```json berisi:
{
  "title": "judul video",
  "seo": {
    "title": "judul YouTube yang dicari orang",
    "description": "deskripsi YouTube",
    "tags": ["kata kunci", "..."],
    "hashtags": ["#katakunci", "..."]
  },
  "background": {
    "paper": { "top": "#hex", "bottom": "#hex", "pattern": "dots" },
    "dusk": { "top": "#hex", "bottom": "#hex", "pattern": "grid" },
    "night": { "top": "#hex", "bottom": "#hex", "pattern": "stars" }
  },
  "scenes": [
    {
      "text": "teks narasi di layar",
      "visual": "deskripsi ilustrasi dan gerakannya",
      "theme": "paper" | "night" | "dusk",
      "duration": 2.2,
      "emphasis": "kata",
      "camera": "push"
    }
  ]
}
Jangan gunakan artifact/canvas dan jangan menambahkan penjelasan di luar format yang diminta.
```

### Contoh balasan langkah 2

```json
{
  "title": "Nyalain Mesinnya Dulu",
  "seo": {
    "title": "cara berhenti menunda pekerjaan, cukup 5 menit hari ini",
    "description": "Cara berhenti menunda pekerjaan itu sederhana: kecilkan langkah pertamanya jadi cuma 5 menit. Video motivasi singkat ini pakai perumpamaan motor yang mesinnya masih dingin, supaya kamu paham kenapa susah mulai dan apa yang bisa dilakukan hari ini. Cocok buat kamu yang sering bilang besok aja, lagi malas mulai, atau butuh semangat kerja. Simpan videonya, bagikan ke teman yang lagi suka menunda, dan follow buat semangat tiap hari.",
    "tags": ["cara berhenti menunda", "cara berhenti menunda pekerjaan", "motivasi berhenti menunda", "cara mulai tanpa malas", "tips anti menunda", "kenapa susah mulai", "motivasi semangat kerja", "cara mengatasi rasa malas", "mulai dari 5 menit", "langkah pertama itu yang paling berat", "motivasi pagi", "video motivasi pendek", "motivasi anak muda", "semangat kerja"],
    "hashtags": ["#berhentimenunda", "#motivasi", "#semangat", "#tipsproduktif"]
  },
  "background": {
    "paper": { "top": "#FFF1D6", "bottom": "#FFD9A0", "pattern": "craft" },
    "dusk": { "top": "#FF8A5B", "bottom": "#6B3FA0", "pattern": "sunset" },
    "night": { "top": "#1B2A4A", "bottom": "#0B1226", "pattern": "stars" }
  },
  "scenes": [
    { "text": "Kamu bilang mulai besok aja,", "visual": "Kalender dinding kotak putih dengan angka tanggal besar. Satu lembar tanggal terlepas dan melayang keluar kanvas, lembar baru langsung jatuh menggantikannya dengan bunyi gerakan goyang kecil.", "theme": "paper", "duration": 2.4, "emphasis": "besok", "camera": "handheld" },
    { "text": "padahal kemarin kamu juga bilang gitu.", "visual": "Banyak lembar kalender kusut bertuliskan coretan 'besok' beterbangan berurutan dari kanan ke kiri, tertiup angin, satu per satu keluar layar.", "theme": "night", "duration": 2.7, "emphasis": "kemarin", "camera": "pan-left" },
    { "text": "Masalahnya bukan kamu malas.", "visual": "Kertas dengan tulisan besar 'MALAS' dicoret tanda silang merah tebal ala krayon. Tulisan itu retak dan pecah jadi serpihan kecil yang jatuh ke bawah.", "theme": "paper", "duration": 2.1, "emphasis": "malas", "camera": "crash" },
    { "text": "Kamu tuh kayak motor yang mesinnya masih dingin.", "visual": "Motor skuter oranye di tengah kanvas: dua roda hitam, jok cokelat, stang, lampu depan bulat mati. Uap dingin berwarna biru muda mengepul pelan dari bodi motor, motor diam tak bergerak.", "theme": "dusk", "duration": 3.2, "emphasis": "dingin", "camera": "push" },
    { "text": "Susah distarter di awal, tapi begitu nyala,", "visual": "Motor skuter oranye yang sama bergetar hebat, asap putih tersembur dari knalpot, lampu depan bulat berkedip kuning lalu menyala terang tepat di akhir kalimat.", "theme": "night", "duration": 3.0, "emphasis": "nyala", "camera": "shake" },
    { "text": "jalannya enteng banget, kamu tinggal gas.", "visual": "Motor skuter oranye melaju mulus ke kanan di jalan lurus, lampu depan menyala, garis-garis kecepatan putih di belakangnya, awan kecil melintas di langit senja.", "theme": "dusk", "duration": 2.7, "emphasis": "enteng", "camera": "pan-right" },
    { "text": "Jadi jangan mikirin sampai tujuan dulu.", "visual": "Kamera mundur memperlihatkan jalan panjang berkelok naik ke bukit jauh dengan bendera finish kecil di puncak. Motor oranye tampak mungil di ujung jalan paling bawah.", "theme": "paper", "duration": 2.7, "emphasis": "tujuan", "camera": "pull" },
    { "text": "Hari ini cukup nyalain mesinnya. Lima menit aja.", "visual": "Kunci motor perak dengan gantungan merah diputar pelan di lubang kunci. Di sebelahnya jam dinding bulat dengan jarum menunjuk tepat lima menit, bagian lima menit diwarnai kuning.", "theme": "dusk", "duration": 3.2, "emphasis": "Lima", "camera": "push" },
    { "text": "Buka laptopnya, tulis satu kalimat. Itu doang.", "visual": "Laptop abu terbuka di atas meja kayu, layar putih kosong dengan kursor berkedip. Satu baris tulisan muncul seperti mesin ketik, lalu tanda centang hijau besar muncul di sampingnya.", "theme": "paper", "duration": 3.0, "emphasis": "satu", "camera": "handheld" },
    { "text": "Kalau kamu mau terus nyala, follow aku ya.", "visual": "Motor skuter oranye menyala terang di tengah, lampu depan memancar. Tombol bulat merah bertuliskan 'FOLLOW' dengan tanda plus melompat-lompat di atasnya, lalu bintang-bintang krayon kuning meletup ke atas.", "theme": "dusk", "duration": 3.2, "emphasis": "follow", "camera": "tilt-up" }
  ]
}
```

Catatan: contoh balasan ini (motor, "Nyalain Mesinnya Dulu") bukan dari ide-ide di langkah 1 di atas; ide
terpilih di contoh prompt masih placeholder.

## Langkah 3: kode animasi per scene

### Pengamatan penting

- **Voiceover dibuat SEBELUM langkah 3.** Tiap scene di prompt membawa "Waktu kata diucapkan" (detik per kata) dan
  durasi baru (mis. scene 1: 2.4 di naskah → 2.09; scene 2: 2.7 → 2.97). Jadi urutannya: naskah → TTS dengan
  timestamp per kata (ElevenLabs bisa) → durasi scene = panjang audio → baru kode animasi, dengan aksen tepat di
  kata penting.
- **Engine mereka punya API `s` sendiri** (gambar krayon: outline bergoyang `wobble`, isian bertekstur `hatch`,
  `draw` untuk efek digambar progresif + `pen`), easing (`at`, `pop`, `ease.*`, `wave`, `rand` deterministik),
  efek (`burst`, `rays`, `sparkle`, `glow` titik pemandu mata, `ground`), `group` untuk transformasi, `text`
  tulisan tangan, palet `s.c` yang ikut tema (ink jadi terang di tema gelap), dan `s.sfx(name, time, gain, pitch)`
  dengan ±50 nama SFX (suara berulang otomatis naik nada; warna suara ikut gaya).
- **Engine yang mengurus**: latar (dari "background" langkah 2), teks narasi mesin ketik di bawah y=860,
  transisi, gerakan kamera (dari "camera"), whoosh transisi, boom awal scene, tick per kata.
- **Kanvas** 720×1280, area ilustrasi y 120–800, x 40–680, tanah y=760, pusat (360,470). 30fps, tanpa state
  antar frame (semua dari `s.t`), tanpa Math.random/DOM/fetch.
- **Aturan gaya**: objek utama masuk dalam 0–0.35 dtk, tidak ada momen diam, klimaks di 55–80% durasi, aksen
  di waktu kata penting, semua animasi selesai sebelum dur−0.25; tanpa wajah sama sekali; objek dirakit dari
  5–15 bentuk dasar dalam satu `group`; ±160 baris per scene.
- **Batch + kesinambungan**: scene 4/4/2 per prompt; tiap batch diberi visual scene terakhir batch sebelumnya.
  Di hasilnya, Claude menyalin fungsi `scooter()` yang sama ke scene 5, 6, 7 supaya motornya konsisten.
- **Biaya**: 3 panggilan LLM besar (output kode ±150 baris × 10 scene). Perlu dihitung kredit-nya.

### Yang perlu kita bangun untuk meniru ini (catatan awal)

1. Engine `s` di dalam komposisi Remotion (Canvas per frame dari `useCurrentFrame()`), dengan gaya krayon,
   SFX terjadwal, tema, kamera, teks mesin ketik.
2. Menjalankan kode buatan AI dengan aman: di browser (pratinjau) dan di render server. Kode tidak boleh
   menyentuh DOM/jaringan; perlu sandbox (mis. iframe sandbox / Worker + OffscreenCanvas, batas waktu per frame)
   dan validasi sebelum disimpan.
3. Pipeline: ide → naskah → TTS timestamp → durasi → kode per batch → pratinjau → render MP4.

### Template prompt langkah 3

Sama persis untuk setiap batch; yang berubah hanya bagian "## Tugas" (jumlah scene, baris kesinambungan,
daftar scene) dan penanda scene di "## Format jawaban". Teks lengkap batch pertama:

```text
Kamu adalah animator motion graphics yang menulis kode JavaScript untuk menggambar satu scene animasi procedural di HTML Canvas, gaya ilustrasi krayon gambar tangan (outline tinta bergoyang, isian krayon bertekstur).

## Kontrak
Tulis HANYA isi body fungsi `function (s, ctx) { ... }`. Fungsi ini dipanggil setiap frame (30fps). Jangan menyimpan state antar frame; semua posisi dihitung dari waktu `s.t`. Jangan pakai `Math.random()` (gunakan `s.rand(i)`), jangan akses DOM/window/fetch, jangan pakai loop tak terbatas. Latar, teks narasi, transisi, dan gerakan kamera sudah diurus engine - jangan digambar.

## Kanvas
- Ukuran 720 x 1280 (vertikal). Origin kiri atas.
- Area ilustrasi: y 120 - 800, x 40 - 680. Pusat ilustrasi kira-kira (360, 470).
- Garis tanah standar di y = 760.
- JANGAN menggambar di bawah y = 860: area itu dipakai teks narasi.

## Waktu & easing
- `s.t` detik sejak scene mulai, `s.dur` durasi scene, `s.p` = progres 0..1.
- `s.at(start, len = 0.6)` -> 0..1 dengan ease-out, mulai di detik `start` selama `len` detik.
- `s.pop(start, len = 0.5)` -> 0..~1.1..1 (efek membal; cocok untuk scale/`draw` saat objek muncul).
- `s.ease.out(x)`, `s.ease.inOut(x)`, `s.ease.back(x)`, `s.ease.elastic(x)`.
- `s.lerp(a, b, k)`, `s.clamp(x, a, b)`, `s.wave(freq = 1, amp = 1, phase = 0)` = sin berbasis waktu, `s.rand(i)` -> 0..1 deterministik.

## Menggambar 2D
Opsi `o` (opsional): `{ fill, stroke, width, alpha, draw, wobble, hatch }`
- `fill` warna isian, `stroke` warna outline (default tinta; `"none"` tanpa outline), `width` tebal (default 3), `alpha` 0..1,
- `draw` 0..1 menggambar outline progresif (isian ikut muncul), `wobble` goyangan garis (default 1), `hatch` tekstur isian (default true).
- `pen: true` (atau warna) = titik cahaya di ujung garis selama `draw` < 1, seolah garisnya sedang digambar pena cahaya.

- `s.line(x1, y1, x2, y2, o)`, `s.polyline([[x, y], ...], o)`, `s.shape([[x, y], ...], o)` (poligon tertutup)
- `s.curve([[x, y], ...], o)` kurva halus (`o.closed = true` untuk tertutup)
- `s.rect(x, y, w, h, o)` (`o.r` radius), `s.circle(cx, cy, r, o)`, `s.ellipse(cx, cy, rx, ry, o)`, `s.arc(cx, cy, r, a0, a1, o)`
- `s.text(str, x, y, o)` tulisan tangan (`o.size`, `o.color`, `o.align`)
- `s.check(x, y, size, o)`, `s.cross(x, y, size, o)`, `s.dash(x1, y1, x2, y2, o)`
- `s.sparkle(x, y, size, o)`, `s.rays(cx, cy, r1, r2, count, o)`, `s.burst(x, y, r, { draw, count, stroke })`
- `s.burst` = ledakan garis energi sekilas: tidak terlihat sebelum `draw` naik dari 0, memancar, lalu hilang sendiri saat `draw` = 1. Pasang tepat di momen objeknya mendarat/muncul/meledak, mis. `draw: s.at(0.9, 0.4)` kalau objek mendarat di detik 0.9.
- `s.rays` (sinar diam) tampil penuh sejak awal scene kalau tidak diberi `draw`/`alpha`. Munculkan bersamaan dengan objek yang bersinar: `draw: s.at(t0, 0.4)` atau `alpha` yang ikut objeknya. Efek tidak boleh muncul lebih dulu dari objeknya.
- `s.ground(y = 760, x1 = 60, x2 = 660, o)`
- `s.group({ x, y, rotate, scale, alpha }, () => { ... })` transformasi relatif (koordinat lokal, 0,0 = x,y).
- SEMUA sudut dalam RADIAN, bukan derajat: `rotate` (group, text3d, photo, tag) dan `rx/ry/rz`. 0.1 ≈ 6°, 0.3 ≈ 17°, Math.PI = 180°. Miring kecil: `rotate: -0.08`; goyang halus: `rotate: s.wave(2, 0.06)`; putar masuk sekali: `rotate: (1 - e) * Math.PI * 2`. Jangan menulis `rotate: -8` atau `* 360`.

Palet (`s.c`): ink, paper, red, pink, orange, yellow, green, teal, blue, navy, purple, brown, sky, white, gray, glow. Boleh hex.
`s.theme` = "paper" | "night" | "dusk". Di tema gelap `s.c.ink` otomatis terang. `ctx` = CanvasRenderingContext2D mentah (jarang perlu).

## Efek suara
`s.sfx(name, time, gain = 1, pitch)` menjadwalkan efek suara pada detik `time` scene ini. WAJIB dipanggil di level atas kode (tanpa if/kondisi waktu) karena dikumpulkan sekali, bukan per frame. `pitch` opsional: pengali nada (0.5 = satu oktaf lebih rendah untuk benda besar/berat, 1.5-2 = lebih tinggi untuk benda kecil/ringan).
PILIH SUARA YANG SESUAI BENDANYA, bukan selalu "pop":
- Gerak umum: "pop" (objek muncul/membal), "tick" (detail kecil), "click" (centang/tombol), "tap" (ketukan ringan), "thud" (benda berat mendarat), "boing" (memantul seperti per), "swish" (gerak cepat), "whoosh", "boom" (hantaman), "rise" (ketegangan ~0.8 dtk sebelum klimaks), "ding" (pencapaian), "sparkle" (kilau).
- Suara benda: "coin" (koin/uang/poin), "cash" (kasir, transaksi, harga), "type" (ketikan keyboard, panggil beberapa kali berurutan), "shutter" (kamera/foto), "heart" (detak jantung), "tock" (jam berdetak), "rocket" (roket/mesin meluncur, ~1.2 dtk), "notify" (notifikasi HP/pesan), "drop" (tetesan air), "paper" (kertas), "chalk" (kapur/menulis), "beep" (layar digital), "blip" (game 8-bit), "laser" (sci-fi), "step" (langkah kaki), "pageflip" (halaman dibalik), "bubble" (gelembung/pop lucu kecil), "snap" (jentik jari, ide muncul), "clap" (tepuk tangan).
- Hentakan & umpan balik: "impact" (hantaman sinematik untuk momen besar), "kick" (dentum bass pendek, cocok untuk angka/teks yang menghentak), "riser" (ketegangan ~0.9 dtk; jadwalkan 0.9 dtk SEBELUM momen puncak), "swipe" (geser cepat/kartu masuk), "whip" (cambuk/gerak sangat cepat), "glitch" (error digital, layar rusak), "stamp" (stempel/cap mendarat), "slide" (peluit naik, lucu), "scratch" (piringan tergores: "tunggu dulu"/plot twist), "buzzer" (salah/gagal/larangan), "correct" (benar/berhasil), "tada" (hasil akhir/pengumuman), "magic" (transformasi/keajaiban).
Suara yang sama yang diulang cepat (mis. balok tangga, tumpukan koin) otomatis naik nadanya seperti tangga nada, dan warna suara menyesuaikan gaya animasi secara otomatis.
Whoosh di transisi, boom di awal scene, dan tick saat kata teks muncul SUDAH otomatis - jangan ditambahkan lagi di detik 0. Pakai 1-4 efek per scene, selaras dengan gerakan.

## Arahan gaya
- Komposisi bersih, objek utama besar (lebar 200-420px), banyak ruang kosong, isian lembut dengan outline tinta.
- `s.glow(x, y)` = titik hijau bercahaya pemandu mata; satu per scene, menyorot objek penting.
- RITME ENERGIK: objek utama sudah MASUK dalam 0.0-0.35 dtk (membal dengan `s.pop`, jatuh dari atas, atau terbang dari samping).
- Sebar momen gerakan di SEPANJANG durasi scene, jangan dihabiskan di awal. Kalau ada "Waktu kata diucapkan", taruh aksen (pop, burst, centang, perubahan) tepat saat kata pentingnya terdengar.
- Tidak boleh ada momen diam: selalu ada rotasi, bounce, pulsa, atau getar. Klimaks/aksen di sekitar 55-80% durasi.
- Hitung waktu relatif terhadap `s.dur` bila perlu (mis. `s.at(s.dur * 0.6)`). Semua animasi masuk selesai sebelum `s.dur - 0.25`.

## Orang & wajah
- Utamakan benda dan metafora visual, hindari manusia detail. Kalau sebuah scene benar-benar butuh orang, gambar dengan caramu sendiri secara sederhana dan menyatu dengan gaya (siluet, figur garis, tangan memegang benda, bayangan), bukan tokoh yang sama terus.
- TANPA WAJAH sama sekali: jangan menggambar mata, hidung, mulut, alis, atau pipi merona pada manusia, hewan, maupun benda (matahari, HP, jam, makanan tidak diberi muka/ekspresi). Perasaan ditunjukkan lewat pose tubuh, gerakan, warna, dan simbol (tanda tanya, awan hujan, hati, garis gerak).
- Jangan menggambar emoji wajah/smiley dalam bentuk apa pun.
- Aturan tanpa wajah ini MENANG atas arahan gaya: kalau arahan gaya atau brief menyebut "tersenyum", "imut", atau ekspresi, wujudkan lewat warna, bentuk, dan gerak, tetap tanpa mata/mulut.

## Objek harus langsung dikenali
- Gambar benda yang disebut di brief sebagai benda itu sendiri, BUKAN diganti bola/kubus polos atau cuma salah satu bagiannya. Motor harus terlihat motor, HP terlihat HP.
- Rakit objek dari 5-15 bentuk dasar sesuai bagian-bagian khasnya (roda, badan, jok, stang, lampu; layar, tombol, kamera; dst.), pakai sudut pandang yang paling mudah dikenali (biasanya samping atau 3/4).
- Bungkus semua bagian satu objek di `s.group({ x, y, rotate, scale }, () => { ... })` supaya bergerak bersama; koordinat x/y bagian relatif ke posisi group.
- Satu objek utama yang detail lebih baik daripada banyak objek polos.
- Kode rapi, maksimal sekitar 160 baris.

## Bebas berkreasi (bikin keren, jangan template)
- Kamu art director sekaligus animator. Setiap scene harus terasa dirancang, bukan pola yang diulang: ganti komposisi (close-up besar, wide, dari atas, objek terpotong tepi layar), skala, dan arah gerak antar scene.
- Cari metafora visual yang segar dan tak terduga untuk pesannya, bukan ilustrasi harfiah yang membosankan.
- Bangun kedalaman: lapisan depan/tengah/belakang, bayangan, parallax kecil, partikel, cahaya. Boleh `ctx` mentah untuk gradient, glow (`shadowBlur`), dan blend, asal dibungkus `ctx.save()`/`ctx.restore()` dan tetap selaras dengan gaya.
- Gerak yang punya rasa: antisipasi sebelum bergerak, overshoot lalu menetap, gerakan yang saling menyusul, beberapa elemen tetap hidup pelan setelah masuk.
- Kata kunci boleh jadi tipografi bergerak (text3d / tag) bila menguatkan, tapi jangan menggandakan subtitle.

## Contoh (scene "kebiasaan kecil" - kalender dicentang)
```js
const cx = 360;
s.ground();
const k = s.pop(0, 0.6);
s.group({ x: cx, y: 470, scale: k }, () => {
  s.rect(-190, -170, 380, 330, { fill: s.c.white, r: 10 });
  s.rect(-190, -170, 380, 70, { fill: s.c.red, r: 10 });
  s.text("kebiasaan", 0, -125, { size: 30, color: s.c.white });
  const cols = [s.c.yellow, s.c.green, s.c.sky, s.c.pink, s.c.orange];
  for (let i = 0; i < 14; i++) {
    const col = i % 7, row = Math.floor(i / 7);
    const x = -170 + col * 50, y = -80 + row * 55;
    const a = s.at(0.6 + i * 0.12, 0.3);
    if (a <= 0) continue;
    s.rect(x, y, 42, 42, { fill: cols[i % cols.length], alpha: a, r: 4 });
    s.check(x + 21, y + 22, 26, { draw: s.at(0.75 + i * 0.12, 0.25) });
  }
});
s.sfx("click", 0.8, 0.6);
const gi = s.clamp(Math.floor((s.t - 0.6) / 0.12), 0, 13);
s.glow(cx - 170 + (gi % 7) * 50 + 21, 470 - 80 + Math.floor(gi / 7) * 55 + 21);
```

## Tugas
Tulis kode animasi untuk 4 scene berikut. Setiap scene berdiri sendiri (kode tiap scene hanya bisa melihat `s` dan `ctx`). Variasikan gerakan dan komposisi antar scene.

### SCENE 1
- Teks narasi: "Kamu bilang mulai besok aja,"
- Visual: Kalender dinding kotak putih dengan angka tanggal besar. Satu lembar tanggal terlepas dan melayang keluar kanvas, lembar baru langsung jatuh menggantikannya dengan bunyi gerakan goyang kecil.
- Tema latar: paper
- Durasi: 2.09 detik (gerakan harus mengisi seluruh durasi ini)
- Waktu kata diucapkan (detik dari awal scene): Kamu 0.1 · bilang 0.4 · mulai 0.8 · besok 1.2 · aja, 1.5

### SCENE 2 ... SCENE 4  (format sama: Teks narasi, Visual, Tema latar, Durasi, Waktu kata diucapkan)

## Format jawaban (penting)
Tulis SEMUA scene di dalam SATU blok kode ```js saja, supaya bisa disalin sekali klik. Pisahkan tiap scene dengan baris penanda persis seperti ini:

```js
// ===== SCENE 1 =====
// ...kode scene ini...

// ===== SCENE 2 =====
// ...kode scene ini...
```

Jangan memecah jawaban menjadi beberapa blok kode. Pakai nomor scene persis seperti di atas. Jangan gunakan artifact/canvas dan jangan menambahkan penjelasan di luar format yang diminta.
```

Batch berikutnya menambahkan satu baris setelah kalimat pertama "## Tugas":
`Scene sebelum kelompok ini: <visual scene terakhir batch sebelumnya>. (jaga kesinambungan, jangan diulang persis).`

### Data scene yang dikirim (durasi & waktu kata dari TTS)

| Scene | Durasi | Waktu kata |
|---|---|---|
| 1 | 2.09 | Kamu 0.1 · bilang 0.4 · mulai 0.8 · besok 1.2 · aja, 1.5 |
| 2 | 2.97 | padahal 0.2 · kemarin 0.7 · kamu 1.4 · juga 1.6 · bilang 1.9 · gitu. 2.3 |
| 3 | 2.3 | Masalahnya 0.3 · bukan 0.9 · kamu 1.3 · malas. 1.6 |
| 4 | 2.98 | Kamu 0.2 · tuh 0.6 · kayak 0.8 · motor 1.1 · yang 1.4 · mesinnya 1.6 · masih 2.1 · dingin. 2.4 |
| 5 | 3.29 | Susah 0.2 · distarter 0.5 · di 1.1 · awal, 1.3 · tapi 1.6 · begitu 2.4 · nyala, 2.8 |
| 6 | 3.52 | jalannya 0.1 · enteng 0.7 · banget, 1.1 · kamu 2.1 · tinggal 2.4 · gas. 2.9 |
| 7 | 2.55 | Jadi 0.2 · jangan 0.5 · mikirin 0.9 · sampai 1.3 · tujuan 1.6 · dulu. 2.0 |
| 8 | 4.27 | Hari 0.2 · ini 0.5 · cukup 0.8 · nyalain 1.4 · mesinnya. 1.9 · Lima 3.0 · menit 3.3 · aja. 3.7 |
| 9 | 3.7 | Buka 0.2 · laptopnya, 0.4 · tulis 1.0 · satu 1.7 · kalimat. 1.9 · Itu 2.8 · doang. 3.0 |
| 10 | 3.1 | Kalau 0.3 · kamu 0.5 · mau 0.7 · terus 0.8 · nyala, 1.1 · follow 1.7 · aku 2.0 · ya. 2.1 |

Batch: scene 1-4, 5-8 (kesinambungan dari visual scene 4), 9-10 (kesinambungan dari visual scene 8).
