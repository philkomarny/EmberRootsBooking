import pool from '../_lib/config/database.js';

export default async function handler(req, res) {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        await pool.query(
            `DELETE FROM client_otp_codes WHERE expires_at < NOW() - INTERVAL '1 hour'`
        );
        await pool.query(
            `DELETE FROM client_sessions WHERE expires_at < NOW()`
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Cleanup error:', err);
        res.status(500).json({ error: 'Cleanup failed' });
    }
}
