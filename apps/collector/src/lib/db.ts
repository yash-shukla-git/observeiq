import { Pool } from 'pg';

// SSL is only forced when DATABASE_SSL=true (Neon). Local Postgres has no SSL.
export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? true : undefined,
});
