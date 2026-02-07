/**
 * Authentication Middleware
 */

import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';

/**
 * Verify JWT token and attach user to request
 */
export async function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];

        const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

        // Get user from database
        const result = await query(
            `SELECT au.id, au.email, au.role, au.stylist_id, s.name as stylist_name
             FROM admin_users au
             LEFT JOIN stylists s ON au.stylist_id = s.id
             WHERE au.id = $1 AND au.is_active = true`,
            [decoded.userId]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'User not found or inactive' });
        }

        req.user = result.rows[0];
        next();

    } catch (err) {
        if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid token' });
        }
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        }
        next(err);
    }
}

/**
 * Check if user has required role
 */
export function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        next();
    };
}

/**
 * Check if user can access stylist's data
 * Owners can access all, stylists can only access their own
 */
export function canAccessStylist(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const requestedStylistId = req.params.stylistId || req.body.stylist_id;

    // Owners can access everything
    if (req.user.role === 'owner') {
        return next();
    }

    // Stylists can only access their own data
    if (req.user.stylist_id !== requestedStylistId) {
        return res.status(403).json({ error: 'Cannot access other stylist data' });
    }

    next();
}
