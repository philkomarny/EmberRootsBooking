/**
 * Booking Routes (Public + Admin)
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, getClient } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { sendBookingNotifications } from '../services/notifications.js';
import { body, param, validationResult } from 'express-validator';

const router = Router();

/**
 * Generate a short, readable confirmation code
 */
function generateConfirmationCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function handleValidationErrors(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array().map(e => e.msg) });
    }
    next();
}

/**
 * POST /api/bookings
 * Create a new booking (public endpoint)
 */
router.post('/', [
    body('stylist_id').isUUID().withMessage('Invalid stylist ID'),
    body('service_id').isUUID().withMessage('Invalid service ID'),
    body('start_datetime').isISO8601().withMessage('Invalid date format'),
    body('client_name').isString().trim().isLength({ min: 1, max: 100 }).withMessage('Client name required (max 100 chars)'),
    body('client_email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('client_phone').optional().isMobilePhone('any').withMessage('Invalid phone number'),
    body('client_notes').optional().isString().isLength({ max: 500 }).withMessage('Notes max 500 chars'),
    handleValidationErrors
], async (req, res, next) => {
    const client = await getClient();

    try {
        const {
            stylist_id,
            service_id,
            start_datetime,
            client_name,
            client_email,
            client_phone,
            client_notes
        } = req.body;

        await client.query('BEGIN');

        // Get service details
        const serviceResult = await client.query(`
            SELECT
                s.name,
                COALESCE(ss.custom_duration, s.duration_minutes) as duration,
                COALESCE(ss.custom_price, s.price) as price
            FROM services s
            LEFT JOIN stylist_services ss ON s.id = ss.service_id AND ss.stylist_id = $1
            WHERE s.id = $2 AND s.is_active = true
        `, [stylist_id, service_id]);

        if (serviceResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Service not found' });
        }

        const service = serviceResult.rows[0];

        // Get stylist name
        const stylistResult = await client.query(
            `SELECT name FROM stylists WHERE id = $1 AND is_active = true`,
            [stylist_id]
        );

        if (stylistResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Stylist not found' });
        }

        const stylistName = stylistResult.rows[0].name;

        // Calculate end time
        const startDate = new Date(start_datetime);
        const endDate = new Date(startDate.getTime() + service.duration * 60 * 1000);

        // Check for conflicts (double-booking)
        const conflictResult = await client.query(`
            SELECT id FROM bookings
            WHERE stylist_id = $1
              AND status NOT IN ('cancelled')
              AND (
                  (start_datetime <= $2 AND end_datetime > $2)
                  OR (start_datetime < $3 AND end_datetime >= $3)
                  OR (start_datetime >= $2 AND end_datetime <= $3)
              )
        `, [stylist_id, startDate.toISOString(), endDate.toISOString()]);

        if (conflictResult.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'This time slot is no longer available' });
        }

        // Find or create client
        let clientId;
        const existingClient = await client.query(
            `SELECT id FROM clients WHERE email = $1`,
            [client_email.toLowerCase()]
        );

        if (existingClient.rows.length > 0) {
            clientId = existingClient.rows[0].id;
            // Update client info
            await client.query(`
                UPDATE clients
                SET first_name = $1, phone = $2, updated_at = CURRENT_TIMESTAMP
                WHERE id = $3
            `, [client_name.split(' ')[0], client_phone, clientId]);
        } else {
            const nameParts = client_name.split(' ');
            const newClient = await client.query(`
                INSERT INTO clients (email, phone, first_name, last_name)
                VALUES ($1, $2, $3, $4)
                RETURNING id
            `, [
                client_email.toLowerCase(),
                client_phone,
                nameParts[0],
                nameParts.slice(1).join(' ') || null
            ]);
            clientId = newClient.rows[0].id;
        }

        // Generate unique confirmation code
        let confirmationCode;
        let isUnique = false;
        while (!isUnique) {
            confirmationCode = generateConfirmationCode();
            const existing = await client.query(
                `SELECT id FROM bookings WHERE confirmation_code = $1`,
                [confirmationCode]
            );
            isUnique = existing.rows.length === 0;
        }

        // Create booking
        const bookingResult = await client.query(`
            INSERT INTO bookings (
                confirmation_code,
                client_id,
                stylist_id,
                service_id,
                service_name,
                service_duration,
                service_price,
                stylist_name,
                start_datetime,
                end_datetime,
                status,
                client_name,
                client_email,
                client_phone,
                client_notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING *
        `, [
            confirmationCode,
            clientId,
            stylist_id,
            service_id,
            service.name,
            service.duration,
            service.price,
            stylistName,
            startDate.toISOString(),
            endDate.toISOString(),
            'confirmed',
            client_name,
            client_email.toLowerCase(),
            client_phone,
            client_notes
        ]);

        await client.query('COMMIT');

        const booking = bookingResult.rows[0];

        // Send notifications (async, don't wait)
        sendBookingNotifications(booking).then(results => {
            // Update notification timestamps
            if (results.email) {
                query(`UPDATE bookings SET confirmation_sent_at = CURRENT_TIMESTAMP WHERE id = $1`, [booking.id]);
            }
        });

        res.status(201).json({
            success: true,
            booking: {
                id: booking.id,
                confirmation_code: booking.confirmation_code,
                service_name: booking.service_name,
                stylist_name: booking.stylist_name,
                start_datetime: booking.start_datetime,
                end_datetime: booking.end_datetime,
                price: booking.service_price
            }
        });

    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

/**
 * GET /api/bookings/lookup/:code
 * Look up booking by confirmation code (public)
 */
router.get('/lookup/:code', async (req, res, next) => {
    try {
        const { code } = req.params;

        const result = await query(`
            SELECT
                id,
                confirmation_code,
                service_name,
                service_duration,
                service_price,
                stylist_name,
                start_datetime,
                end_datetime,
                status,
                client_name
            FROM bookings
            WHERE confirmation_code = $1
        `, [code.toUpperCase()]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        res.json(result.rows[0]);

    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/bookings/:id/cancel
 * Cancel a booking (public with confirmation code, or admin)
 */
router.post('/:id/cancel', async (req, res, next) => {
    try {
        const { id } = req.params;
        const { confirmation_code, reason } = req.body;

        let booking;

        // Try public auth via confirmation code
        if (confirmation_code) {
            const result = await query(
                `SELECT * FROM bookings WHERE id = $1 AND confirmation_code = $2`,
                [id, confirmation_code.toUpperCase()]
            );
            booking = result.rows[0];
        }

        // Fallback: try admin JWT auth
        if (!booking) {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ error: 'Confirmation code or admin authentication required' });
            }
            try {
                const token = authHeader.split(' ')[1];
                const jwt = (await import('jsonwebtoken')).default;
                jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
                // Admin verified — fetch booking by ID only
                const result = await query(`SELECT * FROM bookings WHERE id = $1`, [id]);
                booking = result.rows[0];
            } catch {
                return res.status(401).json({ error: 'Invalid authentication' });
            }
        }

        if (!booking) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        if (booking.status === 'cancelled') {
            return res.status(400).json({ error: 'Booking is already cancelled' });
        }

        await query(`
            UPDATE bookings
            SET status = 'cancelled',
                cancelled_at = CURRENT_TIMESTAMP,
                cancellation_reason = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [id, reason]);

        res.json({ success: true, message: 'Booking cancelled' });

    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/bookings (Admin only)
 * Get all bookings with filters
 */
router.get('/', authenticate, async (req, res, next) => {
    try {
        const { stylist_id, status, date_from, date_to } = req.query;
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
        const offset = Math.max(parseInt(req.query.offset) || 0, 0);

        let whereClause = 'WHERE 1=1';
        const params = [];
        let paramIndex = 1;

        // If stylist role, only show their bookings
        if (req.user.role === 'stylist' && req.user.stylist_id) {
            whereClause += ` AND b.stylist_id = $${paramIndex++}`;
            params.push(req.user.stylist_id);
        } else if (stylist_id) {
            whereClause += ` AND b.stylist_id = $${paramIndex++}`;
            params.push(stylist_id);
        }

        if (status) {
            whereClause += ` AND b.status = $${paramIndex++}`;
            params.push(status);
        }

        if (date_from) {
            whereClause += ` AND b.start_datetime >= $${paramIndex++}`;
            params.push(date_from);
        }

        if (date_to) {
            whereClause += ` AND b.start_datetime <= $${paramIndex++}`;
            params.push(date_to);
        }

        const result = await query(`
            SELECT
                b.*,
                s.name as stylist_name_current
            FROM bookings b
            LEFT JOIN stylists s ON b.stylist_id = s.id
            ${whereClause}
            ORDER BY b.start_datetime DESC
            LIMIT $${paramIndex++} OFFSET $${paramIndex}
        `, [...params, limit, offset]);

        // Get total count
        const countResult = await query(`
            SELECT COUNT(*) FROM bookings b ${whereClause}
        `, params);

        res.json({
            bookings: result.rows,
            total: parseInt(countResult.rows[0].count),
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

    } catch (err) {
        next(err);
    }
});

/**
 * PATCH /api/bookings/:id (Admin only)
 * Update booking status or details
 */
router.patch('/:id', authenticate, async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status, internal_notes, tip_amount } = req.body;

        // IDOR protection: stylists can only update their own bookings
        if (req.user.role === 'stylist' && req.user.stylist_id) {
            const ownerCheck = await query(
                `SELECT stylist_id FROM bookings WHERE id = $1`,
                [id]
            );
            if (ownerCheck.rows.length === 0) {
                return res.status(404).json({ error: 'Booking not found' });
            }
            if (ownerCheck.rows[0].stylist_id !== req.user.stylist_id) {
                return res.status(403).json({ error: 'Cannot modify another stylist\'s booking' });
            }
        }

        const updates = [];
        const params = [];
        let paramIndex = 1;

        if (status) {
            updates.push(`status = $${paramIndex++}`);
            params.push(status);
            // Set cancelled_at timestamp when cancelling
            if (status === 'cancelled') {
                updates.push('cancelled_at = CURRENT_TIMESTAMP');
            }
        }

        if (internal_notes !== undefined) {
            updates.push(`internal_notes = $${paramIndex++}`);
            params.push(internal_notes);
        }

        if (tip_amount !== undefined) {
            updates.push(`tip_amount = $${paramIndex++}`);
            params.push(parseFloat(tip_amount) || 0);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No updates provided' });
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');
        params.push(id);

        const result = await query(`
            UPDATE bookings
            SET ${updates.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING *
        `, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        res.json(result.rows[0]);

    } catch (err) {
        next(err);
    }
});

export default router;
