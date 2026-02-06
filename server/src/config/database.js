/**
 * Database Connection Pool
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Build SSL config for production
function getSslConfig() {
    if (process.env.NODE_ENV !== 'production') return false;
    const config = {
        rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'false' ? false : true
    };
    if (process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'false') {
        console.warn('WARNING: DATABASE_SSL_REJECT_UNAUTHORIZED=false disables TLS certificate verification.');
    }
    if (process.env.DATABASE_SSL_CA) {
        config.ca = readFileSync(process.env.DATABASE_SSL_CA, 'utf8');
    }
    return config;
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: getSslConfig(),
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
