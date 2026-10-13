import pg from 'pg';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
export async function transaction(fn) {
  const db = await pool.connect();
  try { await db.query('BEGIN'); const result = await fn(db); await db.query('COMMIT'); return result; }
  catch (e) { await db.query('ROLLBACK'); throw e; }
  finally { db.release(); }
}
