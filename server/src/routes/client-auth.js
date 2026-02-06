/**
 * Client Authentication Routes
 * OTP-based authentication for booking flow
 */

import express from 'express';
import crypto from 'crypto';
import pool from '../config/database.js';
import { sendOTPEmail, sendOTPSMS, isEmailConfigured } from '../services/notifications.js';

const router = express.Router();

/**
 * Generate 6-digit OTP code
 */
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Generate session token
 */
function generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * POST /api/client-auth/send-otp
 * Send OTP to email or phone
 */
router.post('/send-otp', async (req, res) => {
    const { email, phone } = req.body;

    if (!email && !phone) {
        return res.status(400).json({ error: 'Email or phone required' });
    }

    const client = await pool.connect();

    try {
        const code = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Check if client exists
        let existingClient = null;
        if (email) {
            const result = await client.query(
                'SELECT id, first_name, last_name, email, phone FROM clients WHERE email = $1',
                [email.toLowerCase()]
            );
            existingClient = result.rows[0];
        } else if (phone) {
            const result = await client.query(
                'SELECT id, first_name, last_name, email, phone FROM clients WHERE phone = $1',
                [phone]
            );
            existingClient = result.rows[0];
        }

        // Store OTP code
        await client.query(
            `INSERT INTO client_otp_codes (client_email, client_phone, code, expires_at)
             VALUES ($1, $2, $3, $4)`,
            [email?.toLowerCase() || null, phone || null, code, expiresAt]
        );

        // Send OTP via appropriate channel
        let sent = false;
        if (email) {
            sent = await sendOTPEmail(email, code);
        } else if (phone) {
            sent = await sendOTPSMS(phone, code);
        }

        // Build response
        const response = {
            success: true,
            isReturning: !!existingClient,
            clientPreview: existingClient ? {
                firstName: existingClient.first_name,
                lastInitial: existingClient.last_name?.[0] || '',
            } : null,
            channel: email ? 'email' : 'sms',
            sent
        };

        // Dev mode: include OTP code in response when email/SMS is not configured
        if (!sent && process.env.NODE_ENV === 'development') {
            response.devCode = code;
            response.devMode = true;
        }

        res.json(response);

    } catch (err) {
        console.error('Send OTP error:', err);
        res.status(500).json({ error: 'Failed to send verification code' });
    } finally {
        client.release();
    }
});

/**
 * POST /api/client-auth/verify-otp
 * Verify OTP and return session
 */
router.post('/verify-otp', async (req, res) => {
    const { email, phone, code } = req.body;

    if (!code || (!email && !phone)) {
        return res.status(400).json({ error: 'Code and contact info required' });
    }

    const client = await pool.connect();

    try {
        // Find valid OTP
        let otpQuery = `
            SELECT id FROM client_otp_codes
            WHERE code = $1
            AND expires_at > NOW()
            AND verified_at IS NULL
        `;
        const params = [code];

        if (email) {
            otpQuery += ` AND client_email = $${params.length + 1}`;
            params.push(email.toLowerCase());
        } else {
            otpQuery += ` AND client_phone = $${params.length + 1}`;
            params.push(phone);
        }

        const otpResult = await client.query(otpQuery, params);

        if (otpResult.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired code' });
        }

        // Mark OTP as verified
        await client.query(
            'UPDATE client_otp_codes SET verified_at = NOW() WHERE id = $1',
            [otpResult.rows[0].id]
        );

        // Look up client
        let clientResult;
        if (email) {
            clientResult = await client.query(
                'SELECT * FROM clients WHERE email = $1',
                [email.toLowerCase()]
            );
        } else {
            clientResult = await client.query(
                'SELECT * FROM clients WHERE phone = $1',
                [phone]
            );
        }

        const existingClient = clientResult.rows[0];
        const isReturning = !!existingClient;

        // Create session
        const sessionToken = generateSessionToken();
        const sessionExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        if (existingClient) {
            await client.query(
                `INSERT INTO client_sessions (client_id, session_token, expires_at)
                 VALUES ($1, $2, $3)`,
                [existingClient.id, sessionToken, sessionExpires]
            );
        }

        res.json({
            success: true,
            isReturning,
            sessionToken,
            client: existingClient ? {
                id: existingClient.id,
                firstName: existingClient.first_name,
                lastName: existingClient.last_name,
                email: existingClient.email,
                phone: existingClient.phone,
                avatarUrl: existingClient.avatar_url,
                addressStreet: existingClient.address_street,
                addressCity: existingClient.address_city,
                addressState: existingClient.address_state,
                addressZip: existingClient.address_zip,
                instagramUrl: existingClient.instagram_url,
                facebookUrl: existingClient.facebook_url,
                tiktokUrl: existingClient.tiktok_url
            } : null,
            pendingContact: existingClient ? null : { email, phone }
        });

    } catch (err) {
        console.error('Verify OTP error:', err);
        res.status(500).json({ error: 'Verification failed' });
    } finally {
        client.release();
    }
});

