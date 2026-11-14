import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

function key(env = process.env) {
  const value = env.TIKTOK_TOKEN_ENCRYPTION_KEY;
  if (!/^[a-f\d]{64}$/i.test(value || '')) throw new Error('TIKTOK_TOKEN_ENCRYPTION_KEY must be 32-byte hex');
  return Buffer.from(value, 'hex');
}

export function encryptTikTokSecret(value, env = process.env) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(env), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptTikTokSecret(value, env = process.env) {
  const [iv, tag, encrypted] = String(value).split('.').map((part) => Buffer.from(part, 'base64url'));
  if (!iv || !tag || !encrypted || iv.length !== 12 || tag.length !== 16) throw new Error('Encrypted TikTok credential is invalid');
  const decipher = createDecipheriv('aes-256-gcm', key(env), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function hashTikTokValue(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function createTikTokPkce() {
  const verifier = randomBytes(48).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('hex') };
}

export function matchesTikTokOAuthState(received, cookie) {
  if (typeof received !== 'string' || typeof cookie !== 'string' || received.length !== cookie.length) return false;
  return timingSafeEqual(Buffer.from(received),Buffer.from(cookie));
}
