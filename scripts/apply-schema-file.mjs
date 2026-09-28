#!/usr/bin/env node
import fs from 'node:fs/promises';
import pg from 'pg';

const file = process.argv[2];
if (!file) throw new Error('Usage: DATABASE_URL=... node scripts/apply-schema-file.mjs <schema.sql>');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const sql = await fs.readFile(file, 'utf8');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log(`Applied schema: ${file}`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
