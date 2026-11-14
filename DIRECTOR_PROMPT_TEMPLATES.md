# Template prompt Dramagic (BytePlus) untuk Director

Dipelajari 27 Okt 2026 dari ekspor canvas Dramagic
(`C:\Users\PC\Downloads\creative-canvas-data-2026-10-27T09-22-49-501Z.json`): 1 proyek drama fantasi,
45 karakter, 52 prop (31 utama + 21 varian), 49 scene, 11 storyboard video.
Teks prompt asli (ekstrak) ada di scratchpad sesi; template di bawah sudah lengkap.

## Model & setelan yang mereka pakai

- Semua aset gambar: satu endpoint `ep-20260714174421-clrhw`, aspect **16:9**, resolusi **1k**, 1 gambar.
- Video: `ep-20260730144832-vsxrx` = `general.video_gen.seedance_v2_5`, genType `reference_frame`
  (mode "omni"), **720p**, 9:16, format MOV, durasi 5–15 detik per storyboard.
- Referensi video: hanya gambar aset (karakter, scene, prop) lewat `scriptUniqId`, **tanpa frame pembuka**.
- Post-processing: `enhanceEnabled` dan `removeSubtitleEnabled` menyala.
- Style dipilih sekali per proyek (custom style "Ultra realistic cinematic live-action film") dan
  ditempel di awal setiap prompt video sebagai `Visual Style: ...`.

## 1. Karakter: kiri close-up, kanan three-view, satu gambar 16:9

Prompt = teks tugas tetap + `---` + daftar atribut terstruktur.

```
Task: Complete an upper-body frontal eye-level close-up of the character and a full-body three-view of
the same character. The upper-body frontal eye-level close-up of the character is on the left, and the
full-body three-view of the character is on the right. The three-view must not have dividing lines. The
aspect ratio is 16:9. The left side is a close-up shot of the character from the chest up, occupying
approximately 40% of the image width, used to display facial features, hairstyle, expression, eye
contact, upper-body clothing, and accessory details. The right side is the three-view of the same
character, occupying approximately 60% of the image width, sequentially displaying the front full-body
view, side full-body view, and back full-body view.
---

Character description:
- **Historical Period Base**: Modern
- **Country/Dynasty**: American person
- **Race**: Caucasian            (hewan: **Species**: Red Fox)
- **Genre Base**: Fantasy
- **Face Shape**: <bentuk wajah, mata, alis, hidung, bibir, ekspresi khas>
- **Hairstyle**: <panjang, warna, tekstur, gaya, aksesori rambut>   (hewan: bulu)
- **Earrings**: <atau kosong>
- **Body Type**: <tinggi, bentuk tubuh, postur>
- **Head-to-Body Ratio**: Realistic 7 heads, ...
- **Upper Body Clothing**: <atasan, lapisan, warna, bahan, aksesori, barang yang selalu dibawa>
- **Lower Body Clothing**: <bawahan>
- **Shoes**: <sepatu>
- **Gender**: Female
- **Age**: Youth
```

Catatan:
- Kolomnya tetap, jadi model selalu diberi wajah, rambut, tubuh, proporsi dan pakaian atas-bawah-sepatu.
  Hewan memakai kolom yang sama ("No clothing, maintaining natural form").
- **Grup** (`[Group] Students`, `[Group] Ravenwood Students`) satu aset, isi tiap kolom per orang
  ("Maya Collins: ... Finn Mercer: ...") atau "Varied ..." untuk figuran.
- `description` (identitas, sifat, profil cerita) disimpan terpisah dan **tidak** masuk prompt gambar.
- Field `voice` ada di aset karakter (kosong di data ini): suara per karakter disiapkan di sini.

## 2. Scene: empat panel tanpa orang

