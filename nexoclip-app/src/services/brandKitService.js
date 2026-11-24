import { getPool } from '../db/pool.js';
import * as repository from '../repositories/brandKitRepository.js';


export const NEXOCLIP_BRAND_KIT = {
  brandName: 'Nexo Clip',
  about: 'Studio kreatif AI untuk gambar dan video iklan, UGC, dan cerita visual. Dibuat untuk Indonesia.',
  category: 'AI video dan image generation SaaS (creative studio)',
  mission: 'Konten bagus seharusnya tidak mahal.',
  positioning: 'Bantu brand kecil membuat konten sebanyak brand besar dengan 29 model AI dalam satu saldo kredit: Seedance, Kling 3.0 Pro, Wan 3.0, Veo 3, Nano Banana, GPT Image, Flux, Seedream, Hailuo, dan ElevenLabs.',
  headline: 'Ide kamu. Jadi video nyata.',
  slogans: ['Ruang untuk ide besar. Studio untuk mewujudkannya.', 'Konten bagus seharusnya tidak mahal.', 'Made for your imagination.'],
  language: 'Bahasa Indonesia, santai dengan sapaan “kamu”; aksen Indonesia standar.',
  pronunciation: 'NEK-so KLIP',
  tone: 'Santai, ramah, langsung, singkat, kreatif, dan memberdayakan.',
  audience: ['Seller TikTok Shop, Shopee, dan affiliate — perlu banyak video produk; lead dengan Video UGC AI.', 'Pemilik UMKM — biaya konten tinggi dan belum punya studio/tim; lead dengan foto produk jadi video iklan, harga rupiah, dan QRIS.', 'Creator, filmmaker, dan agensi — produksi konten rutin; lead dengan AI Director, AI Video Canvas, dan Enterprise.'],
  products: ['AI Director — brief menjadi konsep, naskah, daftar shot, gambar, dan video.', 'AI Video Canvas — papan node untuk prompt, referensi, gambar, dan video.', 'Video Studio — teks atau foto menjadi video hingga 1080p.', 'Video UGC AI — kreator virtual membuat review produk berbahasa Indonesia.'],
  sellingPoints: ['Video tanpa talent, studio, atau editor.', '29 model AI, satu saldo kredit.', 'Chat dalam Bahasa Indonesia.', 'Biaya kredit terlihat sebelum generate; generasi gagal otomatis dikembalikan.', 'Output tanpa watermark dan penggunaan komersial pada paket berbayar.', 'Bayar dengan QRIS atau Virtual Account.'],
  claimsToAvoid: ['Jangan menjanjikan paket gratis.', 'Jangan memakai harga mulai Rp149.000; harga Starter saat ini perlu dikonfirmasi.', 'Jangan menjanjikan hasil identik; hasil bergantung pada foto, prompt, dan model.'],
  disclaimer: 'Hasil bisa berbeda tergantung foto referensi, prompt, dan model yang dipakai. Beberapa platform mewajibkan konten AI diberi label.',
  competitors: ['HeyGen', 'Synthesia', 'Captions', 'Opus Clip'],
  plans: ['Starter — Rp229.000/bulan, 1.200 kredit (konfirmasi sebelum publikasi).', 'Creator — Rp449.000/bulan, 2.800 kredit; paling populer.', 'Pro — Rp999.000/bulan, 6.500 kredit.', 'Enterprise — harga khusus.', 'Tahunan: bayar 10 bulan untuk 12 bulan. Tidak ada auto-renew; bayar dengan QRIS atau Virtual Account.', 'Top-up: 1.200 kredit Rp229.000, 2.800 kredit Rp449.000, 6.500 kredit Rp999.000; kredit tidak kedaluwarsa.'],
  phone: '+62 851-8316-2659',
  email: 'support@nexoclip.com',
  website: 'https://nexoclip.com',
  app: 'https://app.nexoclip.com',
  instagram: '@nexoclip.official',
  tiktok: '@nexoclip.com',
  youtube: '@nexoclipyt',
  address: 'Jl. Raya Boulevard Permata Medang No.8, Medang, Pagedangan, Kabupaten Tangerang, Banten 15835',
  legalEntity: 'PT Smart Digitech Indonesia, Tangerang Regency, Banten',
  colors: [
    { name: 'Background', hex: '#0B0C0A' }, { name: 'Panel', hex: '#111412' },
    { name: 'Panel raised', hex: '#151714' }, { name: 'Panel border', hex: '#1D201B' },
    { name: 'Lime accent', hex: '#D4FF64' }, { name: 'Warm off-white', hex: '#F2EEE5' },
    { name: 'Light text', hex: '#F2F3ED' }, { name: 'Muted text', hex: '#A8AEA5' },
    { name: 'Orange highlight', hex: '#FF5A1F' }, { name: 'WhatsApp', hex: '#25D366' },
  ],
  fonts: ['Clash Display — heading', 'Plus Jakarta Sans — body', 'Monospace — labels'],
  bannerColor: '#D4FF64',
  logoDataUrl: '',
  logoNote: 'Site icon; the header wordmark is the text "nexo clip." Use the icon as a small mark and the wordmark on dark backgrounds.',
  glossary: [
    'Kredit (credits), generate, konsep, naskah, daftar shot, papan (canvas).',
    'Products: AI Director, AI Video Canvas, Video Studio, Video UGC AI, AI Influencer.',
  ],
  deals: [
    'Tahunan: gratis 2 bulan (bayar 10 bulan untuk 12 bulan, tanpa kode promo).',
    'Top-up kredit tidak kedaluwarsa: 1.200 kredit Rp229.000, 2.800 kredit Rp449.000, 6.500 kredit Rp999.000.',
  ],
  compareAgainst: 'Bandingkan pada pembayaran lokal (QRIS/VA), Bahasa Indonesia natural, dan akses 29 model AI dalam satu saldo kredit.',
  leadWith: 'Lead dengan Video UGC AI untuk seller & UMKM; Video Studio untuk iklan foto produk; AI Director & AI Video Canvas untuk kreator & agensi.',
  avatars: [],
  voices: [],
  customPages: [],
};

