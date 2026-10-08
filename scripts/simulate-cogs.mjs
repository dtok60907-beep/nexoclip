// Offline planning simulation. Provider prices and fees are not live quotes.
import { TOPUP_PACKAGES } from '../nexoclip-app/src/services/topupPackages.js';
import { PRICING_REFERENCE_USD_IDR, CREDITS_PER_USD } from '../nexoclip-app/src/services/generationPricing.js';

const fx = PRICING_REFERENCE_USD_IDR;
const markup = 1.6;
const scenarios = [
  { name: 'Provider only', paymentRate: 0, paymentFixed: 0, retryRate: 0, infraRate: 0 },
  { name: 'Planning', paymentRate: 0.02, paymentFixed: 2000, retryRate: 0.05, infraRate: 0.03 },
  { name: 'Stress', paymentRate: 0.03, paymentFixed: 3000, retryRate: 0.15, infraRate: 0.05 },
];

const rows = scenarios.flatMap(s => TOPUP_PACKAGES.map(p => {
  // Full redemption; homogeneous marginal credit cost; no rounding effects.
  const providerIdr = p.credits / (CREDITS_PER_USD * markup) * fx;
  const paymentIdr = p.priceIdr * s.paymentRate + s.paymentFixed;
  const deliveryIdr = providerIdr * (1 + s.retryRate + s.infraRate);
  const contributionIdr = p.priceIdr - paymentIdr - deliveryIdr;
  const targetMargin = 0.40;
  const requiredMultiplier = p.credits * fx * (1 + s.retryRate + s.infraRate)
    / (CREDITS_PER_USD * (p.priceIdr * (1 - s.paymentRate - targetMargin) - s.paymentFixed));
  return {
    scenario: s.name, package: p.name, priceIdr: p.priceIdr, credits: p.credits,
    idrPerCredit: +(p.priceIdr / p.credits).toFixed(2),
    providerIdr: Math.round(providerIdr), paymentIdr: Math.round(paymentIdr),
    deliveryIdr: Math.round(deliveryIdr), contributionIdr: Math.round(contributionIdr),
    contributionMarginPercent: +(100 * contributionIdr / p.priceIdr).toFixed(2),
    multiplierFor40Percent: +requiredMultiplier.toFixed(3),
  };
}));
console.log(JSON.stringify({ assumptions: { fx, markup, fullRedemption: true,
  excludes: ['tax', 'fixed overhead', 'acquisition', 'support', 'refunds'], scenarios }, rows }, null, 2));
