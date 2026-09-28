#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function parseEnvFile(text) {
  const env = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function sqlString(value) {
  if (value === null || value === undefined) return 'NULL';
  if (Buffer.isBuffer(value)) return `E'\\x${value.toString('hex')}'`;
  if (value instanceof Date) return `'${value.toISOString().replace(/'/g, "''")}'`;
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

function ident(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

async function main() {
  const envPath = process.argv[2] || path.join(repoRoot, '.env.production');
  const env = parseEnvFile(await fs.readFile(envPath, 'utf8'));
  const connectionString = process.env.DATABASE_URL_SPITE || process.env.DATABASE_URL || env.DATABASE_URL_SPITE || env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL_SPITE atau DATABASE_URL tidak ditemukan');

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(repoRoot, 'tmp', 'backups', `neon-${stamp}`);
  await fs.mkdir(outDir, { recursive: true });

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const dbInfo = await client.query('select current_database() as database, current_user as "user", version() as version');
  const tablesRes = await client.query(`
    select table_schema, table_name
    from information_schema.tables
    where table_type = 'BASE TABLE'
      and table_schema not in ('pg_catalog', 'information_schema')
    order by table_schema, table_name
  `);

  const manifest = {
    created_at: new Date().toISOString(),
    source: dbInfo.rows[0],
    tables: [],
  };
  const sqlParts = [
    '-- NexoClip Neon local backup',
    `-- Created at: ${manifest.created_at}`,
    `-- Database: ${dbInfo.rows[0].database}`,
    '',
    'SET session_replication_role = replica;',
    '',
  ];

  for (const table of tablesRes.rows) {
    const { table_schema: schema, table_name: tableName } = table;
    const fullName = `${ident(schema)}.${ident(tableName)}`;
    const rowsRes = await client.query(`select * from ${fullName}`);
    const colRes = await client.query(
      `select column_name
       from information_schema.columns
       where table_schema = $1 and table_name = $2
       order by ordinal_position`,
      [schema, tableName],
    );
    const columns = colRes.rows.map((r) => r.column_name);
    const tableFile = `${schema}.${tableName}.json`;
    await fs.writeFile(path.join(outDir, tableFile), JSON.stringify(rowsRes.rows, null, 2));

    manifest.tables.push({ schema, table: tableName, rows: rowsRes.rowCount, file: tableFile });
    sqlParts.push(`-- ${schema}.${tableName}: ${rowsRes.rowCount} rows`);
    sqlParts.push(`TRUNCATE TABLE ${fullName} RESTART IDENTITY CASCADE;`);
    if (rowsRes.rowCount > 0) {
      const columnSql = columns.map(ident).join(', ');
      for (const row of rowsRes.rows) {
        const values = columns.map((c) => sqlString(row[c])).join(', ');
        sqlParts.push(`INSERT INTO ${fullName} (${columnSql}) VALUES (${values});`);
      }
    }
    sqlParts.push('');
    console.log(`${schema}.${tableName}: ${rowsRes.rowCount} rows`);
  }

  sqlParts.push('SET session_replication_role = DEFAULT;', '');
  await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await fs.writeFile(path.join(outDir, 'data.sql'), sqlParts.join('\n'));

  await client.end();
  console.log(`\nBackup saved to: ${outDir}`);
  console.log(`Manifest: ${path.join(outDir, 'manifest.json')}`);
  console.log(`SQL data: ${path.join(outDir, 'data.sql')}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
