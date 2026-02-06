/**
 * Notification Service
 * Handles email, SMS, and calendar invites
 */

import nodemailer from 'nodemailer';
import ical from 'ical-generator';

// Email transporter (using Resend API via SMTP)
const emailTransporter = nodemailer.createTransport({
    host: 'smtp.resend.com',
    port: 465,
    secure: true,
    auth: {
        user: 'resend',
        pass: process.env.RESEND_API_KEY
    }
});

// Twilio client (lazy initialization)
let twilioClient = null;
function getTwilio() {
    if (!twilioClient && process.env.TWILIO_ACCOUNT_SID) {
        const twilio = require('twilio');
        twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    }
    return twilioClient;
}

/**
 * Generate calendar invite (ICS file)
 */
export function generateCalendarInvite(booking) {
    const calendar = ical({
        name: process.env.BUSINESS_NAME || 'Ember & Roots Wellness',
        prodId: '//Ember & Roots Wellness//Booking System//EN'
    });

    const event = calendar.createEvent({
        start: new Date(booking.start_datetime),
        end: new Date(booking.end_datetime),
        summary: `${booking.service_name} at Ember & Roots`,
        description: `Your appointment with ${booking.stylist_name}\n\nService: ${booking.service_name}\nDuration: ${booking.service_duration} minutes\n\nConfirmation Code: ${booking.confirmation_code}\n\n${process.env.BUSINESS_ADDRESS}`,
        location: process.env.BUSINESS_ADDRESS,
        organizer: {
            name: process.env.BUSINESS_NAME,
            email: process.env.BUSINESS_EMAIL
        },
        attendees: [{
            name: booking.client_name,
            email: booking.client_email,
            rsvp: true
        }]
    });

    return calendar.toString();
}

/**
 * Send booking confirmation email
 */
