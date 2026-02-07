/**
 * Availability Routes (Public)
 * Handles checking available time slots for booking
 */

import { Router } from 'express';
import { query } from '../config/database.js';

const router = Router();

/**
 * GET /api/availability/:stylistId/:serviceId
 * Get available dates for a stylist and service
 * Query params: month (YYYY-MM)
 */
router.get('/:stylistId/:serviceId', async (req, res, next) => {
    try {
        const { stylistId, serviceId } = req.params;
        const { month } = req.query; // Format: YYYY-MM

        // Get service duration
        const serviceResult = await query(`
            SELECT
                COALESCE(ss.custom_duration, s.duration_minutes) as duration
            FROM services s
            LEFT JOIN stylist_services ss ON s.id = ss.service_id AND ss.stylist_id = $1
            WHERE s.id = $2
        `, [stylistId, serviceId]);

        if (serviceResult.rows.length === 0) {
            return res.status(404).json({ error: 'Service not found' });
        }

        const serviceDuration = serviceResult.rows[0].duration;

        // Get stylist's weekly availability
        const availabilityResult = await query(`
            SELECT day_of_week, start_time, end_time
            FROM stylist_availability
            WHERE stylist_id = $1 AND is_active = true
        `, [stylistId]);

        // Get settings
        const settingsResult = await query(`
            SELECT key, value FROM settings
            WHERE key IN ('booking_buffer_minutes', 'max_advance_booking_days', 'min_advance_booking_hours')
        `);

        const settings = {};
        settingsResult.rows.forEach(row => {
            settings[row.key] = parseInt(row.value);
        });

        const bufferMinutes = settings.booking_buffer_minutes || 15;
        const maxAdvanceDays = settings.max_advance_booking_days || 60;
        const minAdvanceHours = settings.min_advance_booking_hours || 2;

        // Calculate date range
        const now = new Date();
        const minBookingTime = new Date(now.getTime() + minAdvanceHours * 60 * 60 * 1000);

        let startDate, endDate;
        if (month) {
            const [year, monthNum] = month.split('-').map(Number);
            startDate = new Date(year, monthNum - 1, 1);
            endDate = new Date(year, monthNum, 0);
        } else {
            startDate = new Date(now);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(now.getTime() + maxAdvanceDays * 24 * 60 * 60 * 1000);
        }

        // Ensure startDate is not in the past
        if (startDate < now) {
            startDate = new Date(now);
            startDate.setHours(0, 0, 0, 0);
        }

        // Get time-off for the date range
        const timeOffResult = await query(`
            SELECT start_datetime, end_datetime
            FROM stylist_time_off
            WHERE stylist_id = $1
              AND end_datetime >= $2
              AND start_datetime <= $3
        `, [stylistId, startDate.toISOString(), endDate.toISOString()]);

        // Get existing bookings for the date range
        const bookingsResult = await query(`
            SELECT start_datetime, end_datetime
            FROM bookings
            WHERE stylist_id = $1
              AND status NOT IN ('cancelled')
              AND end_datetime >= $2
              AND start_datetime <= $3
        `, [stylistId, startDate.toISOString(), endDate.toISOString()]);

        // Build availability map by day of week
        const availabilityByDay = {};
        availabilityResult.rows.forEach(row => {
            if (!availabilityByDay[row.day_of_week]) {
                availabilityByDay[row.day_of_week] = [];
            }
            availabilityByDay[row.day_of_week].push({
                start: row.start_time,
                end: row.end_time
            });
        });

        // Generate available dates
        const availableDates = [];
        const currentDate = new Date(startDate);

        while (currentDate <= endDate) {
            const dayOfWeek = currentDate.getDay();
            const dateStr = currentDate.toISOString().split('T')[0];

            // Check if stylist works on this day
            if (availabilityByDay[dayOfWeek]) {
                // Check if entire day is blocked by time-off
                const dayStart = new Date(currentDate);
                dayStart.setHours(0, 0, 0, 0);
                const dayEnd = new Date(currentDate);
                dayEnd.setHours(23, 59, 59, 999);

                const isFullDayOff = timeOffResult.rows.some(to => {
                    const toStart = new Date(to.start_datetime);
                    const toEnd = new Date(to.end_datetime);
                    return toStart <= dayStart && toEnd >= dayEnd;
                });

                if (!isFullDayOff) {
                    // Check if there's at least one available slot
                    const hasAvailability = availabilityByDay[dayOfWeek].some(slot => {
                        // Parse times
                        const [startHour, startMin] = slot.start.split(':').map(Number);
                        const [endHour, endMin] = slot.end.split(':').map(Number);

                        const slotStart = new Date(currentDate);
                        slotStart.setHours(startHour, startMin, 0, 0);

                        const slotEnd = new Date(currentDate);
                        slotEnd.setHours(endHour, endMin, 0, 0);

                        // Check if slot is in the future
                        if (slotEnd <= minBookingTime) return false;

                        // Check if any time is available in this slot
                        // (simplified check - actual slot calculation happens in /slots endpoint)
                        return true;
                    });

                    if (hasAvailability) {
                        availableDates.push(dateStr);
                    }
                }
            }

            currentDate.setDate(currentDate.getDate() + 1);
        }

        res.json({
            stylist_id: stylistId,
            service_id: serviceId,
            service_duration: serviceDuration,
            available_dates: availableDates
        });

    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/availability/:stylistId/:serviceId/slots
 * Get available time slots for a specific date
 * Query params: date (YYYY-MM-DD)
 */
router.get('/:stylistId/:serviceId/slots', async (req, res, next) => {
    try {
        const { stylistId, serviceId } = req.params;
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({ error: 'Date parameter required' });
        }

        const requestedDate = new Date(date + 'T00:00:00');
        const dayOfWeek = requestedDate.getDay();

        // Get service duration
        const serviceResult = await query(`
            SELECT
                COALESCE(ss.custom_duration, s.duration_minutes) as duration
            FROM services s
            LEFT JOIN stylist_services ss ON s.id = ss.service_id AND ss.stylist_id = $1
            WHERE s.id = $2
        `, [stylistId, serviceId]);

        if (serviceResult.rows.length === 0) {
            return res.status(404).json({ error: 'Service not found' });
        }

        const serviceDuration = serviceResult.rows[0].duration;

        // Get stylist's availability for this day
        const availabilityResult = await query(`
            SELECT start_time, end_time
            FROM stylist_availability
            WHERE stylist_id = $1 AND day_of_week = $2 AND is_active = true
        `, [stylistId, dayOfWeek]);

        if (availabilityResult.rows.length === 0) {
            return res.json({ slots: [] });
        }

        // Get settings
        const settingsResult = await query(`
            SELECT key, value FROM settings
            WHERE key IN ('booking_buffer_minutes', 'min_advance_booking_hours')
        `);

        const settings = {};
        settingsResult.rows.forEach(row => {
            settings[row.key] = parseInt(row.value);
        });

        const bufferMinutes = settings.booking_buffer_minutes || 15;
        const minAdvanceHours = settings.min_advance_booking_hours || 2;

        const now = new Date();
        const minBookingTime = new Date(now.getTime() + minAdvanceHours * 60 * 60 * 1000);

        // Get time-off for this date
        const dayStart = new Date(requestedDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(requestedDate);
        dayEnd.setHours(23, 59, 59, 999);

        const timeOffResult = await query(`
            SELECT start_datetime, end_datetime
            FROM stylist_time_off
            WHERE stylist_id = $1
              AND end_datetime >= $2
              AND start_datetime <= $3
        `, [stylistId, dayStart.toISOString(), dayEnd.toISOString()]);

        // Get existing bookings for this date
        const bookingsResult = await query(`
            SELECT start_datetime, end_datetime
            FROM bookings
            WHERE stylist_id = $1
              AND status NOT IN ('cancelled')
              AND DATE(start_datetime) = $2
        `, [stylistId, date]);

        // Generate available slots
        const slots = [];
        const slotInterval = 15; // 15-minute intervals

        for (const availability of availabilityResult.rows) {
            const [startHour, startMin] = availability.start_time.split(':').map(Number);
            const [endHour, endMin] = availability.end_time.split(':').map(Number);

            let slotStart = new Date(requestedDate);
            slotStart.setHours(startHour, startMin, 0, 0);

            const workEnd = new Date(requestedDate);
            workEnd.setHours(endHour, endMin, 0, 0);

            while (slotStart < workEnd) {
                const slotEnd = new Date(slotStart.getTime() + serviceDuration * 60 * 1000);

                // Check if slot fits within working hours
                if (slotEnd <= workEnd) {
                    // Check if slot is in the future
                    if (slotStart >= minBookingTime) {
                        // Check if slot conflicts with time-off
                        const conflictsWithTimeOff = timeOffResult.rows.some(to => {
                            const toStart = new Date(to.start_datetime);
                            const toEnd = new Date(to.end_datetime);
                            return slotStart < toEnd && slotEnd > toStart;
                        });

                        // Check if slot conflicts with existing bookings
                        const conflictsWithBooking = bookingsResult.rows.some(b => {
                            const bStart = new Date(b.start_datetime);
                            const bEnd = new Date(b.end_datetime);
                            // Add buffer time
                            const bufferEnd = new Date(bEnd.getTime() + bufferMinutes * 60 * 1000);
                            return slotStart < bufferEnd && slotEnd > bStart;
                        });

                        if (!conflictsWithTimeOff && !conflictsWithBooking) {
                            slots.push({
                                start: slotStart.toISOString(),
                                end: slotEnd.toISOString(),
                                display: slotStart.toLocaleTimeString('en-US', {
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    hour12: true
                                })
                            });
                        }
                    }
                }

                // Move to next slot
                slotStart = new Date(slotStart.getTime() + slotInterval * 60 * 1000);
            }
        }

        res.json({
            date,
            stylist_id: stylistId,
            service_id: serviceId,
            service_duration: serviceDuration,
            slots
        });

    } catch (err) {
        next(err);
    }
});

export default router;