const CORE_TEXT_FIELDS = [
  'brandName', 'about', 'category', 'mission', 'positioning', 'headline',
  'language', 'pronunciation', 'tone', 'disclaimer', 'phone', 'email',
  'website', 'app', 'instagram', 'tiktok', 'youtube', 'address', 'legalEntity',
];

const CORE_LIST_FIELDS = [
  'slogans', 'audience', 'products', 'sellingPoints',
  'claimsToAvoid', 'competitors', 'plans', 'fonts',
];

const OPTIONAL_TEXT_FIELDS = ['logoNote', 'compareAgainst', 'leadWith'];
const OPTIONAL_LIST_FIELDS = ['glossary', 'deals'];

function validateStringList(list, label, maxItems = 40, maxLen = 500) {
  if (!Array.isArray(list) || list.length > maxItems || list.some((item) => typeof item !== 'string' || item.length > maxLen)) {
    throw Object.assign(new Error(`Daftar ${label} tidak valid.`), { status: 400 });
  }
  return list.map((item) => item.trim()).filter(Boolean);
}

function validateNamedEntries(entries, label) {
  if (!Array.isArray(entries) || entries.length > 40) {
    throw Object.assign(new Error(`Daftar ${label} tidak valid.`), { status: 400 });
  }
  return entries.map((entry, idx) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw Object.assign(new Error(`Item ${label} tidak valid.`), { status: 400 });
    }
    const id = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim().slice(0, 80) : `${label}-${idx + 1}`;
    const name = typeof entry.name === 'string' ? entry.name.trim().slice(0, 120) : '';
    const description = typeof entry.description === 'string' ? entry.description.trim().slice(0, 600) : '';
    const tag = typeof entry.tag === 'string' ? entry.tag.trim().slice(0, 80) : '';
    return { id, name, description, tag };
  }).filter((item) => item.name || item.description);
}

