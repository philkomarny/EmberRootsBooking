/**
 * Database Connection Pool (Serverless-adapted)
 */

import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    },
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
    options: '-c timezone=America/New_York',
});

pool.on('error', (err) => {
    console.error('Unexpected database error:', err);
});

/**
 * Query helper
 */
export async function query(text, params) {
    const res = await pool.query(text, params);
    return res;
}

/**
 * Get a client for transactions
 */
export async function getClient() {
    return pool.connect();
}

export default pool;
