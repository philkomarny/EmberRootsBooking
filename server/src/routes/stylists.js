/**
 * Stylist Routes (Public)
 */

import { Router } from 'express';
import { query } from '../config/database.js';

const router = Router();

/**
 * GET /api/stylists
 * Get all active stylists with their services
 */
router.get('/', async (req, res, next) => {
    try {
        const result = await query(`
            SELECT
                s.id,
                s.name,
                s.title,
                s.bio,
                s.avatar_url,
                s.is_active,
                s.display_on_website,
                s.specialties,
                COALESCE(
                    json_agg(
                        DISTINCT jsonb_build_object(
                            'id', svc.id,
                            'name', svc.name,
                            'category', sc.name,
                            'duration', COALESCE(ss.custom_duration, svc.duration_minutes),
                            'price', COALESCE(ss.custom_price, svc.price)
                        )
                    ) FILTER (WHERE svc.id IS NOT NULL),
                    '[]'
                ) as services
            FROM stylists s
            LEFT JOIN stylist_services ss ON s.id = ss.stylist_id AND ss.is_active = true
            LEFT JOIN services svc ON ss.service_id = svc.id AND svc.is_active = true
            LEFT JOIN service_categories sc ON svc.category_id = sc.id
            WHERE s.is_active = true AND s.display_on_website = true
            GROUP BY s.id
            ORDER BY s.display_order, s.name
        `);

        res.json(result.rows);

    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/stylists/:id
 * Get single stylist with full details
 */
router.get('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;

        const result = await query(`
            SELECT
                s.id,
                s.name,
                s.title,
                s.bio,
                s.avatar_url,
                s.is_active,
                s.display_on_website,
                s.specialties,
                COALESCE(
                    json_agg(
                        DISTINCT jsonb_build_object(
                            'id', svc.id,
                            'name', svc.name,
                            'category', sc.name,
                            'duration', COALESCE(ss.custom_duration, svc.duration_minutes),
                            'price', COALESCE(ss.custom_price, svc.price)
                        )
                    ) FILTER (WHERE svc.id IS NOT NULL),
                    '[]'
                ) as services
            FROM stylists s
            LEFT JOIN stylist_services ss ON s.id = ss.stylist_id AND ss.is_active = true
            LEFT JOIN services svc ON ss.service_id = svc.id AND svc.is_active = true
            LEFT JOIN service_categories sc ON svc.category_id = sc.id
            WHERE s.id = $1 AND s.is_active = true
            GROUP BY s.id
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Stylist not found' });
        }

        res.json(result.rows[0]);

    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/stylists/for-service/:serviceId
 * Get stylists who offer a specific service
 */
router.get('/for-service/:serviceId', async (req, res, next) => {
    try {
        const { serviceId } = req.params;

        const result = await query(`
            SELECT
                s.id,
                s.name,
                s.bio,
                s.avatar_url,
                COALESCE(ss.custom_price, svc.price) as price,
                COALESCE(ss.custom_duration, svc.duration_minutes) as duration
            FROM stylists s
            JOIN stylist_services ss ON s.id = ss.stylist_id
            JOIN services svc ON ss.service_id = svc.id
            WHERE svc.id = $1
              AND s.is_active = true
              AND ss.is_active = true
              AND svc.is_active = true
            ORDER BY s.name
        `, [serviceId]);

        res.json(result.rows);

    } catch (err) {
        next(err);
    }
});

export default router;