function validateCustomPages(pages) {
  if (!Array.isArray(pages) || pages.length > 20) {
    throw Object.assign(new Error('Halaman kustom Brand Kit tidak valid.'), { status: 400 });
  }
  return pages.map((page, idx) => {
    if (!page || typeof page !== 'object' || Array.isArray(page)) {
      throw Object.assign(new Error('Format halaman kustom tidak valid.'), { status: 400 });
    }
    const id = typeof page.id === 'string' && page.id.trim() ? page.id.trim().slice(0, 80) : `custom-${idx + 1}`;
    const title = typeof page.title === 'string' ? page.title.trim().slice(0, 120) : 'Untitled page';
    const subtitle = typeof page.subtitle === 'string' ? page.subtitle.trim().slice(0, 400) : '';
    const items = Array.isArray(page.items)
      ? page.items.slice(0, 40).map((item) => (typeof item === 'string' ? item.trim().slice(0, 500) : '')).filter(Boolean)
      : [];
    return { id, title: title || 'Untitled page', subtitle, items };
  });
}

export function validateBrandKit(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new Error('Format Brand Kit tidak valid.'), { status: 400 });
  }
  const data = {};
  for (const key of CORE_TEXT_FIELDS) {
    if (typeof value[key] !== 'string' || value[key].length > 5000) {
      throw Object.assign(new Error(`Kolom ${key} tidak valid.`), { status: 400 });
    }
    data[key] = value[key].trim();
  }
  for (const key of CORE_LIST_FIELDS) {
    data[key] = validateStringList(value[key], key);
  }
  if (!Array.isArray(value.colors) || value.colors.length > 24 || value.colors.some((color) =>
    !color || typeof color.name !== 'string' || color.name.length > 80 || !/^#[0-9a-f]{6}$/i.test(color.hex || '')
  )) {
    throw Object.assign(new Error('Warna Brand Kit tidak valid.'), { status: 400 });
  }
  data.colors = value.colors.map(({ name, hex }) => ({ name: name.trim(), hex: hex.toUpperCase() }));

  // Optional extended Brand Setup fields (backward-compatible with older payloads)
  if (value.bannerColor !== undefined) {
    if (typeof value.bannerColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(value.bannerColor)) {
      throw Object.assign(new Error('Warna banner tidak valid.'), { status: 400 });
    }
    data.bannerColor = value.bannerColor.toUpperCase();
  }
  if (value.logoDataUrl !== undefined) {
    if (typeof value.logoDataUrl !== 'string' || value.logoDataUrl.length > 350000) {
      throw Object.assign(new Error('Logo terlalu besar (maksimal ~250KB).'), { status: 400 });
    }
    const trimmedLogo = value.logoDataUrl.trim();
    if (trimmedLogo && !/^(data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,[a-z0-9+/=]+|https?:\/\/\S+|\/\S+)$/i.test(trimmedLogo)) {
      throw Object.assign(new Error('Format logo tidak valid.'), { status: 400 });
    }
    data.logoDataUrl = trimmedLogo;
  }
  for (const key of OPTIONAL_TEXT_FIELDS) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== 'string' || value[key].length > 3000) {
        throw Object.assign(new Error(`Kolom ${key} tidak valid.`), { status: 400 });
      }
      data[key] = value[key].trim();
    }
  }
  for (const key of OPTIONAL_LIST_FIELDS) {
    if (value[key] !== undefined) {
      data[key] = validateStringList(value[key], key);
    }
  }
  if (value.avatars !== undefined) data.avatars = validateNamedEntries(value.avatars, 'avatars');
  if (value.voices !== undefined) data.voices = validateNamedEntries(value.voices, 'voices');
  if (value.customPages !== undefined) data.customPages = validateCustomPages(value.customPages);

  return data;
}

export function createBrandKitService({ pool = getPool() } = {}) {
  return {
    async get(workspaceId) {
      return repository.getWorkspaceBrandKit(pool, workspaceId);
    },
    async save({ workspaceId, userId, data }) {
      return repository.saveWorkspaceBrandKit(pool, { workspaceId, userId, data: validateBrandKit(data) });
    },
  };
}
let defaultService;
export function brandKitService() {
  defaultService ??= createBrandKitService();
  return defaultService;
}
