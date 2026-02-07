/**
 * Seed Script
 * Populates database with initial data for Ember & Roots
 */

import pg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const { Pool } = pg;

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const pool = new Pool({
    connectionString,
    ssl: connectionString?.includes('neon.tech') ? { rejectUnauthorized: false } : false
});

async function seed() {
    const client = await pool.connect();

    try {
        console.log('🌱 Seeding database...\n');

        // Start transaction
        await client.query('BEGIN');

        // 1. Create service categories
        console.log('Creating service categories...');
        const categories = [
            { name: 'Facial + Body Treatments', description: 'Glo2Facial, FX Treatments, Glacial Glow & more', icon: 'face', order: 1 },
            { name: 'Eyelash Services', description: 'Classic, Hybrid, Volume & Mega Volume Sets', icon: 'eye', order: 2 },
            { name: 'Brow Services', description: 'Lamination, Tinting, Waxing & Shaping', icon: 'brow', order: 3 },
            { name: 'Sound Therapy', description: 'Vibrational healing & crystal bowl sessions', icon: 'sound', order: 4 },
            { name: 'Reiki', description: 'Energy healing & chakra balancing', icon: 'reiki', order: 5 },
            { name: 'Massage Therapy', description: 'Relaxation, deep tissue & therapeutic bodywork', icon: 'massage', order: 6 },
            { name: 'Waxing Services', description: 'Full body waxing with gentle techniques', icon: 'waxing', order: 7 },
            { name: 'Makeup', description: 'Bridal, special occasion & everyday glam', icon: 'makeup', order: 8 }
        ];

        const categoryIds = {};
        for (const cat of categories) {
            const result = await client.query(
                `INSERT INTO service_categories (name, description, icon, display_order)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT DO NOTHING
                 RETURNING id, name`,
                [cat.name, cat.description, cat.icon, cat.order]
            );
            if (result.rows[0]) {
                categoryIds[cat.name] = result.rows[0].id;
            }
        }

        // 2. Create services
        console.log('Creating services...');
        const services = [
            // Facial + Body Treatments
            { category: 'Facial + Body Treatments', name: 'Signature Glo2facial', duration: 60, price: 225 },
            { category: 'Facial + Body Treatments', name: 'Deluxe Glo2facial Treatment', duration: 90, price: 350 },
            { category: 'Facial + Body Treatments', name: 'Glo2 7 Series', duration: 45, price: 195 },
            { category: 'Facial + Body Treatments', name: 'FX GLOSS Treatment', duration: 60, price: 275 },
            { category: 'Facial + Body Treatments', name: 'FX GLIDE Treatment', duration: 60, price: 195 },
            { category: 'Facial + Body Treatments', name: 'Glacial Glow', duration: 45, price: 150 },

            // Eyelash Services
            { category: 'Eyelash Services', name: 'Classic Full Set', duration: 90, price: 150 },
            { category: 'Eyelash Services', name: 'Hybrid Full Set', duration: 120, price: 185 },
            { category: 'Eyelash Services', name: 'Volume Full Set', duration: 120, price: 215 },
            { category: 'Eyelash Services', name: 'Mega Volume Full Set', duration: 150, price: 250 },
            { category: 'Eyelash Services', name: 'Classic Fill (2 weeks)', duration: 45, price: 65 },
            { category: 'Eyelash Services', name: 'Volume Fill (2 weeks)', duration: 60, price: 85 },
            { category: 'Eyelash Services', name: 'Lash Lift & Tint', duration: 60, price: 85 },

            // Brow Services
            { category: 'Brow Services', name: 'Brow Lamination', duration: 45, price: 75 },
            { category: 'Brow Services', name: 'Brow Lamination + Tint', duration: 60, price: 95 },
            { category: 'Brow Services', name: 'Brow Wax & Shape', duration: 20, price: 25 },
            { category: 'Brow Services', name: 'Brow Tint', duration: 15, price: 20 },

            // Sound Therapy
            { category: 'Sound Therapy', name: 'Sound Bath Session', duration: 60, price: 85 },
            { category: 'Sound Therapy', name: 'Private Sound Healing', duration: 90, price: 150 },

            // Reiki
            { category: 'Reiki', name: 'Reiki Session', duration: 60, price: 95 },
            { category: 'Reiki', name: 'Extended Reiki Healing', duration: 90, price: 140 },

            // Massage Therapy
            { category: 'Massage Therapy', name: 'Relaxation Massage', duration: 60, price: 95 },
            { category: 'Massage Therapy', name: 'Deep Tissue Massage', duration: 60, price: 110 },
            { category: 'Massage Therapy', name: 'Extended Massage', duration: 90, price: 140 },
            { category: 'Massage Therapy', name: 'Hot Stone Massage', duration: 75, price: 125 },

            // Waxing Services
            { category: 'Waxing Services', name: 'Full Face Wax', duration: 30, price: 45 },
            { category: 'Waxing Services', name: 'Lip or Chin Wax', duration: 10, price: 15 },
            { category: 'Waxing Services', name: 'Brazilian Wax', duration: 45, price: 65 },
            { category: 'Waxing Services', name: 'Bikini Wax', duration: 30, price: 45 },
            { category: 'Waxing Services', name: 'Full Leg Wax', duration: 45, price: 75 },
            { category: 'Waxing Services', name: 'Half Leg Wax', duration: 30, price: 45 },
            { category: 'Waxing Services', name: 'Underarm Wax', duration: 15, price: 25 },

            // Makeup
            { category: 'Makeup', name: 'Full Glam Makeup', duration: 60, price: 85 },
            { category: 'Makeup', name: 'Bridal Makeup', duration: 90, price: 150 },
            { category: 'Makeup', name: 'Bridal Trial', duration: 90, price: 125 },
            { category: 'Makeup', name: 'Special Occasion Makeup', duration: 60, price: 75 }
        ];

        const serviceIds = {};
        for (const svc of services) {
            const catId = categoryIds[svc.category];
            if (catId) {
                const result = await client.query(
                    `INSERT INTO services (category_id, name, duration_minutes, price)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT DO NOTHING
                     RETURNING id, name`,
                    [catId, svc.name, svc.duration, svc.price]
                );
                if (result.rows[0]) {
                    serviceIds[svc.name] = result.rows[0].id;
                }
            }
        }

        // 3. Create stylists
        console.log('Creating stylists...');
        const stylists = [
            {
                name: 'Emily',
                email: 'emily@emberandroots.com',
                phone: '(724) 516-4841',
                bio: 'Owner and lead aesthetician with over 10 years of experience in holistic skincare and energy healing.',
                services: ['all'] // Emily does everything
            },
            {
                name: 'Jessika',
                email: 'jessika@emberandroots.com',
                phone: '(724) 516-4841',
                bio: 'Specializing in lash extensions and brow artistry with a gentle, meticulous approach.',
                services: ['Eyelash Services', 'Brow Services', 'Waxing Services', 'Makeup']
            }
        ];

        const stylistIds = {};
        for (const stylist of stylists) {
            const result = await client.query(
                `INSERT INTO stylists (name, email, phone, bio)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (email) DO UPDATE SET name = $1
                 RETURNING id, name`,
                [stylist.name, stylist.email, stylist.phone, stylist.bio]
            );

            const stylistId = result.rows[0].id;
            stylistIds[stylist.name] = stylistId;

            // Create admin user for stylist
            const seedPassword = process.env.SEED_ADMIN_PASSWORD || 'changeme123';
            const passwordHash = await bcrypt.hash(seedPassword, 10);
            await client.query(
                `INSERT INTO admin_users (stylist_id, email, password_hash, role)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (email) DO NOTHING`,
                [stylistId, stylist.email, passwordHash, stylist.name === 'Emily' ? 'owner' : 'stylist']
            );

            // Assign services to stylist
            if (stylist.services.includes('all')) {
                // Assign all services
                for (const [serviceName, serviceId] of Object.entries(serviceIds)) {
                    await client.query(
                        `INSERT INTO stylist_services (stylist_id, service_id)
                         VALUES ($1, $2)
                         ON CONFLICT DO NOTHING`,
                        [stylistId, serviceId]
                    );
                }
            } else {
                // Assign specific category services
                for (const catName of stylist.services) {
                    const catId = categoryIds[catName];
                    if (catId) {
                        const catServices = await client.query(
                            `SELECT id FROM services WHERE category_id = $1`,
                            [catId]
                        );
                        for (const svc of catServices.rows) {
                            await client.query(
                                `INSERT INTO stylist_services (stylist_id, service_id)
                                 VALUES ($1, $2)
                                 ON CONFLICT DO NOTHING`,
                                [stylistId, svc.id]
                            );
                        }
                    }
                }
            }

            // Set default availability (Mon-Fri 9am-5pm for Emily, Tue-Sat for Jessika)
            const availability = stylist.name === 'Emily'
                ? [
                    { day: 1, start: '09:00', end: '17:00' }, // Monday
                    { day: 2, start: '09:00', end: '17:00' }, // Tuesday
                    { day: 3, start: '09:00', end: '17:00' }, // Wednesday
                    { day: 4, start: '09:00', end: '17:00' }, // Thursday
                    { day: 5, start: '09:00', end: '17:00' }  // Friday
                ]
                : [
                    { day: 2, start: '10:00', end: '18:00' }, // Tuesday
                    { day: 3, start: '10:00', end: '18:00' }, // Wednesday
                    { day: 4, start: '10:00', end: '18:00' }, // Thursday
                    { day: 5, start: '10:00', end: '18:00' }, // Friday
                    { day: 6, start: '09:00', end: '15:00' }  // Saturday
                ];

            for (const avail of availability) {
                await client.query(
                    `INSERT INTO stylist_availability (stylist_id, day_of_week, start_time, end_time)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT DO NOTHING`,
                    [stylistId, avail.day, avail.start, avail.end]
                );
            }
        }

        // 4. Insert default settings
        console.log('Setting up business settings...');
        const settings = [
            ['business_name', 'Ember & Roots Wellness'],
            ['business_phone', '(724) 516-4841'],
            ['business_email', 'hello@emberandroots.com'],
            ['business_address', '3122 Carson Avenue, Murrysville, PA 15668'],
            ['booking_buffer_minutes', '15'],
            ['cancellation_policy_hours', '48'],
            ['cancellation_fee_percent', '50'],
            ['no_show_fee_percent', '100'],
            ['max_advance_booking_days', '60'],
            ['min_advance_booking_hours', '2'],
            ['reminder_hours_before', '24'],
            ['timezone', 'America/New_York']
        ];

        for (const [key, value] of settings) {
            await client.query(
                `INSERT INTO settings (key, value)
                 VALUES ($1, $2)
                 ON CONFLICT (key) DO UPDATE SET value = $2`,
                [key, value]
            );
        }

        // Commit transaction
        await client.query('COMMIT');

        console.log('\n✨ Seeding completed successfully!');
        console.log('\n📋 Summary:');
        console.log(`   - ${Object.keys(categoryIds).length} service categories`);
        console.log(`   - ${Object.keys(serviceIds).length} services`);
        console.log(`   - ${Object.keys(stylistIds).length} stylists`);
        console.log('\n🔐 Admin Logins:');
        const pw = process.env.SEED_ADMIN_PASSWORD || 'changeme123';
        console.log(`   - emily@emberandroots.com / ${pw} (owner)`);
        console.log(`   - jessika@emberandroots.com / ${pw} (stylist)`);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Seeding failed:', err);
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

seed().catch(err => {
    console.error('Seed script failed:', err);
    process.exit(1);
});
