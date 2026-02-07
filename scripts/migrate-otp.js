/**
 * OTP & Extended Client Migration
 * Adds OTP authentication and extended client profiles
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
    // 1. OTP codes table for client authentication
    `CREATE TABLE IF NOT EXISTS client_otp_codes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_email VARCHAR(255),
        client_phone VARCHAR(20),
        code VARCHAR(6) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        verified_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_contact CHECK (client_email IS NOT NULL OR client_phone IS NOT NULL)
    )`,

    // 2. Client sessions for booking flow
    `CREATE TABLE IF NOT EXISTS client_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
        session_token VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // 3. Extend clients table with additional profile fields
    `ALTER TABLE clients ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500)`,
    `ALTER TABLE clients ADD COLUMN IF NOT EXISTS address_street VARCHAR(255)`,
    `ALTER TABLE clients ADD COLUMN IF NOT EXISTS address_city VARCHAR(100)`,
    `ALTER TABLE clients ADD COLUMN IF NOT EXISTS address_state VARCHAR(50)`,
    `ALTER TABLE clients ADD COLUMN IF NOT EXISTS address_zip VARCHAR(20)`,
    `ALTER TABLE clients ADD COLUMN IF NOT EXISTS instagram_url VARCHAR(255)`,
    `ALTER TABLE clients ADD COLUMN IF NOT EXISTS facebook_url VARCHAR(255)`,
    `ALTER TABLE clients ADD COLUMN IF NOT EXISTS tiktok_url VARCHAR(255)`,
    `ALTER TABLE clients ADD COLUMN IF NOT EXISTS birthday DATE`,
    `ALTER TABLE clients ADD COLUMN IF NOT EXISTS email_reminders BOOLEAN DEFAULT true`,
    `ALTER TABLE clients ADD COLUMN IF NOT EXISTS sms_reminders BOOLEAN DEFAULT true`,
    `ALTER TABLE clients ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN DEFAULT false`,
    `ALTER TABLE clients ADD COLUMN IF NOT EXISTS preferred_stylist_id UUID REFERENCES stylists(id)`,
    `ALTER TABLE clients ADD COLUMN IF NOT EXISTS allergies TEXT`,
    `ALTER TABLE clients ADD COLUMN IF NOT EXISTS special_requests TEXT`,

    // 4. Client preferred services junction table
    `CREATE TABLE IF NOT EXISTS client_preferred_services (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
        service_id UUID REFERENCES services(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(client_id, service_id)
    )`,

    // 5. Indexes for performance
    `CREATE INDEX IF NOT EXISTS idx_otp_email ON client_otp_codes(client_email, expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_otp_phone ON client_otp_codes(client_phone, expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_client_sessions ON client_sessions(session_token, expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone)`,
    `CREATE INDEX IF NOT EXISTS idx_client_preferred_services_client ON client_preferred_services(client_id)`,

    // 6. Add attempts column for brute-force protection
    `ALTER TABLE client_otp_codes ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0`,

    // 5. Cleanup expired OTP codes function
    `CREATE OR REPLACE FUNCTION cleanup_expired_otps()
    RETURNS void AS $$
    BEGIN
        DELETE FROM client_otp_codes WHERE expires_at < NOW();
        DELETE FROM client_sessions WHERE expires_at < NOW();
    END;
    $$ LANGUAGE plpgsql`
];

async function migrate() {
    const client = await pool.connect();

    try {
        console.log('🔐 Starting OTP migration...\n');

        for (let i = 0; i < migrations.length; i++) {
            const migration = migrations[i];
            const preview = migration.substring(0, 60).replace(/\s+/g, ' ');

            try {
                await client.query(migration);
                console.log(`✓ Migration ${i + 1}/${migrations.length}: ${preview}...`);
            } catch (err) {
                // Ignore "column already exists" errors for ALTER TABLE
                if (err.code === '42701') {
                    console.log(`⏭ Migration ${i + 1}: Column already exists, skipping...`);
                } else {
                    console.error(`✗ Migration ${i + 1} failed:`, err.message);
                    throw err;
                }
            }
        }

        console.log('\n✨ OTP migration completed successfully!');

    } finally {
        client.release();
        await pool.end();
    }
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
