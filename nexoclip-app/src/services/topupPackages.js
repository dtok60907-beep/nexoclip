// Credit packages sold for rupiah. Base rate is about Rp 200 per credit;
// larger packages carry bonus credits. Generation is charged at 1.6x the
// provider cost (CREDIT_MARKUP_PERCENT=60).
// Only 3 self-serve tiers by design: each is sized to run out mid-project so
// upgrading to the next tier feels like the obvious move. The old 'Studio'
// tier (topup_2399k) was retired in favor of the Enterprise/WhatsApp path —
// findTopupPackage() no longer resolves that code, so it can't be purchased,
// but past topups that used it still display fine from their stored row data.
export const TOPUP_PACKAGES = Object.freeze([
  { code: 'topup_229k', name: 'Starter', description: 'Coba semua studio dan satu video Seedance 2.5 30 detik 720p.', priceIdr: 229_000, credits: 1_200, bonusPercent: 0, popular: false },
  { code: 'topup_449k', name: 'Creator', description: 'Untuk konten rutin tiap minggu dengan ruang untuk revisi.', priceIdr: 449_000, credits: 2_800, bonusPercent: 0, popular: true },
  { code: 'topup_999k', name: 'Pro', description: 'Untuk kampanye dan kerjaan klien tanpa cepat kehabisan kredit.', priceIdr: 999_000, credits: 6_500, bonusPercent: 0, popular: false },
]);

export function findTopupPackage(code) {
  return TOPUP_PACKAGES.find((pkg) => pkg.code === code) || null;
}
