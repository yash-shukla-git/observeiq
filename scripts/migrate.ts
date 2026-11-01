import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const migrationsDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../apps/worker/migrations'
);

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? true : undefined,
});

async function main() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            name       TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    const applied = await pool.query('SELECT name FROM schema_migrations');
    const done = new Set(applied.rows.map((r) => r.name));

    // file names start with a number, so sorting them gives the right order
    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files) {
        if (done.has(file)) continue;

        const sql = await readFile(path.join(migrationsDir, file), 'utf8');
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(sql);
            await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
            await client.query('COMMIT');
            console.log(`[migrate] applied ${file}`);
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    console.log('[migrate] up to date');
}

main()
    .catch((err) => {
        console.error('[migrate] failed:', err);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
