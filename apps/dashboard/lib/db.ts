import 'server-only';
import { Pool } from 'pg';

// In dev, Next reloads modules often. Keeping the pool on globalThis stops it from opening a new pool on every reload.
const globalForPool = globalThis as unknown as { pool?: Pool };

export const pool =
    globalForPool.pool ??
    new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_SSL === 'true' ? true : undefined,
    });

globalForPool.pool = pool;
