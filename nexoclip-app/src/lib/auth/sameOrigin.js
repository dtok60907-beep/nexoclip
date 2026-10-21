// Whether a state-changing request comes from this app's own pages. Behind a proxy
// (Caddy locally, Railway in production) request.url carries the internal address, so
// the origin the browser saw is rebuilt from the forwarded host and protocol, or taken
// from PUBLIC_APP_URL.
export function isSameOriginRequest(request, env = process.env) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || url.protocol.replace(/:$/, '');
  const allowed = [url.origin, host ? `${proto}://${host}` : null];
  try { if (env.PUBLIC_APP_URL) allowed.push(new URL(env.PUBLIC_APP_URL).origin); } catch { /* not a URL */ }
  return allowed.includes(origin);
}

// The origin the browser uses for this app, for redirects and OAuth callback URLs:
// PUBLIC_APP_URL, else the forwarded host, else request.url.
export function publicAppOrigin(request, env = process.env) {
  try { if (env.PUBLIC_APP_URL) return new URL(env.PUBLIC_APP_URL).origin; } catch { /* not a URL */ }
  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || url.protocol.replace(/:$/, '');
  return host ? `${proto}://${host}` : url.origin;
}
