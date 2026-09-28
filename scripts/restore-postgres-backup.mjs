#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const backupDir = process.argv[2];
const connectionString = process.env.DATABASE_URL;

if (!backupDir) throw new Error('Usage: DATABASE_URL=... node scripts/restore-postgres-backup.mjs <backup-directory>');
if (!connectionString) throw new Error('DATABASE_URL is required');

function ident(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

function normalizeValue(value, type) {
  if (type === 'bytea' && value?.type === 'Buffer' && Array.isArray(value.data)) return Buffer.from(value.data);
  if ((type === 'json' || type === 'jsonb') && value !== null && typeof value === 'object') return JSON.stringify(value);
  return value;
}

const manifest = JSON.parse(await fs.readFile(path.join(backupDir, 'manifest.json'), 'utf8'));
const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query('BEGIN');
  await client.query('SET CONSTRAINTS ALL DEFERRED');

  const tables = manifest.tables.map(({ schema, table }) => `${ident(schema)}.${ident(table)}`).join(', ');
  if (tables) await client.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);

  const tablePriority = new Map([
    ['projects', 0],
    ['asset_folders', 1],
    ['asset_folder_items', 2],
  ]);
  const restoreTables = [...manifest.tables].sort((a, b) =>
    (tablePriority.get(a.table) ?? 1) - (tablePriority.get(b.table) ?? 1),
  );

  for (const { schema, table, file } of restoreTables) {
    const rows = JSON.parse(await fs.readFile(path.join(backupDir, file), 'utf8'));
    if (!rows.length) {
      console.log(`${schema}.${table}: restored 0 rows`);
      continue;
    }

    const columns = Object.keys(rows[0]);
    const fullName = `${ident(schema)}.${ident(table)}`;
    const typeResult = await client.query(
      `SELECT column_name, udt_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
      [schema, table],
    );
    const types = new Map(typeResult.rows.map((column) => [column.column_name, column.udt_name]));
    const columnNames = columns.map(ident).join(', ');
    const maxParams = 60000;
    const chunkSize = Math.max(1, Math.floor(maxParams / columns.length));

    for (let offset = 0; offset < rows.length; offset += chunkSize) {
      const chunk = rows.slice(offset, offset + chunkSize);
      const values = [];
      const valueGroups = chunk.map((row, rowIndex) => {
        const placeholders = columns.map((column, columnIndex) => {
          values.push(normalizeValue(row[column], types.get(column)));
          return `$${rowIndex * columns.length + columnIndex + 1}`;
        });
        return `(${placeholders.join(', ')})`;
      });
      await client.query(`INSERT INTO ${fullName} (${columnNames}) VALUES ${valueGroups.join(', ')}`, values);
    }
    console.log(`${schema}.${table}: restored ${rows.length} rows`);
  }

  await client.query('COMMIT');
  console.log(`Restore completed from: ${backupDir}`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
