/**
 * Database Migration Script
 * Creates all tables for the Ember & Roots booking system
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const { Pool } = pg;

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const pool = new Pool({
    connectionString,
    ssl: connectionString?.includes('neon.tech') ? { rejectUnauthorized: false } : false
});

const migrations = [
    // 1. Team Members table (enhanced stylist profiles)
    `CREATE TABLE IF NOT EXISTS stylists (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(20),
        title VARCHAR(100),
        bio TEXT,
        avatar_url VARCHAR(500),
        instagram_url VARCHAR(255),
        facebook_url VARCHAR(255),
        website_url VARCHAR(255),
        specialties TEXT[],
        certifications TEXT[],
        years_experience INTEGER,
        accepting_new_clients BOOLEAN DEFAULT true,
        display_on_website BOOLEAN DEFAULT true,
        display_order INTEGER DEFAULT 0,
        color_code VARCHAR(7) DEFAULT '#D4944A',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // 2. Admin users table (for dashboard access)
    `CREATE TABLE IF NOT EXISTS admin_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        stylist_id UUID REFERENCES stylists(id) ON DELETE SET NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'stylist',
        is_active BOOLEAN DEFAULT true,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // 3. Service categories
    `CREATE TABLE IF NOT EXISTS service_categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        icon VARCHAR(100),
        display_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true
    )`,

    // 4. Services table
    `CREATE TABLE IF NOT EXISTS services (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        category_id UUID REFERENCES service_categories(id) ON DELETE SET NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        duration_minutes INTEGER NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        deposit_amount DECIMAL(10, 2) DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // 5. Stylist-Service mapping (which stylists offer which services)
    `CREATE TABLE IF NOT EXISTS stylist_services (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        stylist_id UUID REFERENCES stylists(id) ON DELETE CASCADE,
        service_id UUID REFERENCES services(id) ON DELETE CASCADE,
        custom_price DECIMAL(10, 2),
        custom_duration INTEGER,
        is_active BOOLEAN DEFAULT true,
        UNIQUE(stylist_id, service_id)
    )`,

    // 6. Stylist availability (recurring weekly schedule)
    `CREATE TABLE IF NOT EXISTS stylist_availability (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        stylist_id UUID REFERENCES stylists(id) ON DELETE CASCADE,
        day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        is_active BOOLEAN DEFAULT true,
        UNIQUE(stylist_id, day_of_week, start_time)
    )`,

    // 7. Time-off / blocked time (specific dates)
    `CREATE TABLE IF NOT EXISTS stylist_time_off (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        stylist_id UUID REFERENCES stylists(id) ON DELETE CASCADE,
        start_datetime TIMESTAMP NOT NULL,
        end_datetime TIMESTAMP NOT NULL,
        reason VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // 8. Clients table
    `CREATE TABLE IF NOT EXISTS clients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(20),
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // 9. Bookings table
    `CREATE TABLE IF NOT EXISTS bookings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        confirmation_code VARCHAR(10) UNIQUE NOT NULL,
        client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
        stylist_id UUID REFERENCES stylists(id) ON DELETE SET NULL,
        service_id UUID REFERENCES services(id) ON DELETE SET NULL,

        -- Denormalized for historical reference
        service_name VARCHAR(255) NOT NULL,
        service_duration INTEGER NOT NULL,
        service_price DECIMAL(10, 2) NOT NULL,
        stylist_name VARCHAR(255) NOT NULL,

        -- Booking details
        start_datetime TIMESTAMP NOT NULL,
        end_datetime TIMESTAMP NOT NULL,

        -- Status: pending, confirmed, completed, cancelled, no_show
        status VARCHAR(50) DEFAULT 'pending',

        -- Client info (denormalized for quick access)
        client_name VARCHAR(255) NOT NULL,
        client_email VARCHAR(255) NOT NULL,
        client_phone VARCHAR(20),

        -- Tip
        tip_amount DECIMAL(10, 2) DEFAULT 0,

        -- Notes
        client_notes TEXT,
        internal_notes TEXT,

        -- Cancellation
        cancelled_at TIMESTAMP,
        cancellation_reason TEXT,

        -- Notifications tracking
        confirmation_sent_at TIMESTAMP,
        reminder_sent_at TIMESTAMP,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // 10. Booking add-ons (for future use)
    `CREATE TABLE IF NOT EXISTS booking_addons (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
        addon_name VARCHAR(255) NOT NULL,
        addon_price DECIMAL(10, 2) NOT NULL,
        addon_duration INTEGER DEFAULT 0
    )`,

    // 11. Business settings
    `CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Create indexes for performance
    `CREATE INDEX IF NOT EXISTS idx_bookings_datetime ON bookings(start_datetime, end_datetime)`,
    `CREATE INDEX IF NOT EXISTS idx_bookings_stylist ON bookings(stylist_id, start_datetime)`,
    `CREATE INDEX IF NOT EXISTS idx_bookings_client ON bookings(client_id)`,
    `CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status)`,
    `CREATE INDEX IF NOT EXISTS idx_bookings_confirmation ON bookings(confirmation_code)`,
    `CREATE INDEX IF NOT EXISTS idx_stylist_availability ON stylist_availability(stylist_id, day_of_week)`,
    `CREATE INDEX IF NOT EXISTS idx_stylist_time_off ON stylist_time_off(stylist_id, start_datetime, end_datetime)`
];

async function migrate() {
    const client = await pool.connect();

    try {
        console.log('🌱 Starting database migration...\n');

        for (let i = 0; i < migrations.length; i++) {
            const migration = migrations[i];
            const preview = migration.substring(0, 60).replace(/\s+/g, ' ');

            try {
                await client.query(migration);
                console.log(`✓ Migration ${i + 1}/${migrations.length}: ${preview}...`);
            } catch (err) {
                console.error(`✗ Migration ${i + 1} failed:`, err.message);
                throw err;
            }
        }

        console.log('\n✨ All migrations completed successfully!');

    } finally {
        client.release();
        await pool.end();
    }
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
