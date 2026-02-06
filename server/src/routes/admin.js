/**
 * Admin Routes
 * Dashboard, stylist management, availability, time-off
 */

import { Router } from 'express';
import { query, getClient } from '../config/database.js';
import { authenticate, requireRole, canAccessStylist } from '../middleware/auth.js';
import { sendAdHocSMS } from '../services/notifications.js';

const router = Router();

// All admin routes require authentication
router.use(authenticate);

/**
 * GET /api/admin/dashboard
 * Get dashboard summary
 */
router.get('/dashboard', async (req, res, next) => {
    try {
        const stylistFilter = req.user.role === 'stylist' && req.user.stylist_id
            ? `AND stylist_id = '${req.user.stylist_id}'`
            : '';

        const today = new Date().toISOString().split('T')[0];
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        // Today's bookings
        const todayBookings = await query(`
            SELECT COUNT(*) as count, COALESCE(SUM(service_price), 0) as revenue
            FROM bookings
            WHERE DATE(start_datetime) = $1
              AND status NOT IN ('cancelled')
              ${stylistFilter}
        `, [today]);

        // This week's bookings
        const weekBookings = await query(`
            SELECT COUNT(*) as count, COALESCE(SUM(service_price), 0) as revenue
            FROM bookings
            WHERE DATE(start_datetime) >= $1
              AND status NOT IN ('cancelled')
              ${stylistFilter}
        `, [weekAgo]);

        // Upcoming bookings (next 7 days)
        const upcomingBookings = await query(`
            SELECT
                b.id,
                b.confirmation_code,
                b.service_name,
                b.stylist_name,
                b.client_name,
                b.start_datetime,
                b.status
            FROM bookings b
            WHERE b.start_datetime >= NOW()
              AND b.start_datetime < NOW() + INTERVAL '7 days'
              AND b.status NOT IN ('cancelled')
              ${stylistFilter}
            ORDER BY b.start_datetime
            LIMIT 10
        `);

        // Recent bookings
        const recentBookings = await query(`
            SELECT
                b.id,
                b.confirmation_code,
                b.service_name,
                b.stylist_name,
                b.client_name,
                b.start_datetime,
                b.status,
                b.created_at
            FROM bookings b
            ${stylistFilter ? 'WHERE ' + stylistFilter.replace('AND ', '') : ''}
            ORDER BY b.created_at DESC
            LIMIT 5
        `);

        res.json({
            today: {
                bookings: parseInt(todayBookings.rows[0].count),
                revenue: parseFloat(todayBookings.rows[0].revenue)
            },
            week: {
                bookings: parseInt(weekBookings.rows[0].count),
                revenue: parseFloat(weekBookings.rows[0].revenue)
            },
            upcoming: upcomingBookings.rows,
            recent: recentBookings.rows
        });

    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/admin/stylists
 * Get all stylists (owner only)
 */
router.get('/stylists', requireRole('owner'), async (req, res, next) => {
    try {
        const result = await query(`
            SELECT
                s.*,
                au.email as login_email,
                au.role,
                au.last_login
            FROM stylists s
            LEFT JOIN admin_users au ON s.id = au.stylist_id
            ORDER BY s.name
        `);

        res.json(result.rows);

    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/admin/stylists
 * Create new stylist (owner only)
 */
router.post('/stylists', requireRole('owner'), async (req, res, next) => {
    const client = await getClient();

    try {
        const {
            name, email, phone, bio, title,
            instagram_url, facebook_url, years_experience, color_code
        } = req.body;

        if (!name || !email) {
            return res.status(400).json({ error: 'Name and email required' });
        }

        await client.query('BEGIN');

        // Create stylist
        const stylistResult = await client.query(`
            INSERT INTO stylists (
                name, email, phone, bio, title,
                instagram_url, facebook_url, years_experience, color_code,
                is_active, display_on_website, accepting_new_clients
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, true, true)
            RETURNING *
        `, [
            name, email, phone, bio, title,
            instagram_url, facebook_url, years_experience || 0, color_code || '#D4944A'
        ]);

        const stylist = stylistResult.rows[0];

        // Create admin user with temporary password
        const bcrypt = await import('bcryptjs');
        const tempPassword = 'changeme123';
        const passwordHash = await bcrypt.default.hash(tempPassword, 10);

        await client.query(`
            INSERT INTO admin_users (stylist_id, email, password_hash, role)
            VALUES ($1, $2, $3, 'stylist')
        `, [stylist.id, email, passwordHash]);

        // Auto-populate all active services for the new stylist
        await client.query(`
            INSERT INTO stylist_services (stylist_id, service_id, is_active)
            SELECT $1, id, true
            FROM services
            WHERE is_active = true
        `, [stylist.id]);

        await client.query('COMMIT');

        res.status(201).json({
            ...stylist,
            temp_password: tempPassword
        });

    } catch (err) {
        await client.query('ROLLBACK');
        if (err.code === '23505') {
            return res.status(400).json({ error: 'Email already exists' });
        }
        next(err);
    } finally {
        client.release();
    }
});

/**
 * PATCH /api/admin/stylists/:id
 * Update stylist
 */
router.patch('/stylists/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const {
            name, phone, bio, is_active, title,
            instagram_url, facebook_url, website_url,
            specialties, certifications, years_experience,
            accepting_new_clients, display_on_website, color_code,
            avatar_url
        } = req.body;

        // Check permission
        if (req.user.role !== 'owner' && req.user.stylist_id !== id) {
            return res.status(403).json({ error: 'Cannot update other stylist' });
        }

        const updates = [];
        const params = [];
        let paramIndex = 1;

        if (name) {
            updates.push(`name = $${paramIndex++}`);
            params.push(name);
        }
        if (phone !== undefined) {
            updates.push(`phone = $${paramIndex++}`);
            params.push(phone);
        }
        if (bio !== undefined) {
            updates.push(`bio = $${paramIndex++}`);
            params.push(bio);
        }
        if (title !== undefined) {
            updates.push(`title = $${paramIndex++}`);
            params.push(title);
        }
        if (instagram_url !== undefined) {
            updates.push(`instagram_url = $${paramIndex++}`);
            params.push(instagram_url);
        }
        if (facebook_url !== undefined) {
            updates.push(`facebook_url = $${paramIndex++}`);
            params.push(facebook_url);
        }
        if (website_url !== undefined) {
            updates.push(`website_url = $${paramIndex++}`);
            params.push(website_url);
        }
        if (specialties !== undefined) {
            updates.push(`specialties = $${paramIndex++}`);
            params.push(Array.isArray(specialties) ? specialties : []);
        }
        if (certifications !== undefined) {
            updates.push(`certifications = $${paramIndex++}`);
            params.push(Array.isArray(certifications) ? certifications : []);
        }
        if (years_experience !== undefined) {
            updates.push(`years_experience = $${paramIndex++}`);
            params.push(years_experience);
        }
        if (color_code !== undefined) {
            updates.push(`color_code = $${paramIndex++}`);
            params.push(color_code);
        }
        if (avatar_url !== undefined) {
            updates.push(`avatar_url = $${paramIndex++}`);
            params.push(avatar_url);
        }
        if (is_active !== undefined && req.user.role === 'owner') {
            updates.push(`is_active = $${paramIndex++}`);
            params.push(is_active);
        }
        if (accepting_new_clients !== undefined) {
            updates.push(`accepting_new_clients = $${paramIndex++}`);
            params.push(accepting_new_clients);
        }
        if (display_on_website !== undefined) {
            updates.push(`display_on_website = $${paramIndex++}`);
            params.push(display_on_website);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No updates provided' });
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');
        params.push(id);

        const result = await query(`
            UPDATE stylists
            SET ${updates.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING *
        `, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Stylist not found' });
        }

        res.json(result.rows[0]);

    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/admin/availability/:stylistId
 * Get stylist's availability schedule
 */
router.get('/availability/:stylistId', async (req, res, next) => {
    try {
        const { stylistId } = req.params;

        // Check permission
        if (req.user.role !== 'owner' && req.user.stylist_id !== stylistId) {
            return res.status(403).json({ error: 'Cannot view other stylist availability' });
        }

        const result = await query(`
            SELECT *
            FROM stylist_availability
            WHERE stylist_id = $1
            ORDER BY day_of_week, start_time
        `, [stylistId]);

        res.json(result.rows);

    } catch (err) {
        next(err);
    }
});

/**
 * PUT /api/admin/availability/:stylistId
 * Set stylist's full availability schedule (replaces existing)
 */
router.put('/availability/:stylistId', async (req, res, next) => {
    const client = await getClient();

    try {
        const { stylistId } = req.params;
        const { schedule } = req.body; // Array of { day_of_week, start_time, end_time }

        // Check permission
        if (req.user.role !== 'owner' && req.user.stylist_id !== stylistId) {
            return res.status(403).json({ error: 'Cannot update other stylist availability' });
        }

        await client.query('BEGIN');

        // Delete existing availability
        await client.query(
            `DELETE FROM stylist_availability WHERE stylist_id = $1`,
            [stylistId]
        );

        // Insert new schedule
        for (const slot of schedule) {
            await client.query(`
                INSERT INTO stylist_availability (stylist_id, day_of_week, start_time, end_time)
                VALUES ($1, $2, $3, $4)
            `, [stylistId, slot.day_of_week, slot.start_time, slot.end_time]);
        }

        await client.query('COMMIT');

        // Return new schedule
        const result = await query(`
            SELECT * FROM stylist_availability
            WHERE stylist_id = $1
            ORDER BY day_of_week, start_time
        `, [stylistId]);

        res.json(result.rows);

    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

/**
 * GET /api/admin/time-off/:stylistId
 * Get stylist's time-off
 */
router.get('/time-off/:stylistId', async (req, res, next) => {
    try {
        const { stylistId } = req.params;

        // Check permission
        if (req.user.role !== 'owner' && req.user.stylist_id !== stylistId) {
            return res.status(403).json({ error: 'Cannot view other stylist time-off' });
        }

        const result = await query(`
            SELECT *
            FROM stylist_time_off
            WHERE stylist_id = $1
              AND end_datetime >= NOW()
            ORDER BY start_datetime
        `, [stylistId]);

        res.json(result.rows);

    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/admin/time-off/:stylistId
 * Add time-off for stylist
 */
router.post('/time-off/:stylistId', async (req, res, next) => {
    try {
        const { stylistId } = req.params;
        const { start_datetime, end_datetime, reason } = req.body;

        // Check permission
        if (req.user.role !== 'owner' && req.user.stylist_id !== stylistId) {
            return res.status(403).json({ error: 'Cannot add time-off for other stylist' });
        }

        if (!start_datetime || !end_datetime) {
            return res.status(400).json({ error: 'Start and end datetime required' });
        }

        const result = await query(`
            INSERT INTO stylist_time_off (stylist_id, start_datetime, end_datetime, reason)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `, [stylistId, start_datetime, end_datetime, reason]);

        res.status(201).json(result.rows[0]);

    } catch (err) {
        next(err);
    }
});

/**
 * DELETE /api/admin/time-off/:id
 * Remove time-off
 */
router.delete('/time-off/:id', async (req, res, next) => {
    try {
        const { id } = req.params;

        // Get time-off to check permission
        const timeOff = await query(
            `SELECT stylist_id FROM stylist_time_off WHERE id = $1`,
            [id]
        );

        if (timeOff.rows.length === 0) {
            return res.status(404).json({ error: 'Time-off not found' });
        }

        // Check permission
        if (req.user.role !== 'owner' && req.user.stylist_id !== timeOff.rows[0].stylist_id) {
            return res.status(403).json({ error: 'Cannot delete other stylist time-off' });
        }

        await query(`DELETE FROM stylist_time_off WHERE id = $1`, [id]);

        res.json({ success: true });

    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/admin/services
 * Get all services with stylist assignments
 */
router.get('/services', async (req, res, next) => {
    try {
        const result = await query(`
            SELECT
                s.*,
                sc.name as category_name,
                sc.id as category_id,
                sc.display_order as category_order,
                COALESCE(
                    json_agg(
                        jsonb_build_object(
                            'stylist_id', st.id,
                            'stylist_name', st.name,
                            'custom_price', ss.custom_price,
                            'custom_duration', ss.custom_duration
                        )
                    ) FILTER (WHERE st.id IS NOT NULL),
                    '[]'
                ) as assigned_stylists
            FROM services s
            JOIN service_categories sc ON s.category_id = sc.id
            LEFT JOIN stylist_services ss ON s.id = ss.service_id
            LEFT JOIN stylists st ON ss.stylist_id = st.id
            WHERE s.is_active = true
            GROUP BY s.id, sc.name, sc.id, sc.display_order
            ORDER BY sc.display_order, s.name
        `);

        res.json(result.rows);

    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/admin/stylist-services/:stylistId
 * Get all services with checked status for a specific stylist
 */
router.get('/stylist-services/:stylistId', async (req, res, next) => {
    try {
        const { stylistId } = req.params;

        // Check permission
        if (req.user.role !== 'owner' && req.user.stylist_id !== stylistId) {
            return res.status(403).json({ error: 'Cannot view other stylist services' });
        }

        const result = await query(`
            SELECT
                s.id,
                s.name,
                s.description,
                s.duration_minutes,
                s.price,
                sc.id as category_id,
                sc.name as category_name,
                sc.display_order as category_order,
                ss.id as assignment_id,
                ss.custom_price,
                ss.custom_duration,
                CASE WHEN ss.id IS NOT NULL THEN true ELSE false END as is_assigned
            FROM services s
            JOIN service_categories sc ON s.category_id = sc.id
            LEFT JOIN stylist_services ss ON s.id = ss.service_id AND ss.stylist_id = $1
            WHERE s.is_active = true AND sc.is_active = true
            ORDER BY sc.display_order, s.name
        `, [stylistId]);

        res.json(result.rows);

    } catch (err) {
        next(err);
    }
});

/**
 * PUT /api/admin/stylist-services/:stylistId
 * Update which services a stylist offers
 */
router.put('/stylist-services/:stylistId', async (req, res, next) => {
    const client = await getClient();

    try {
        const { stylistId } = req.params;
        const { services } = req.body; // Array of { service_id, custom_price?, custom_duration? }

        // Check permission
        if (req.user.role !== 'owner' && req.user.stylist_id !== stylistId) {
            return res.status(403).json({ error: 'Cannot update other stylist services' });
        }

        await client.query('BEGIN');

        // Delete existing assignments
        await client.query(
            `DELETE FROM stylist_services WHERE stylist_id = $1`,
            [stylistId]
        );

        // Insert new assignments
        for (const svc of services) {
            await client.query(`
                INSERT INTO stylist_services (stylist_id, service_id, custom_price, custom_duration, is_active)
                VALUES ($1, $2, $3, $4, true)
            `, [stylistId, svc.service_id, svc.custom_price || null, svc.custom_duration || null]);
        }

        await client.query('COMMIT');

        res.json({ success: true });

    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

/**
 * GET /api/admin/settings
 * Get all settings (owner only)
 */
router.get('/settings', requireRole('owner'), async (req, res, next) => {
    try {
        const result = await query(`SELECT * FROM settings ORDER BY key`);

        const settings = {};
        result.rows.forEach(row => {
            settings[row.key] = row.value;
        });

        res.json(settings);

    } catch (err) {
        next(err);
    }
});

/**
 * PATCH /api/admin/settings
 * Update settings (owner only)
 */
router.patch('/settings', requireRole('owner'), async (req, res, next) => {
    try {
        const updates = req.body;

        for (const [key, value] of Object.entries(updates)) {
            await query(`
                INSERT INTO settings (key, value, updated_at)
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
            `, [key, value]);
        }

        res.json({ success: true });

    } catch (err) {
        next(err);
    }
});

/**
 * ============================================
 * SERVICE CATEGORIES MANAGEMENT
 * ============================================
 */

/**
 * GET /api/admin/categories
 * Get all service categories
 */
router.get('/categories', async (req, res, next) => {
    try {
        const result = await query(`
            SELECT
                sc.*,
                COUNT(s.id) as service_count
            FROM service_categories sc
            LEFT JOIN services s ON sc.id = s.category_id AND s.is_active = true
            GROUP BY sc.id
            ORDER BY sc.display_order, sc.name
        `);

        res.json(result.rows);

    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/admin/categories
 * Create a new category (owner only)
 */
router.post('/categories', requireRole('owner'), async (req, res, next) => {
    try {
        const { name, description, icon, display_order } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Category name is required' });
        }

        const result = await query(`
            INSERT INTO service_categories (name, description, icon, display_order)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `, [name, description || null, icon || null, display_order || 99]);

        res.status(201).json(result.rows[0]);

    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ error: 'Category name already exists' });
        }
        next(err);
    }
});

/**
 * PATCH /api/admin/categories/:id
 * Update a category (owner only)
 */
router.patch('/categories/:id', requireRole('owner'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, description, icon, display_order, is_active } = req.body;

        const updates = [];
        const params = [];
        let paramIndex = 1;

        if (name !== undefined) {
            updates.push(`name = $${paramIndex++}`);
            params.push(name);
        }
        if (description !== undefined) {
            updates.push(`description = $${paramIndex++}`);
            params.push(description);
        }
        if (icon !== undefined) {
            updates.push(`icon = $${paramIndex++}`);
            params.push(icon);
        }
        if (display_order !== undefined) {
            updates.push(`display_order = $${paramIndex++}`);
            params.push(display_order);
        }
        if (is_active !== undefined) {
            updates.push(`is_active = $${paramIndex++}`);
            params.push(is_active);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No updates provided' });
        }

        params.push(id);

        const result = await query(`
            UPDATE service_categories
            SET ${updates.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING *
        `, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }

        res.json(result.rows[0]);

    } catch (err) {
        next(err);
    }
});

/**
 * DELETE /api/admin/categories/:id
 * Delete a category (owner only) - only if no services are assigned
 */
router.delete('/categories/:id', requireRole('owner'), async (req, res, next) => {
    try {
        const { id } = req.params;

        // Check if any services are using this category
        const serviceCheck = await query(`
            SELECT COUNT(*) as count FROM services WHERE category_id = $1
        `, [id]);

        if (parseInt(serviceCheck.rows[0].count) > 0) {
            return res.status(400).json({
                error: 'Cannot delete category with existing services. Move or delete services first.'
            });
        }

        const result = await query(`
            DELETE FROM service_categories WHERE id = $1 RETURNING id
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }

        res.json({ success: true });

    } catch (err) {
        next(err);
    }
});

/**
 * ============================================
 * SERVICES MANAGEMENT
 * ============================================
 */

/**
 * GET /api/admin/services/all
 * Get all services including inactive ones (for management)
 */
router.get('/services/all', requireRole('owner'), async (req, res, next) => {
    try {
        const { category_id } = req.query;

        let whereClause = '';
        const params = [];

        if (category_id) {
            whereClause = 'WHERE s.category_id = $1';
            params.push(category_id);
        }

        const result = await query(`
            SELECT
                s.*,
                sc.name as category_name,
                sc.display_order as category_order
            FROM services s
            JOIN service_categories sc ON s.category_id = sc.id
            ${whereClause}
            ORDER BY sc.display_order, s.name
        `, params);

        res.json(result.rows);

    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/admin/services
 * Create a new service (owner only)
 */
router.post('/services', requireRole('owner'), async (req, res, next) => {
    try {
        const {
            name, category_id, description, duration_minutes,
            price, deposit_amount, is_active
        } = req.body;

        if (!name || !category_id || !duration_minutes || price === undefined) {
            return res.status(400).json({
                error: 'Name, category, duration, and price are required'
            });
        }

        const result = await query(`
            INSERT INTO services (name, category_id, description, duration_minutes, price, deposit_amount, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [
            name,
            category_id,
            description || null,
            duration_minutes,
            price,
            deposit_amount || 0,
            is_active !== false
        ]);

        res.status(201).json(result.rows[0]);

    } catch (err) {
        next(err);
    }
});

/**
 * PATCH /api/admin/services/:id
 * Update a service (owner only)
 */
router.patch('/services/:id', requireRole('owner'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const {
            name, category_id, description, duration_minutes,
            price, deposit_amount, is_active
        } = req.body;

        const updates = [];
        const params = [];
        let paramIndex = 1;

        if (name !== undefined) {
            updates.push(`name = $${paramIndex++}`);
            params.push(name);
        }
        if (category_id !== undefined) {
            updates.push(`category_id = $${paramIndex++}`);
            params.push(category_id);
        }
        if (description !== undefined) {
            updates.push(`description = $${paramIndex++}`);
            params.push(description);
        }
        if (duration_minutes !== undefined) {
            updates.push(`duration_minutes = $${paramIndex++}`);
            params.push(duration_minutes);
        }
        if (price !== undefined) {
            updates.push(`price = $${paramIndex++}`);
            params.push(price);
        }
        if (deposit_amount !== undefined) {
            updates.push(`deposit_amount = $${paramIndex++}`);
            params.push(deposit_amount);
        }
        if (is_active !== undefined) {
            updates.push(`is_active = $${paramIndex++}`);
            params.push(is_active);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No updates provided' });
        }

        params.push(id);

        const result = await query(`
            UPDATE services
            SET ${updates.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING *
        `, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Service not found' });
        }

        res.json(result.rows[0]);

    } catch (err) {
        next(err);
    }
});

/**
 * DELETE /api/admin/services/:id
 * Delete a service (owner only)
 */
router.delete('/services/:id', requireRole('owner'), async (req, res, next) => {
    const client = await getClient();
    try {
        const { id } = req.params;

        await client.query('BEGIN');

        // Remove from stylist_services first
        await client.query(`DELETE FROM stylist_services WHERE service_id = $1`, [id]);

        // Delete the service
        const result = await client.query(`
            DELETE FROM services WHERE id = $1 RETURNING id
        `, [id]);

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Service not found' });
        }

        await client.query('COMMIT');
        res.json({ success: true });

    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

// ==========================================
// CLIENT MANAGEMENT ROUTES
// ==========================================

/**
 * GET /api/admin/clients
 * Get all clients with visit counts
 */
router.get('/clients', async (req, res, next) => {
    try {
        const result = await query(`
            SELECT c.*,
                COUNT(DISTINCT b.id) FILTER (WHERE b.status = 'completed') as visit_count,
                COALESCE(SUM(b.service_price) FILTER (WHERE b.status = 'completed'), 0) as total_spent,
                COALESCE(SUM(b.tip_amount) FILTER (WHERE b.status = 'completed'), 0) as total_tips,
                MAX(b.start_datetime) FILTER (WHERE b.status = 'completed') as last_visit
            FROM clients c
            LEFT JOIN bookings b ON c.id = b.client_id
            GROUP BY c.id
            ORDER BY c.first_name, c.last_name
        `);

        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/admin/clients/:id
 * Get single client with full details
 */
router.get('/clients/:id', async (req, res, next) => {
    try {
        const { id } = req.params;

        const clientResult = await query(`
            SELECT c.*,
                COUNT(DISTINCT b.id) FILTER (WHERE b.status = 'completed') as visit_count,
                COALESCE(SUM(b.service_price) FILTER (WHERE b.status = 'completed'), 0) as total_spent,
                COALESCE(SUM(b.tip_amount) FILTER (WHERE b.status = 'completed'), 0) as total_tips,
                MAX(b.start_datetime) FILTER (WHERE b.status = 'completed') as last_visit
            FROM clients c
            LEFT JOIN bookings b ON c.id = b.client_id
            WHERE c.id = $1
            GROUP BY c.id
        `, [id]);

        if (clientResult.rows.length === 0) {
            return res.status(404).json({ error: 'Client not found' });
        }

        // Get booking history
        const historyResult = await query(`
            SELECT b.id, b.start_datetime, b.service_price, b.status,
                   b.service_name, b.stylist_name,
                   COALESCE(b.tip_amount, 0) as tip_amount
            FROM bookings b
            WHERE b.client_id = $1
            ORDER BY b.start_datetime DESC
            LIMIT 20
        `, [id]);

        // Get preferred services
        const prefServicesResult = await query(`
            SELECT s.id, s.name
            FROM client_preferred_services cps
            JOIN services s ON cps.service_id = s.id
            WHERE cps.client_id = $1
            ORDER BY s.name
        `, [id]);

        const client = clientResult.rows[0];
        client.history = historyResult.rows;
        client.preferred_services = prefServicesResult.rows;

        res.json(client);
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/admin/clients
 * Create a new client
 */
router.post('/clients', async (req, res, next) => {
    try {
        const { first_name, last_name, email, phone, notes, birthday } = req.body;

        if (!first_name || !phone) {
            return res.status(400).json({ error: 'First name and phone are required' });
        }

        // Check for duplicate email if provided
        if (email) {
            const existing = await query(
                'SELECT id FROM clients WHERE email = $1', [email]
            );
            if (existing.rows.length > 0) {
                return res.status(409).json({ error: 'A client with this email already exists' });
            }
        }

        const result = await query(`
            INSERT INTO clients (first_name, last_name, email, phone, notes, birthday)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [first_name, last_name || '', email || '', phone, notes || '', birthday || null]);

        res.status(201).json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

/**
 * PUT /api/admin/clients/:id
 * Update an existing client
 */
router.put('/clients/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const { first_name, last_name, email, phone, notes, birthday,
                preferred_stylist_id, email_reminders, sms_reminders,
                marketing_consent, allergies, special_requests } = req.body;

        const updates = [];
        const params = [];
        let paramIndex = 1;

        if (first_name !== undefined) {
            updates.push(`first_name = $${paramIndex++}`);
            params.push(first_name);
        }
        if (last_name !== undefined) {
            updates.push(`last_name = $${paramIndex++}`);
            params.push(last_name);
        }
        if (email !== undefined) {
            updates.push(`email = $${paramIndex++}`);
            params.push(email);
        }
        if (phone !== undefined) {
            updates.push(`phone = $${paramIndex++}`);
            params.push(phone);
        }
        if (notes !== undefined) {
            updates.push(`notes = $${paramIndex++}`);
            params.push(notes);
        }
        if (birthday !== undefined) {
            updates.push(`birthday = $${paramIndex++}`);
            params.push(birthday);
        }
        if (preferred_stylist_id !== undefined) {
            updates.push(`preferred_stylist_id = $${paramIndex++}`);
            params.push(preferred_stylist_id);
        }
        if (email_reminders !== undefined) {
            updates.push(`email_reminders = $${paramIndex++}`);
            params.push(email_reminders);
        }
        if (sms_reminders !== undefined) {
            updates.push(`sms_reminders = $${paramIndex++}`);
            params.push(sms_reminders);
        }
        if (marketing_consent !== undefined) {
            updates.push(`marketing_consent = $${paramIndex++}`);
            params.push(marketing_consent);
        }
        if (allergies !== undefined) {
            updates.push(`allergies = $${paramIndex++}`);
            params.push(allergies);
        }
        if (special_requests !== undefined) {
            updates.push(`special_requests = $${paramIndex++}`);
            params.push(special_requests);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No updates provided' });
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(id);

        const result = await query(`
            UPDATE clients
            SET ${updates.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING *
        `, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Client not found' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

/**
 * DELETE /api/admin/clients/:id
 * Delete a client
 */
router.delete('/clients/:id', requireRole('owner'), async (req, res, next) => {
    try {
        const { id } = req.params;

        const result = await query(
            'DELETE FROM clients WHERE id = $1 RETURNING id', [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Client not found' });
        }

        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/admin/client-preferred-services/:clientId
 * Get all active services with is_preferred flag for a client
 */
router.get('/client-preferred-services/:clientId', async (req, res, next) => {
    try {
        const { clientId } = req.params;

        const result = await query(`
            SELECT
                s.id,
                s.name,
                s.description,
                s.duration_minutes,
                s.price,
                sc.id as category_id,
                sc.name as category_name,
                sc.display_order as category_order,
                CASE WHEN cps.id IS NOT NULL THEN true ELSE false END as is_preferred
            FROM services s
            JOIN service_categories sc ON s.category_id = sc.id
            LEFT JOIN client_preferred_services cps ON s.id = cps.service_id AND cps.client_id = $1
            WHERE s.is_active = true AND sc.is_active = true
            ORDER BY sc.display_order, s.name
        `, [clientId]);

        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

/**
 * PUT /api/admin/client-preferred-services/:clientId
 * Replace all preferred services for a client
 */
router.put('/client-preferred-services/:clientId', async (req, res, next) => {
    const client = await getClient();

    try {
        const { clientId } = req.params;
        const { service_ids } = req.body;

        await client.query('BEGIN');

        await client.query(
            'DELETE FROM client_preferred_services WHERE client_id = $1',
            [clientId]
        );

        for (const serviceId of (service_ids || [])) {
            await client.query(
                'INSERT INTO client_preferred_services (client_id, service_id) VALUES ($1, $2)',
                [clientId, serviceId]
            );
        }

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

/**
 * POST /api/admin/send-sms
 * Send an ad-hoc SMS to a client
 */
router.post('/send-sms', async (req, res, next) => {
    try {
        const { to, message } = req.body;

        if (!to || !message) {
            return res.status(400).json({ error: 'Phone number and message are required' });
        }

        if (message.length > 1600) {
            return res.status(400).json({ error: 'Message too long (max 1600 characters)' });
        }

        await sendAdHocSMS(to, message);
        res.json({ success: true });
    } catch (err) {
        if (err.message === 'Twilio is not configured') {
            return res.status(503).json({ error: 'SMS service is not configured' });
        }
        console.error('Failed to send ad-hoc SMS:', err);
        res.status(500).json({ error: 'Failed to send SMS' });
    }
});

export default router;
