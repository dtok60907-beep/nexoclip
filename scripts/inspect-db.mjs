import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
let r = await c.query("select table_name from information_schema.tables where table_schema=$1 order by 1", ['public']);
console.log(r.rows.map((x) => x.table_name).join('\n'));
for (const t of ['projects', 'canvas_nodes', 'canvas_edges', 'assets', 'asset_folders', 'asset_folder_items']) {
  r = await c.query("select column_name,data_type,udt_name,is_nullable from information_schema.columns where table_schema=$1 and table_name=$2 order by ordinal_position", ['public', t]);
  console.log('\n' + t, JSON.stringify(r.rows, null, 2));
}
await c.end();
