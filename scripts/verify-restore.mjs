import pg from 'pg';
import manifest from '../tmp/backups/neon-2026-09-23T12-30-35-297Z/manifest.json' with { type: 'json' };
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
let ok = true;
for (const t of manifest.tables) {
  const r = await c.query(`select count(*)::int as count from "${t.schema}"."${t.table}"`);
  const count = r.rows[0].count;
  if (count !== t.rows) ok = false;
  console.log(`${t.schema}.${t.table}: ${count}/${t.rows}`);
}
await c.end();
if (!ok) process.exit(1);
console.log('All restored row counts match backup manifest.');
