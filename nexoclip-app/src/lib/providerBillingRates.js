// Exact decimal arithmetic for historical invoice ratios, never catalog prices.
function scaled(value, places) {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value)) throw new Error('Invalid billing decimal');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > places && /[1-9]/.test(fraction.slice(places))) throw new Error('Billing precision exceeds supported scale');
  return BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.slice(0, places).padEnd(places, '0'));
}

function decimal(value, places) {
  const digits = value.toString().padStart(places + 1, '0');
  return `${digits.slice(0, -places)}.${digits.slice(-places)}`;
}

export function billingGroupRates(group) {
  if (group.pre_tax_usd == null || group.savings_plan_gross_usd == null) {
    return { ...group, non_package_usage: null, effective_rate_usd: null, payg_rate_usd: null, rate_status: 'unknown' };
  }
  const usage = scaled(group.usage, 12);
  const packageUsage = scaled(group.package_usage, 12);
  if (packageUsage > usage) throw new Error('Package usage exceeds usage');
  const cost = scaled(group.pre_tax_usd, 8);
  const savings = scaled(group.savings_plan_gross_usd, 8);
  // cost/1e8 divided by usage/1e12, rendered to 12 places, half up.
  const rate = usage === 0n ? null : decimal((cost * 10n ** 16n + usage / 2n) / usage, 12);
  const clean = packageUsage === 0n && savings === 0n && usage > 0n;
  return { ...group, non_package_usage: decimal(usage - packageUsage, 12), effective_rate_usd: rate,
    payg_rate_usd: clean ? rate : null,
    rate_status: usage === 0n ? 'no_usage' : clean ? 'payg_observed' : 'package_or_plan' };
}