/**
 * POST /api/client-auth/register
 * Register new client after OTP verification
 */
router.post('/register', async (req, res) => {
    const {
        sessionToken,
        firstName,
        lastName,
        email,
        phone,
        avatarUrl,
        addressStreet,
        addressCity,
        addressState,
        addressZip,
        instagramUrl,
        facebookUrl,
        tiktokUrl
    } = req.body;

    if (!firstName || (!email && !phone)) {
        return res.status(400).json({ error: 'First name and contact info required' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Check if client already exists
        let existingClient = null;
        if (email) {
            const result = await client.query(
                'SELECT id FROM clients WHERE email = $1',
                [email.toLowerCase()]
            );
            existingClient = result.rows[0];
        }

        let clientId;

        if (existingClient) {
            // Update existing client
            const updateResult = await client.query(
                `UPDATE clients SET
                    first_name = $2,
                    last_name = $3,
                    phone = COALESCE($4, phone),
                    avatar_url = COALESCE($5, avatar_url),
                    address_street = COALESCE($6, address_street),
                    address_city = COALESCE($7, address_city),
                    address_state = COALESCE($8, address_state),
                    address_zip = COALESCE($9, address_zip),
                    instagram_url = COALESCE($10, instagram_url),
                    facebook_url = COALESCE($11, facebook_url),
                    tiktok_url = COALESCE($12, tiktok_url),
                    updated_at = NOW()
                WHERE id = $1
                RETURNING *`,
                [
                    existingClient.id,
                    firstName,
                    lastName || null,
                    phone || null,
                    avatarUrl || null,
                    addressStreet || null,
                    addressCity || null,
                    addressState || null,
                    addressZip || null,
                    instagramUrl || null,
                    facebookUrl || null,
                    tiktokUrl || null
                ]
            );
            clientId = existingClient.id;
        } else {
            // Create new client
            const insertResult = await client.query(
                `INSERT INTO clients (
                    first_name, last_name, email, phone,
                    avatar_url, address_street, address_city, address_state, address_zip,
                    instagram_url, facebook_url, tiktok_url
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING *`,
                [
                    firstName,
                    lastName || null,
                    email?.toLowerCase() || null,
                    phone || null,
                    avatarUrl || null,
                    addressStreet || null,
                    addressCity || null,
                    addressState || null,
                    addressZip || null,
                    instagramUrl || null,
                    facebookUrl || null,
                    tiktokUrl || null
                ]
            );
            clientId = insertResult.rows[0].id;
        }

        // Create/update session
        const newSessionToken = generateSessionToken();
        const sessionExpires = new Date(Date.now() + 60 * 60 * 1000);

        await client.query(
            `INSERT INTO client_sessions (client_id, session_token, expires_at)
             VALUES ($1, $2, $3)`,
            [clientId, newSessionToken, sessionExpires]
        );

        // Fetch complete client data
        const clientData = await client.query(
            'SELECT * FROM clients WHERE id = $1',
            [clientId]
        );

        await client.query('COMMIT');

        res.json({
            success: true,
            sessionToken: newSessionToken,
            client: {
                id: clientData.rows[0].id,
                firstName: clientData.rows[0].first_name,
                lastName: clientData.rows[0].last_name,
                email: clientData.rows[0].email,
                phone: clientData.rows[0].phone,
                avatarUrl: clientData.rows[0].avatar_url,
                addressStreet: clientData.rows[0].address_street,
                addressCity: clientData.rows[0].address_city,
                addressState: clientData.rows[0].address_state,
                addressZip: clientData.rows[0].address_zip,
                instagramUrl: clientData.rows[0].instagram_url,
                facebookUrl: clientData.rows[0].facebook_url,
                tiktokUrl: clientData.rows[0].tiktok_url
            }
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Register client error:', err);
        res.status(500).json({ error: 'Registration failed' });
    } finally {
        client.release();
    }
});

/**
 * GET /api/client-auth/session
 * Validate session and get client info
 */
router.get('/session', async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'No session token' });
    }

    try {
        const result = await pool.query(
            `SELECT c.* FROM client_sessions s
             JOIN clients c ON s.client_id = c.id
             WHERE s.session_token = $1 AND s.expires_at > NOW()`,
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid or expired session' });
        }

        const clientData = result.rows[0];
        res.json({
            client: {
                id: clientData.id,
                firstName: clientData.first_name,
                lastName: clientData.last_name,
                email: clientData.email,
                phone: clientData.phone,
                avatarUrl: clientData.avatar_url,
                addressStreet: clientData.address_street,
                addressCity: clientData.address_city,
                addressState: clientData.address_state,
                addressZip: clientData.address_zip
            }
        });

    } catch (err) {
        console.error('Session validation error:', err);
        res.status(500).json({ error: 'Session validation failed' });
    }
});

export default router;
