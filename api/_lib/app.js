/**
 * Ember & Roots Booking API
 * Express app for Vercel serverless deployment
 */

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

// Import routes
import authRoutes from './routes/auth.js';
import clientAuthRoutes from './routes/client-auth.js';
import stylistRoutes from './routes/stylists.js';
import serviceRoutes from './routes/services.js';
import availabilityRoutes from './routes/availability.js';
import bookingRoutes from './routes/bookings.js';
import adminRoutes from './routes/admin.js';

// Import database for health check
import pool from './config/database.js';

const app = express();

// Rate limiting (per-instance in serverless)
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' }
});
app.use('/api/', apiLimiter);

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts, please try again later' }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/client-auth/send-otp', authLimiter);
app.use('/api/client-auth/verify-otp', authLimiter);

// CORS
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
const corsOrigins = frontendUrl.includes(',')
    ? frontendUrl.split(',').map(o => o.trim())
    : frontendUrl;
app.use(cors({
    origin: corsOrigins,
    credentials: true
}));
app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/api/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'healthy', database: 'connected' });
    } catch (err) {
        res.status(500).json({ status: 'unhealthy', database: 'disconnected' });
    }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/client-auth/register', express.json({ limit: '5mb' }));
app.use('/api/client-auth', clientAuthRoutes);
app.use('/api/stylists', stylistRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/admin', adminRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);

    if (err.name === 'ValidationError') {
        return res.status(400).json({ error: err.message });
    }

    if (err.name === 'UnauthorizedError') {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }

    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

export default app;
