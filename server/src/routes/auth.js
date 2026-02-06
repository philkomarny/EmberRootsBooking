/**
 * Authentication Routes
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/auth/login
 * Admin login
 */
router.post('/login', async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        // Find user
        const result = await query(
            `SELECT au.id, au.email, au.password_hash, au.role, au.stylist_id, s.name as stylist_name
             FROM admin_users au
             LEFT JOIN stylists s ON au.stylist_id = s.id
             WHERE au.email = $1 AND au.is_active = true`,
            [email.toLowerCase()]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Update last login
        await query(
            `UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE id = $1`,
            [user.id]
        );

        // Generate JWT
        const token = jwt.sign(
            { userId: user.id, role: user.role },
            process.env.JWT_SECRET,
            { algorithm: 'HS256', expiresIn: process.env.JWT_EXPIRY || '8h' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                stylist_id: user.stylist_id,
                stylist_name: user.stylist_name
            }
        });

    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/auth/me
 * Get current user
 */
router.get('/me', authenticate, async (req, res) => {
    res.json({ user: req.user });
});

/**
 * POST /api/auth/change-password
 * Change password
 */
router.post('/change-password', authenticate, async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new password required' });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        // Get current password hash
        const result = await query(
            `SELECT password_hash FROM admin_users WHERE id = $1`,
            [req.user.id]
        );

        const validPassword = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        // Update password
        const newHash = await bcrypt.hash(newPassword, 10);
        await query(
            `UPDATE admin_users SET password_hash = $1 WHERE id = $2`,
            [newHash, req.user.id]
        );

        res.json({ message: 'Password updated successfully' });

    } catch (err) {
        next(err);
    }
});

export default router;
