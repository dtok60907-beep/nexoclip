// Credit packages sold for rupiah. Base rate is Rp 200 per credit
// (1 credit = USD 0.01 of provider cost); larger packages carry bonus credits.
export const TOPUP_PACKAGES = Object.freeze([
  { code: 'topup_50k', name: 'Starter', description: 'Try a few videos and images.', priceIdr: 50_000, credits: 250, bonusPercent: 0, popular: false },
  { code: 'topup_100k', name: 'Creator', description: 'For a steady weekly content flow.', priceIdr: 100_000, credits: 500, bonusPercent: 0, popular: true },
  { code: 'topup_250k', name: 'Pro', description: 'For campaigns and client work.', priceIdr: 250_000, credits: 1_300, bonusPercent: 4, popular: false },
  { code: 'topup_500k', name: 'Studio', description: 'Best value for teams and agencies.', priceIdr: 500_000, credits: 2_750, bonusPercent: 10, popular: false },
]);

export function findTopupPackage(code) {
  return TOPUP_PACKAGES.find((pkg) => pkg.code === code) || null;
}
