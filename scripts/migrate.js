import {readdir, readFile} from 'node:fs/promises';
import {pool, transaction} from '../server/db.js';
export async function migrate() {
 await transaction(async db => {
  await db.query('SELECT pg_advisory_xact_lock(7347501)');
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())');
  for (const name of (await readdir(new URL('../migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()) {
   if ((await db.query('SELECT 1 FROM schema_migrations WHERE name=$1',[name])).rowCount) continue;
   await db.query(await readFile(new URL('../migrations/'+name,import.meta.url),'utf8'));
   await db.query('INSERT INTO schema_migrations(name) VALUES($1)',[name]);
   console.log('Applied',name);
  }
 });
}
if (process.argv[1]?.endsWith('/migrate.js')) {try {await migrate();} finally {await pool.end();}}
