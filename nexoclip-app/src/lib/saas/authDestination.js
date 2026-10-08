// Navigation hints come from authenticated server responses. Authorization
// still belongs to the server routes; client state cannot grant COGS access.
export function safeAuthReturnTo(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) return '/studio';
  return value;
}

export function postLoginDestination(result, returnTo = '/studio') {
  return result?.user?.isPlatformOperator === true ? '/admin/economics' : safeAuthReturnTo(returnTo);
}