```
Generate a four-panel image displaying four different perspectives of the same scene. The top-left
panel is the front view, with the main subject clearly visible from the front, centered composition, and
complete details; the top-right panel is the top-down view, overlooking the overall spatial layout from
high above, showing environmental relationships and scene structure; the bottom-left panel is the rear
view, observed from behind the main subject, highlighting the back contour, spatial depth, and
environmental extension; the bottom-right panel is the side view, observed from the side of the main
subject, showing the subject's proportions, layering, and spatial relationships. The four panels
maintain the same scene, same lighting, same color tone, and same time state. Do not output any text
information.

1. Only the scene appears—no characters, props, or other unrelated content.
2. Must display only static objects; cannot include humans, animals, or anything else capable of moving
   on its own.
3. No dynamic elements, special effects, skills, lighting effects, or combat-related depictions.

Scene description: A flat-spread horizontal long-format image, with straight lines remaining straight,
the horizon as a horizontal straight line, vertical objects remaining vertical, no fisheye, no spherical
curvature, no barrel distortion, no small planet effect. The scene is <jenis ruang>. In the center
foreground, <objek>... On the left side ... In the background ... Set into the back wall ... The camera
is positioned at <tinggi/arah>. The light source originates from <sumber cahaya>.
```

Catatan:
- Ada **tampak atas** (denah), jadi posisi barang dan arah pintu/jendela konsisten antar shot.
- Deskripsi ruang ditulis berurutan **depan, kiri/kanan, belakang**, dengan posisi tiap barang yang
  nanti dipakai di cerita (meja kerja, karung tepung, buku resep, pintu).
- Anti-distorsi ditulis eksplisit (tanpa fisheye, garis lurus, horizon datar).
- Waktu dan cahaya scene ditulis di prompt video, bukan dikunci di gambar scene.

## 3. Prop: deskripsi material saja, tanpa template lembar

Prompt prop **tidak** memakai template multi-view. Isinya satu paragraf deskripsi fisik yang sangat rinci:
bentuk, bahan, tekstur, warna, kondisi/umur, cara cahaya jatuh di permukaan. Contoh:

```
A folded sheet of aged parchment paper with handwritten musical notation in precise pencil strokes, the
staff lines drawn with meticulous accuracy, ..., the paper bearing subtle crease marks from folding, edges
slightly softened and worn, faint graphite sheen catching light across the notation surface, ...
```

- **Varian** (`assetKind: variant`, `parentAssetId`): satu prop punya beberapa keadaan sebagai aset
  terpisah, misalnya "Moonflower Petal - Fresh" dan "- Pressed". Shot memakai varian yang sesuai cerita.
- Pakaian istimewa (gaun pesta, topeng) juga dibuat sebagai prop, bukan sebagai karakter baru.

## 4. Video per storyboard (5–15 detik, beberapa shot dalam satu klip)

```
Visual Style: <style proyek, sama di semua storyboard>

### Reference contents

【Characters】
<Ivy Bennett> corresponds to @{{image-char_007}}, only the appearance, hairstyle and clothing of the character are adopted.
<...> corresponds to @{{image-char_xxx}}, only the appearance, hairstyle and clothing of the character are adopted.
【Scenes】
<Great Hall> refers to @{{image-scene_002}}, only the spatial layout, architecture and lighting are adopted, the characters in the image are not adopted.
【Props】
<Golden Thread> corresponds to @{{image-prop_032}}, only the structure, material and color are adopted.

### Visual Content

The storyboard scene is set in: Great Hall reference image @{{image-scene_002}}

Time: nighttime
Lighting: <sumber cahaya utama, arah, rasio kontras, suhu warna, karakter bayangan; 3–5 kalimat>

Storyboard specific action description:
Shot1 @{{duration-1.5}}
[Layout] <siapa di mana: posisi di frame (foreground/mid/background), berdiri/duduk, arah badan,
arah kepala, arah pandang, apa yang dipegang>
[Action] <Shot size> | <Camera move>. <aksi berurutan, ekspresi>.。@{{image-char_007}}: @{{dialogue-{I can feel your heartbeat.}}}

Shot2 @{{duration-2.5}}
[Layout] ...
[Action] Medium | Dolly In. ...

Strict constraints:
【Must remain consistent】：Ensure the stability of <character identity, quantity, costumes, prop ownership, spatial orientation and sound relationships>.
【No duplicate or twin effect】：Keep only one instance of each character in the same frame. Do not duplicate characters or generate clones or twin effects!!!
【No subtitles or background music】：No subtitles or text overlays are allowed throughout the video; it must contain visuals only. No BGM or background music is allowed.
```

