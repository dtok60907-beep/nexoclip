import { encryptTikTokSecret,decryptTikTokSecret } from './tiktokCrypto.mjs';

// Reuse the authenticated token envelope with a separate Meta encryption key.
export const encryptMetaToken=(value,env=process.env)=>encryptTikTokSecret(value,{TIKTOK_TOKEN_ENCRYPTION_KEY:env.META_TOKEN_ENCRYPTION_KEY});
export const decryptMetaToken=(value,env=process.env)=>decryptTikTokSecret(value,{TIKTOK_TOKEN_ENCRYPTION_KEY:env.META_TOKEN_ENCRYPTION_KEY});
