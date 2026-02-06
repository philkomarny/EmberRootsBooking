/**
 * Ember & Roots Booking Server
 * Multi-stylist appointment booking system
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables
dotenv.config();

// Validate critical environment variables
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes('change')) {
    console.error('FATAL: JWT_SECRET must be set to a secure value. Update your .env file.');
    process.exit(1);
}

// Validate CORS origin — reject wildcard with credentials
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8765';
if (frontendUrl === '*') {
    console.error('FATAL: FRONTEND_URL cannot be "*" — wildcard origin with credentials is insecure.');
    process.exit(1);
}

// Graceful shutdown handler
let server;
let cleanupInterval;

function gracefulShutdown(signal) {
    console.log(`\n${signal} received — shutting down gracefully...`);
    if (server) {
        server.close(() => {
            console.log('HTTP server closed.');
            if (cleanupInterval) clearInterval(cleanupInterval);
            pool.end().then(() => {
                console.log('Database pool drained.');
                process.exit(0);
            }).catch(() => process.exit(1));
        });
        // Force exit after 10s if connections won't close
        setTimeout(() => {
            console.error('Forced shutdown after timeout.');
            process.exit(1);
        }, 10000);
    } else {
        process.exit(0);
    }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception — initiating shutdown:', err.message);
    console.error(err.stack);
    gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
});

// Import routes
import authRoutes from './routes/auth.js';
import clientAuthRoutes from './routes/client-auth.js';
import stylistRoutes from './routes/stylists.js';
import serviceRoutes from './routes/services.js';
import availabilityRoutes from './routes/availability.js';
import bookingRoutes from './routes/bookings.js';
import adminRoutes from './routes/admin.js';

// Import database to test connection
import pool from './config/database.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Security headers with configured CSP
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'"],
            frameAncestors: ["'none'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"]
        }
    }
}));

// Rate limiting
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

// CORS — support comma-separated origins
const corsOrigins = frontendUrl.includes(',')
    ? frontendUrl.split(',').map(o => o.trim())
    : frontendUrl;
app.use(cors({
    origin: corsOrigins,
    credentials: true
}));
app.use(express.json({ limit: '1mb' }));

// Request logging in development
if (process.env.NODE_ENV === 'development') {
    app.use((req, res, next) => {
        console.log(`${req.method} ${req.path}`);
        next();
    });
}

// Health check
app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'healthy', database: 'connected' });
    } catch (err) {
        res.status(500).json({ status: 'unhealthy', database: 'disconnected' });
    }
});

// Serve static frontend files
const frontendRoot = path.join(__dirname, '../../');
app.use(express.static(frontendRoot));

// API Routes
app.use('/api/auth', authRoutes);
// Allow larger body for client registration (avatar uploads)
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

    res.status(500).json({
        error: process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : err.message
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Start server
server = app.listen(PORT, () => {
    console.log(`
🌿 Ember & Roots Booking Server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 Server running on port ${PORT}
🌍 Environment: ${process.env.NODE_ENV || 'development'}
🔗 Frontend URL: ${frontendUrl}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);

    // Periodic OTP cleanup (every hour)
    cleanupInterval = setInterval(async () => {
        try {
            await pool.query(`DELETE FROM client_otp_codes WHERE expires_at < NOW() - INTERVAL '1 hour'`);
            await pool.query(`DELETE FROM client_sessions WHERE expires_at < NOW()`);
        } catch (err) {
            console.error('OTP/session cleanup error:', err.message);
        }
    }, 60 * 60 * 1000);
});

export default app;
