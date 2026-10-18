// While an operator impersonates a customer, their own session token waits in
// OPERATOR_SESSION_COOKIE. IMPERSONATION_COOKIE holds no secret: the page reads it
// to show the banner, and the middleware to block writes in read-only mode.
export const OPERATOR_SESSION_COOKIE = 'nexoclip_operator_session';
export const IMPERSONATION_COOKIE = 'nexoclip_impersonation';

// What a read-only impersonation may still send: reads, leaving it, and signing out.
export function allowedWhileReadOnly(method, pathname) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;
  return /\/api\/admin\/impersonate$/.test(pathname) || /\/api\/auth\/logout$/.test(pathname);
}
