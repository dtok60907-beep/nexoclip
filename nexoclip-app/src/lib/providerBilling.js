// A provider refusing work because of OUR account (unpaid bill, out of quota, plan too small), not the user's request.
// The user is told the service is down on our side and that nothing was charged; retrying does not help, so it is
// not retried; operators get a log line to act on (and the admin Analytics page shows recent ones).
export const PROVIDER_BILLING_CODE = 'PROVIDER_BILLING_UNAVAILABLE';
export const PROVIDER_BILLING_MESSAGE = 'This service is temporarily unavailable on our side. Your credits were not charged. Please try again later.';

const ACCOUNT_PROBLEM = /overdue balance|insufficient (account )?balance|account (is )?(suspended|in arrears|overdue)|in arrears|quota_exceeded|exceeds? your (character )?quota|paid_plan_required|payment_required|not available for free users/i;

export function providerBillingFailure(provider, detail, { log = console.error } = {}) {
  const text = String(detail || '');
  if (!ACCOUNT_PROBLEM.test(text)) return null;
  log(JSON.stringify({ event: 'provider_billing_blocked', provider, detail: text.slice(0, 200) }));
  return { code: PROVIDER_BILLING_CODE, retryable: false, publicMessage: PROVIDER_BILLING_MESSAGE };
}
