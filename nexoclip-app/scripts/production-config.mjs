import { deploymentEnvironment } from '../src/lib/deploymentEnvironment.js';
const requiredProduction = [
  'POSTGRES_PASSWORD',
  'DATABASE_URL_SPITE',
  'LOCAL_OBJECT_STORAGE_SECRET',
  'CANVAS_AUTH_URL',
  'CANVAS_AUTH_HMAC_SECRET',
  'REALTIME_JWT_SECRET',
  'NEXOCLIP_INTERNAL_URL',
  'NEXT_PUBLIC_REALTIME_URL',
];

const PUBLIC_DATABASE_PATTERN = /(postgres(?:ql)?:\/\/|DATABASE_URL(?:_[A-Z0-9_]+)?|password=|sslmode=)/i;

export function validateProductionEnvironment(env = process.env) {
  if (env.NODE_ENV !== 'production') return { ok: true, errors: [] };

  const errors = [];
  if (env.NEXOCLIP_ENVIRONMENT!=='production') errors.push('NEXOCLIP_ENVIRONMENT must explicitly be production for production deployment');
  try {deploymentEnvironment(env);} catch(error) {errors.push(error.message);}
  for (const name of requiredProduction) {
    if (!String(env[name] || '').trim()) errors.push(`${name} is required`);
  }
  if (String(env.POSTGRES_PASSWORD || '').trim().length < 24) {
    errors.push('POSTGRES_PASSWORD must be at least 24 characters');
  }
  if (env.LOCAL_OBJECT_STORAGE_SECRET === 'development-only-change-me') {
    errors.push('LOCAL_OBJECT_STORAGE_SECRET must not use the development default');
  }
  for (const [name, value] of Object.entries(env)) {
    if (/^NEXT_PUBLIC_.*(KEY|SECRET|TOKEN|PASSWORD)$/i.test(name)) {
      errors.push(`${name} must not contain a server secret`);
    }
    if (!name.startsWith('NEXT_PUBLIC_')) {
      continue;
    }

    if (/DATABASE_URL/i.test(name) || PUBLIC_DATABASE_PATTERN.test(String(value || ''))) {
      errors.push(`${name} must not contain a database credential`);
    }
  }
  return { ok: errors.length === 0, errors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = validateProductionEnvironment();
  if (result.ok) console.log('Production environment configuration is valid.');
  else {
    console.error(['Production environment configuration is invalid:', ...result.errors.map((error) => `- ${error}`)].join('\n'));
    process.exitCode = 1;
  }
}
