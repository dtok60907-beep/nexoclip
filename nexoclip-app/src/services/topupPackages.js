// Credit packages sold for rupiah. Base rate is about Rp 200 per credit;
// larger packages carry bonus credits. Generation is charged at 1.6x the
// provider cost (CREDIT_MARKUP_PERCENT=60), which keeps the Studio package's
// 30% bonus at a ~33% gross margin.
export const TOPUP_PACKAGES = Object.freeze([
  { code: 'topup_149k', name: 'Starter', description: 'Try every studio and model.', priceIdr: 149_000, credits: 750, bonusPercent: 0, popular: false },
  { code: 'topup_399k', name: 'Creator', description: 'For a steady weekly content flow.', priceIdr: 399_000, credits: 2_200, bonusPercent: 10, popular: true },
  { code: 'topup_899k', name: 'Pro', description: 'For campaigns and client work.', priceIdr: 899_000, credits: 5_400, bonusPercent: 20, popular: false },
  { code: 'topup_2399k', name: 'Studio', description: 'Best value for teams and agencies.', priceIdr: 2_399_000, credits: 15_600, bonusPercent: 30, popular: false },
]);

export function findTopupPackage(code) {
  return TOPUP_PACKAGES.find((pkg) => pkg.code === code) || null;
}
