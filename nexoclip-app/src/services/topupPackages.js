// Credit packages sold for rupiah. Base rate is about Rp 200 per credit;
// larger packages carry bonus credits. Generation is charged at 1.6x the
// provider cost (CREDIT_MARKUP_PERCENT=60).
// Only 3 self-serve tiers by design: each is sized to run out mid-project so
// upgrading to the next tier feels like the obvious move. The old 'Studio'
// tier (topup_2399k) was retired in favor of the Enterprise/WhatsApp path —
// findTopupPackage() no longer resolves that code, so it can't be purchased,
// but past topups that used it still display fine from their stored row data.
export const TOPUP_PACKAGES = Object.freeze([
  { code: 'topup_149k', name: 'Starter', description: 'Try every studio and model. Credits run low fast once you get going.', priceIdr: 149_000, credits: 750, bonusPercent: 0, popular: false },
  { code: 'topup_399k', name: 'Creator', description: 'Enough for a weekly content flow, but you\'ll still be counting credits.', priceIdr: 399_000, credits: 2_200, bonusPercent: 10, popular: true },
  { code: 'topup_899k', name: 'Pro', description: 'For campaigns and client work, without worrying about running out.', priceIdr: 899_000, credits: 5_400, bonusPercent: 20, popular: false },
]);

export function findTopupPackage(code) {
  return TOPUP_PACKAGES.find((pkg) => pkg.code === code) || null;
}
