/**
 * Database Connection Pool
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    options: '-c timezone=America/New_York',
});

pool.on('error', (err) => {
    console.error('Unexpected database error:', err);
});

/**
 * Query helper with automatic client release
 */
export async function query(text, params) {
    const start = Date.now();
    const res = await pool.query(text, params);
    const duration = Date.now() - start;

    if (process.env.NODE_ENV === 'development') {
        console.log('Executed query', { text: text.substring(0, 50), duration, rows: res.rowCount });
    }

    return res;
}

/**
 * Get a client for transactions
 */
export async function getClient() {
    return pool.connect();
}

export default pool;
