// Credit packages sold for rupiah. Base rate is about Rp 200 per credit;
// larger packages carry bonus credits. Generation is charged at twice the
// provider cost (CREDIT_MARKUP_PERCENT=100), which keeps the Studio package's
// 30% bonus at a healthy margin.
export const TOPUP_PACKAGES = Object.freeze([
  { code: 'topup_249k', name: 'Starter', description: 'Try every studio and model.', priceIdr: 249_000, credits: 1_250, bonusPercent: 0, popular: false },
  { code: 'topup_499k', name: 'Creator', description: 'For a steady weekly content flow.', priceIdr: 499_000, credits: 2_750, bonusPercent: 10, popular: true },
  { code: 'topup_999k', name: 'Pro', description: 'For campaigns and client work.', priceIdr: 999_000, credits: 6_000, bonusPercent: 20, popular: false },
  { code: 'topup_2499k', name: 'Studio', description: 'Best value for teams and agencies.', priceIdr: 2_499_000, credits: 16_250, bonusPercent: 30, popular: false },
]);

export function findTopupPackage(code) {
  return TOPUP_PACKAGES.find((pkg) => pkg.code === code) || null;
}