export async function sendConfirmationEmail(booking) {
    const appointmentDate = new Date(booking.start_datetime);
    const dateStr = appointmentDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const timeStr = appointmentDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });

    const calendarInvite = generateCalendarInvite(booking);

    const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Georgia, serif; background: #1a1612; color: #f5f0e8; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #2a2420; border-radius: 16px; padding: 40px; }
        .logo { text-align: center; margin-bottom: 30px; }
        .logo-text { font-size: 24px; color: #d4a574; }
        h1 { color: #f5f0e8; font-weight: 400; font-size: 28px; text-align: center; margin-bottom: 30px; }
        .details { background: rgba(212, 165, 116, 0.1); border-radius: 12px; padding: 24px; margin: 24px 0; }
        .detail-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid rgba(212, 165, 116, 0.1); }
        .detail-row:last-child { border-bottom: none; }
        .label { color: #7d8471; }
        .value { color: #f5f0e8; font-weight: 500; }
        .confirmation-code { text-align: center; font-size: 32px; color: #d4a574; letter-spacing: 4px; margin: 30px 0; }
        .policy { font-size: 14px; color: #7d8471; margin-top: 30px; padding-top: 20px; border-top: 1px solid rgba(212, 165, 116, 0.1); }
        .footer { text-align: center; margin-top: 30px; color: #7d8471; font-size: 14px; }
        a { color: #d4a574; }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">
            <span class="logo-text">Ember & Roots Wellness</span>
        </div>

        <h1>Booking Confirmed</h1>

        <p style="text-align: center; color: #e8dfd4;">Thank you for choosing us. We look forward to seeing you.</p>

        <div class="confirmation-code">${booking.confirmation_code}</div>

        <div class="details">
            <div class="detail-row">
                <span class="label">Service</span>
                <span class="value">${booking.service_name}</span>
            </div>
            <div class="detail-row">
                <span class="label">With</span>
                <span class="value">${booking.stylist_name}</span>
            </div>
            <div class="detail-row">
                <span class="label">Date</span>
                <span class="value">${dateStr}</span>
            </div>
            <div class="detail-row">
                <span class="label">Time</span>
                <span class="value">${timeStr}</span>
            </div>
            <div class="detail-row">
                <span class="label">Duration</span>
                <span class="value">${booking.service_duration} minutes</span>
            </div>
            <div class="detail-row">
                <span class="label">Price</span>
                <span class="value">$${booking.service_price}</span>
            </div>
        </div>

        <div class="policy">
            <strong>Cancellation Policy:</strong> A 48-hour cancellation policy applies to all services.
            50% of the service fee will be charged for late cancellations.
            100% will be charged for no-shows.
        </div>

        <div class="footer">
            <p>${process.env.BUSINESS_ADDRESS}</p>
            <p><a href="tel:${process.env.BUSINESS_PHONE}">${process.env.BUSINESS_PHONE}</a></p>
        </div>
    </div>
</body>
</html>
    `;

    try {
        await emailTransporter.sendMail({
            from: `"${process.env.BUSINESS_NAME}" <${process.env.EMAIL_FROM}>`,
            to: booking.client_email,
            subject: `Booking Confirmed - ${booking.service_name} on ${dateStr}`,
            html,
            icalEvent: {
                filename: 'appointment.ics',
                method: 'REQUEST',
                content: calendarInvite
            }
        });

        console.log(`✉️ Confirmation email sent to ${booking.client_email}`);
        return true;
    } catch (err) {
        console.error('Failed to send confirmation email:', err);
        return false;
    }
}

/**
 * Send booking reminder email
 */
export async function sendReminderEmail(booking) {
    const appointmentDate = new Date(booking.start_datetime);
    const dateStr = appointmentDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
    });
    const timeStr = appointmentDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });

    const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Georgia, serif; background: #1a1612; color: #f5f0e8; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #2a2420; border-radius: 16px; padding: 40px; }
        .logo { text-align: center; margin-bottom: 30px; color: #d4a574; font-size: 24px; }
        h1 { color: #f5f0e8; font-weight: 400; font-size: 24px; text-align: center; }
        .highlight { color: #d4a574; font-size: 20px; text-align: center; margin: 20px 0; }
        .details { background: rgba(212, 165, 116, 0.1); border-radius: 12px; padding: 24px; margin: 24px 0; }
        .footer { text-align: center; margin-top: 30px; color: #7d8471; font-size: 14px; }
        a { color: #d4a574; }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">Ember & Roots Wellness</div>
        <h1>Appointment Reminder</h1>
        <p class="highlight">Tomorrow at ${timeStr}</p>

        <div class="details">
            <p><strong>Service:</strong> ${booking.service_name}</p>
            <p><strong>With:</strong> ${booking.stylist_name}</p>
            <p><strong>Date:</strong> ${dateStr}</p>
            <p><strong>Confirmation:</strong> ${booking.confirmation_code}</p>
        </div>

        <p style="text-align: center;">We look forward to seeing you!</p>

        <div class="footer">
            <p>Need to reschedule? Please call us at <a href="tel:${process.env.BUSINESS_PHONE}">${process.env.BUSINESS_PHONE}</a></p>
        </div>
    </div>
</body>
</html>
    `;

    try {
        await emailTransporter.sendMail({
            from: `"${process.env.BUSINESS_NAME}" <${process.env.EMAIL_FROM}>`,
            to: booking.client_email,
            subject: `Reminder: ${booking.service_name} Tomorrow at ${timeStr}`,
            html
        });

        console.log(`✉️ Reminder email sent to ${booking.client_email}`);
        return true;
    } catch (err) {
        console.error('Failed to send reminder email:', err);
        return false;
    }
}

/**
 * Send SMS confirmation
 */
export async function sendConfirmationSMS(booking) {
    const twilio = getTwilio();
    if (!twilio || !booking.client_phone) return false;

    const appointmentDate = new Date(booking.start_datetime);
    const dateStr = appointmentDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    });
    const timeStr = appointmentDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });

    const message = `Ember & Roots: Your ${booking.service_name} with ${booking.stylist_name} is confirmed for ${dateStr} at ${timeStr}. Confirmation: ${booking.confirmation_code}`;

    try {
        await twilio.messages.create({
            body: message,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: booking.client_phone
        });

        console.log(`📱 Confirmation SMS sent to ${booking.client_phone}`);
        return true;
    } catch (err) {
        console.error('Failed to send confirmation SMS:', err);
        return false;
    }
}

/**
 * Send SMS reminder
 */
export async function sendReminderSMS(booking) {
    const twilio = getTwilio();
    if (!twilio || !booking.client_phone) return false;

    const appointmentDate = new Date(booking.start_datetime);
    const timeStr = appointmentDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });

    const message = `Ember & Roots Reminder: Your ${booking.service_name} is tomorrow at ${timeStr}. See you soon! Questions? Call ${process.env.BUSINESS_PHONE}`;

    try {
        await twilio.messages.create({
            body: message,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: booking.client_phone
        });

        console.log(`📱 Reminder SMS sent to ${booking.client_phone}`);
        return true;
    } catch (err) {
        console.error('Failed to send reminder SMS:', err);
        return false;
    }
}

