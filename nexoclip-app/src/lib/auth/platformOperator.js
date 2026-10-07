// Only server configuration grants platform access. Workspace roles and client
// capability flags must never be used as an admin authorization decision.
export function isPlatformOperator(userId, env = process.env) {
  if (typeof userId !== 'string' || !userId) return false;
  return String(env.NEXOCLIP_OPERATOR_USER_IDS || '').split(',').map((id) => id.trim()).filter(Boolean).includes(userId);
}

export function operatorError() {
  return Object.assign(new Error('Platform operator access required'), { status: 403, code: 'PLATFORM_OPERATOR_REQUIRED' });
}

export function requirePlatformOperator(userId, env = process.env) {
  if (!isPlatformOperator(userId, env)) throw operatorError();
}
