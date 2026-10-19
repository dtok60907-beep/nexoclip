import { SUBSCRIPTION_PLANS, subscriptionsEnabled } from '../../../../src/services/subscriptionPlans.js';
import { TOPUP_PACKAGES } from '../../../../src/services/topupPackages.js';

// Prices for the public site (nexoclip.com): the plans when subscriptions are on, the
// top-up packages otherwise. No account data; cached briefly.
const ALLOWED_ORIGINS = new Set(['https://nexoclip.com', 'https://www.nexoclip.com', 'http://localhost:3000']);

function corsHeaders(request) {
  const origin = request.headers.get('origin');
  return {
    'Cache-Control': 'public, max-age=300',
    Vary: 'Origin',
    ...(origin && ALLOWED_ORIGINS.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
  };
}

export function GET(request) {
  return Response.json({
    subscriptionsEnabled: subscriptionsEnabled(),
    plans: SUBSCRIPTION_PLANS,
    topups: TOPUP_PACKAGES,
  }, { headers: corsHeaders(request) });
}
