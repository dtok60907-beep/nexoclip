// Credit packages sold for rupiah. Base rate is about Rp 200 per credit;
// larger packages carry bonus credits. Generation is charged at 1.6x the
// provider cost (CREDIT_MARKUP_PERCENT=60).
// Only 3 self-serve tiers by design: each is sized to run out mid-project so
// upgrading to the next tier feels like the obvious move. The old 'Studio'
// tier (topup_2399k) was retired in favor of the Enterprise/WhatsApp path —
// findTopupPackage() no longer resolves that code, so it can't be purchased,
// but past topups that used it still display fine from their stored row data.
export const TOPUP_PACKAGES = Object.freeze([
  { code: 'topup_229k', name: 'Starter', label: 'Extra 1.200 kredit', description: 'Saldo tambahan untuk mencoba semua studio dan model.', priceIdr: 229_000, credits: 1_200, bonusPercent: 0, popular: false, oneTime: true },
  { code: 'topup_449k', name: 'Creator', label: 'Extra 2.800 kredit', description: 'Saldo tambahan untuk produksi konten rutin.', priceIdr: 449_000, credits: 2_800, bonusPercent: 0, popular: true, oneTime: true },
  { code: 'topup_999k', name: 'Pro', label: 'Extra 6.500 kredit', description: 'Saldo tambahan untuk kampanye dan pekerjaan klien.', priceIdr: 999_000, credits: 6_500, bonusPercent: 0, popular: false, oneTime: true },
]);

export function findTopupPackage(code) {
  return TOPUP_PACKAGES.find((pkg) => pkg.code === code) || null;
}
