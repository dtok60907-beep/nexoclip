import pg from 'pg';

const { Pool } = pg;

let pool;
let poolUrl;

export function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  if (!pool || poolUrl !== process.env.DATABASE_URL) {
    if (pool) {
      pool.end().catch(() => {});
    }
    poolUrl = process.env.DATABASE_URL;
    pool = new Pool({ connectionString: poolUrl });
  }

  return pool;
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
    poolUrl = undefined;
  }
}
