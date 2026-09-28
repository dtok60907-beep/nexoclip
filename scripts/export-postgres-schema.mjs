#!/usr/bin/env node
import fs from 'node:fs/promises';
import pg from 'pg';

const output = process.argv[2];
if (!output) throw new Error('Usage: DATABASE_URL=... node scripts/export-postgres-schema.mjs <output.sql>');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

const { rows: tables } = await client.query(`
  select n.nspname as schema, c.relname as table_name, c.oid as table_oid
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'r' and n.nspname = 'public'
  order by c.relname
`);
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
const statements = ['-- Schema exported from Neon source database', 'CREATE SCHEMA IF NOT EXISTS public;', ''];

for (const table of tables) {
  const { rows: columns } = await client.query(`
    select a.attname as name,
           pg_catalog.format_type(a.atttypid, a.atttypmod) as type,
           a.attnotnull as not_null,
           pg_get_expr(ad.adbin, ad.adrelid) as default_value
    from pg_attribute a
    left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
    where a.attrelid = $1 and a.attnum > 0 and not a.attisdropped
    order by a.attnum
  `, [table.table_oid]);
  const definitions = columns.map((column) => [
    quote(column.name), column.type,
    column.default_value ? `DEFAULT ${column.default_value}` : '',
    column.not_null ? 'NOT NULL' : '',
  ].filter(Boolean).join(' '));
  statements.push(`CREATE TABLE public.${quote(table.table_name)} (\n  ${definitions.join(',\n  ')}\n);`, '');
}

await client.end();
await fs.writeFile(output, statements.join('\n'));
console.log(`Exported ${tables.length} tables to ${output}`);
