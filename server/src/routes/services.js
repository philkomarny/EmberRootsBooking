/**
 * Service Routes (Public)
 */

import { Router } from 'express';
import { query } from '../config/database.js';

const router = Router();

/**
 * GET /api/services
 * Get all services grouped by category
 */
router.get('/', async (req, res, next) => {
    try {
        const result = await query(`
            SELECT
                sc.id as category_id,
                sc.name as category_name,
                sc.description as category_description,
                sc.icon as category_icon,
                COALESCE(
                    json_agg(
                        jsonb_build_object(
                            'id', s.id,
                            'name', s.name,
                            'description', s.description,
                            'duration', s.duration_minutes,
                            'price', s.price
                        )
                        ORDER BY s.price
                    ) FILTER (WHERE s.id IS NOT NULL),
                    '[]'
                ) as services
            FROM service_categories sc
            LEFT JOIN services s ON sc.id = s.category_id AND s.is_active = true
            WHERE sc.is_active = true
            GROUP BY sc.id
            ORDER BY sc.display_order
        `);

        res.json(result.rows);

    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/services/:id
 * Get single service with available stylists
 */
router.get('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;

        const result = await query(`
            SELECT
                s.id,
                s.name,
                s.description,
                s.duration_minutes as duration,
                s.price,
                sc.name as category_name,
                COALESCE(
                    json_agg(
                        jsonb_build_object(
                            'id', st.id,
                            'name', st.name,
                            'custom_price', ss.custom_price,
                            'custom_duration', ss.custom_duration
                        )
                    ) FILTER (WHERE st.id IS NOT NULL),
                    '[]'
                ) as stylists
            FROM services s
            JOIN service_categories sc ON s.category_id = sc.id
            LEFT JOIN stylist_services ss ON s.id = ss.service_id AND ss.is_active = true
            LEFT JOIN stylists st ON ss.stylist_id = st.id AND st.is_active = true
            WHERE s.id = $1 AND s.is_active = true
            GROUP BY s.id, sc.name
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Service not found' });
        }

        res.json(result.rows[0]);

    } catch (err) {
        next(err);
    }
});

export default router;
