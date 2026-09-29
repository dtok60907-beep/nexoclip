# Canvas Design Scope

Dokumen ini menjadi checklist desain untuk menyamakan canvas dengan referensi screenshot dan mockup HTML.

## Target

Menyamakan tampilan canvas ke desain dark infinite-canvas dengan node generation, panel konfigurasi, kabel koneksi neon, dan floating toolbar—tanpa mengganti logic ReactFlow, database, auth, API, atau realtime.

## Daftar Area yang Akan Didesain

### 1. Canvas Background

- [ ] Dark background utama (`#0b0c10` / `#0c0d12`)
- [ ] Infinite dot-grid dengan ukuran dan opacity seperti referensi
- [ ] Cursor `grab` / `grabbing`
- [ ] Pan dan zoom tetap berfungsi
- [ ] Viewport project tetap tersimpan dan dipulihkan

### 2. Top Navigation

- [ ] Logo gradient di kiri
- [ ] Nama project dan dropdown indicator
- [ ] Status `SAVED`
- [ ] Avatar collaborator
- [ ] Tombol notification
- [ ] Tombol `Mengobrol`
- [ ] Tombol `Membagikan`
- [ ] Border bawah dan backdrop blur
- [ ] Responsive behavior untuk layar kecil

### 3. Video Generation Node

- [ ] Header `Video Generation`
- [ ] Status indicator hijau
- [ ] Tombol `Tampilkan galeri`
- [ ] Video preview dengan rounded corners
- [ ] Play button glassmorphism
- [ ] Badge resolusi (`720p`)
- [ ] Badge aspect ratio (`16:9`)
- [ ] Badge durasi
- [ ] Fullscreen button
- [ ] Input/output connection handles
- [ ] Prompt section
- [ ] Model selector
- [ ] Generation cost button
- [ ] Thumbnail carousel
- [ ] Floating tool shelf: text, image, video, audio

### 4. Scene / Video Nodes

- [ ] Header node dan status badge
- [ ] Preview media dengan aspect ratio konsisten
- [ ] Status seperti `Alert State`, `Completed`, `Finished`
- [ ] Metadata model dan durasi
- [ ] Prompt card
- [ ] Seed / metadata label
- [ ] Sub-prompt card
- [ ] Input/output handles
- [ ] Selected-node cyan ring
- [ ] Hover border glow

### 5. Image Generation Node

- [ ] Header `Image Generation`
- [ ] Provider/model badge
- [ ] Completion status
- [ ] Image preview card
- [ ] Resolution dan aspect-ratio badges
- [ ] Prompt summary
- [ ] Processing time
- [ ] Input/output handles

### 6. Connection Wires

- [ ] SVG connection layer di belakang node
- [ ] Cyan/blue gradient wires
- [ ] Active wire glow
- [ ] Subtle secondary wires
- [ ] Curved bezier paths
- [ ] Connection handles tetap interaktif
- [ ] ReactFlow edge behavior tetap dipertahankan

### 7. Generation Settings Panel

- [ ] Panel fixed di kanan atas
- [ ] Header icon dan judul `Pembuatan Gambar & Video`
- [ ] Tombol close
- [ ] Prompt textarea
- [ ] Add reference button
- [ ] Model selector
- [ ] Resolution selector
- [ ] Aspect-ratio selector
- [ ] Batch / duration stepper
- [ ] Accordion `Pengaturan lanjutan`
- [ ] Seed
- [ ] CFG guidance scale
- [ ] Motion strength
- [ ] Tombol `Menghasilkan`
- [ ] Credit estimate
- [ ] Loading, disabled, dan error states

### 8. Bottom Floating Toolbar

- [ ] Floating toolbar di tengah bawah
- [ ] Select tool
- [ ] Pan tool
- [ ] Pen / connection tool
- [ ] Asset library
- [ ] Add node
- [ ] Text tool
- [ ] Favorite
- [ ] Comment
- [ ] Auto layout
- [ ] Extra feature dengan badge `BARU`
- [ ] Search canvas
- [ ] Active, hover, dan disabled states

### 9. Zoom Controls

- [ ] Fixed controls di kiri bawah
- [ ] Zoom out
- [ ] Current zoom percentage
- [ ] Zoom in
- [ ] Fit to screen
- [ ] Minimap toggle
- [ ] Styling sesuai floating toolbar

### 10. AI Agent Button

- [ ] Fixed button di kanan bawah
- [ ] Sparkle icon
- [ ] Label `Tanyakan kepada Agen`
- [ ] Hover state
- [ ] Panel/modal placeholder atau integrasi existing

### 11. Responsive Design

- [ ] Desktop layout seperti screenshot
- [ ] Panel tidak menutup node penting
- [ ] Toolbar dapat scroll pada layar kecil
- [ ] Top navigation menyederhana di mobile
- [ ] Node tetap dapat dipan dan dipilih
- [ ] Touch/pointer interaction tetap aman

### 12. Interaction States

- [ ] Node selected
- [ ] Node hovered
- [ ] Node loading
- [ ] Node completed
- [ ] Node failed
- [ ] Project saving
- [ ] Project saved
- [ ] Realtime collaborator presence
- [ ] Read-only mode
- [ ] Empty canvas
- [ ] API error toast

## Fitur yang Tidak Boleh Rusak

- [ ] Auth/session Nexoclip
- [ ] Project ownership
- [ ] Project create/update/delete
- [ ] Project data di Neon
- [ ] Canvas node persistence
- [ ] Asset upload dan asset library
- [ ] Image generation
- [ ] Video generation
- [ ] OpenRouter pricing dan credit estimation
- [ ] Realtime collaboration dan WebSocket
- [ ] Existing ReactFlow connections
- [ ] `/canvas` sebagai public path
- [ ] Tidak menggunakan iframe
- [ ] Tidak melakukan redirect `/canvas` ke `/spite`

## Urutan Implementasi

1. [ ] Audit komponen canvas existing
2. [ ] Buat design tokens warna, spacing, radius, dan shadow
3. [ ] Samakan top navigation
4. [ ] Samakan canvas background dan viewport controls
5. [ ] Samakan node cards
6. [ ] Samakan connection wires
7. [ ] Samakan settings panel
8. [ ] Samakan bottom toolbar
9. [ ] Tambahkan responsive states
10. [ ] Test project persistence
11. [ ] Test auth dan ownership
12. [ ] Test generation dan pricing
13. [ ] Test realtime
14. [ ] Screenshot comparison dengan referensi
15. [ ] Production/local regression test

## Acceptance Criteria

Canvas dianggap selesai apabila:

- Tampilan desktop secara visual mendekati screenshot referensi.
- User dapat membuka `/canvas` setelah login.
- User dapat membuat dan membuka project.
- Node dan edge tetap tersimpan di Neon.
- Panel generation tetap bisa digunakan.
- Tidak ada iframe atau redirect ke `/spite`.
- Auth, ownership, assets, pricing, generation, dan realtime tetap berfungsi.
- Tidak ada secret yang masuk ke source code atau commit.