Pola yang terlihat dari 11 storyboard:
- **Satu klip = satu scene, satu waktu, satu pencahayaan**, berisi 2–6 shot pendek (1,5–3,5 detik).
  Durasi klip = jumlah durasi shot, dibulatkan ke atas (2,5+2,5 = 5 detik; 14,5 jadi 15).
- Setiap shot punya dua bagian: **[Layout]** (komposisi dan arah badan/kepala/pandang, ditulis seperti
  untuk frame diam) dan **[Action]** (`Shot size | Camera move`, lalu gerakan).
  Kamera dari kosakata tetap: Static, Dolly In, Crane Up, Push In, dan sejenisnya.
- **Arah pandang ke tokoh di luar frame** selalu disebut ("gaze directed at the off-screen Lydia"),
  supaya potongan shot-reverse-shot nyambung.
- **Dialog** ditempel di akhir Action dengan penanda pembicara: `@{{image-char_007}}: @{{dialogue-{...}}}`.
  Audio dibuat Seedance (lip-sync), BGM dilarang, musik ditambahkan belakangan.
- Referensi diberi **batasan pemakaian**: karakter hanya wajah, rambut dan pakaian; scene hanya tata
  ruang, arsitektur dan cahaya ("characters in the image are not adopted"); prop hanya struktur, bahan
  dan warna. Ini mencegah pose atau layout lembar referensi ikut tersalin.
- Penutup tetap: konsistensi identitas/jumlah/kostum/kepemilikan prop/arah ruang, **larangan kembaran**,
  dan larangan subtitle/BGM.

## Bandingan dengan Director kita (`director_service/board.py`)

| | Dramagic | Director sekarang |
|---|---|---|
| Lembar karakter | Close-up dada ke atas (40%) + three-view (60%), 16:9, atribut terstruktur | Full body 4 arah + 2 close-up kepala, deskripsi bebas |
| Lembar scene | Depan, **atas**, belakang, samping; tanpa orang; anti-distorsi; posisi barang berurutan | Wide, reverse, medium, detail |
| Prop | Deskripsi material saja + varian per keadaan | Lembar multi-view (+ versi "in use") |
| Referensi video | Hanya aset, tanpa frame pembuka; tiap referensi diberi batas pemakaian | Frame pembuka + sheet ("Never show the sheet layout") |
| Struktur shot | `[Layout]` + `[Action] Size \| Move`, durasi desimal | `Shot n \| a-b s` + teks bebas |
| Dialog | Tag pembicara + teks, lip-sync Seedance, tanpa BGM | VO/musik terpisah di timeline |
| Batasan akhir | Konsistensi, anti-kembaran, tanpa subtitle/BGM | Tidak ada blok tetap |

## Yang layak diadopsi (urutan saran)

1. Blok **Strict constraints** di akhir setiap prompt video (murah, langsung mengurangi kembaran/subtitle).
2. Kalimat **batas pemakaian referensi** per jenis aset (karakter/scene/prop) di `reference_legend`.
3. Format shot **[Layout] + [Action] Size | Move** dan arah pandang ke tokoh di luar frame;
   agent menulis `video_prompt` dalam format ini.
4. **Time + Lighting** per scene di prompt video.
5. Lembar karakter close-up + three-view dengan **atribut terstruktur** (field brief per karakter).
6. Lembar scene dengan **tampak atas** + anti-distorsi.
7. **Varian prop** per keadaan cerita.
8. **Dialog dengan tag pembicara** dan lip-sync Seedance (Fase 5 di DIRECTOR_TODO).

Perubahan template sheet membuat sheet lama "stale" dan dibuat ulang (berbayar), jadi pasang hanya
untuk proyek baru, seperti `LOOK_SHEET_TEMPLATES` dulu.