/**
 * Send all notifications for a new booking
 */
export async function sendBookingNotifications(booking) {
    const results = {
        email: false,
        sms: false
    };

    results.email = await sendConfirmationEmail(booking);

    if (booking.client_phone) {
        results.sms = await sendConfirmationSMS(booking);
    }

    return results;
}

/**
 * Send all reminders for a booking
 */
export async function sendBookingReminders(booking) {
    const results = {
        email: false,
        sms: false
    };

    results.email = await sendReminderEmail(booking);

    if (booking.client_phone) {
        results.sms = await sendReminderSMS(booking);
    }

    return results;
}

/**
 * Check if email service is configured
 */
export function isEmailConfigured() {
    return !!process.env.RESEND_API_KEY;
}

/**
 * Send OTP verification email
 */
export async function sendOTPEmail(email, code) {
    // Dev mode: if Resend is not configured, log the code and return false
    if (!process.env.RESEND_API_KEY) {
        console.log(`\n📧 ============================================`);
        console.log(`📧  EMAIL NOT CONFIGURED (Dev Mode)`);
        console.log(`📧  OTP Code for ${email}: ${code}`);
        console.log(`📧 ============================================\n`);
        return false;
    }

    const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Georgia, serif; background: #1a1612; color: #f5f0e8; margin: 0; padding: 20px; }
        .container { max-width: 500px; margin: 0 auto; background: #2a2420; border-radius: 16px; padding: 40px; text-align: center; }
        .logo { color: #d4a574; font-size: 24px; margin-bottom: 20px; }
        h1 { color: #f5f0e8; font-weight: 400; font-size: 24px; margin-bottom: 16px; }
        p { color: #e8dfd4; margin-bottom: 24px; }
        .code { font-size: 48px; font-weight: 500; color: #d4a574; letter-spacing: 8px; margin: 30px 0; padding: 20px; background: rgba(212, 165, 116, 0.1); border-radius: 12px; }
        .note { font-size: 14px; color: #7d8471; margin-top: 30px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">Ember & Roots Wellness</div>
        <h1>Your Verification Code</h1>
        <p>Enter this code to continue with your booking:</p>
        <div class="code">${code}</div>
        <p class="note">This code expires in 10 minutes.<br>If you didn't request this, please ignore this email.</p>
    </div>
</body>
</html>
    `;

    try {
        await emailTransporter.sendMail({
            from: `"${process.env.BUSINESS_NAME}" <${process.env.EMAIL_FROM}>`,
            to: email,
            subject: `Your Ember & Roots verification code: ${code}`,
            html
        });

        console.log(`✉️ OTP email sent to ${email}`);
        return true;
    } catch (err) {
        console.error('Failed to send OTP email:', err);
        return false;
    }
}

/**
 * Send OTP verification SMS
 */
export async function sendOTPSMS(phone, code) {
    const twilio = getTwilio();
    if (!twilio) {
        console.log('Twilio not configured, skipping SMS');
        return false;
    }

    const message = `Ember & Roots: Your verification code is ${code}. This code expires in 10 minutes.`;

    try {
        await twilio.messages.create({
            body: message,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: phone
        });

        console.log(`📱 OTP SMS sent to ${phone}`);
        return true;
    } catch (err) {
        console.error('Failed to send OTP SMS:', err);
        return false;
    }
}

/**
 * Send an ad-hoc SMS message (admin compose)
 */
export async function sendAdHocSMS(to, message) {
    const twilio = getTwilio();
    if (!twilio) {
        throw new Error('Twilio is not configured');
    }

    await twilio.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: to
    });

    console.log(`📱 Ad-hoc SMS sent to ${to}`);
    return true;
}
