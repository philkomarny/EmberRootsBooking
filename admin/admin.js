/**
 * Ember & Roots Admin Dashboard
 */

const API_URL = '/api';
const BUSINESS_TZ = 'America/New_York';

// State
let currentUser = null;
let authToken = sessionStorage.getItem('adminToken');

function showSectionLoading(containerId) {
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = '<div style="text-align:center;padding:40px;color:#7d8471;">Loading...</div>';
}
function hideSectionLoading(containerId) {
    // Content will be replaced by the actual data load
}

// SMS Templates
const SMS_TEMPLATES = {
    'reminder': 'Hi {name}, this is a reminder about your upcoming appointment at Ember & Roots. We look forward to seeing you! If you need to reschedule, please give us a call.',
    'running-late': 'Hi {name}, we wanted to let you know that we are running a bit behind schedule. We apologize for the inconvenience and will be with you as soon as possible.',
    'follow-up': 'Hi {name}, thank you for visiting Ember & Roots! We hope you loved your experience. Feel free to reach out if you need anything.',
    'reschedule': 'Hi {name}, we need to reschedule your upcoming appointment at Ember & Roots. Please give us a call at your earliest convenience so we can find a new time that works for you.',
    'thank-you': 'Hi {name}, thank you for choosing Ember & Roots! We truly appreciate your visit and hope to see you again soon.'
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    if (authToken) {
        fetchCurrentUser();
    } else {
        showLogin();
    }

    setupEventListeners();
});

/**
 * Setup Event Listeners
 */
function setupEventListeners() {
    // Login form
    document.getElementById('loginForm').addEventListener('submit', handleLogin);

    // Mobile menu toggle
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            document.querySelector('.sidebar')?.classList.toggle('open');
            sidebarOverlay?.classList.toggle('active');
        });
        sidebarOverlay?.addEventListener('click', () => {
            document.querySelector('.sidebar')?.classList.remove('open');
            sidebarOverlay?.classList.remove('active');
        });
    }

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.dataset.section;
            navigateTo(section);
        });
    });

    // Filters
    document.getElementById('applyFilters')?.addEventListener('click', loadBookings);

    // Booking detail modal
    document.querySelector('#bookingDetailModal .modal-overlay')?.addEventListener('click', closeBookingDetail);

    // Calendar navigation
    document.getElementById('calPrev')?.addEventListener('click', () => navigateCalendar(-1));
    document.getElementById('calNext')?.addEventListener('click', () => navigateCalendar(1));

    // Availability
    document.getElementById('saveSchedule')?.addEventListener('click', saveSchedule);
    document.getElementById('addTimeOff')?.addEventListener('click', showTimeOffModal);

    // Time off form
    document.getElementById('timeOffForm')?.addEventListener('submit', handleAddTimeOff);

    // Settings forms
    document.getElementById('businessSettings')?.addEventListener('submit', saveBusinessSettings);
    document.getElementById('bookingSettings')?.addEventListener('submit', saveBookingSettings);

    // Clients section
    setupClientsSection();

    // Modal close
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', closeModals);
    });
    document.getElementById('modalOverlay')?.addEventListener('click', closeModals);
}

/**
 * API Helper
 */
async function api(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...(authToken && { 'Authorization': `Bearer ${authToken}` })
    };

    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: { ...headers, ...options.headers }
    });

    if (response.status === 401) {
        handleLogout();
        throw new Error('Session expired');
    }

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Request failed');
    }

    return data;
}

/**
 * Authentication
 */
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('loginError');

    try {
        const data = await api('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        authToken = data.token;
        currentUser = data.user;
        sessionStorage.setItem('adminToken', authToken);

        showDashboard();
    } catch (err) {
        errorEl.textContent = err.message;
    }
}

async function fetchCurrentUser() {
    try {
        const data = await api('/auth/me');
        currentUser = data.user;
        showDashboard();
    } catch (err) {
        showLogin();
    }
}

function handleLogout() {
    authToken = null;
    currentUser = null;
    sessionStorage.removeItem('adminToken');
    showLogin();
}

function showLogin() {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('dashboard').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');

    // Update user info
    document.getElementById('userName').textContent = currentUser.stylist_name || currentUser.email;
    document.getElementById('userRole').textContent = currentUser.role;

    // Show/hide owner-only elements
    if (currentUser.role !== 'owner') {
        document.querySelectorAll('.owner-only').forEach(el => el.classList.add('hidden'));
    }

    // Set current date
    document.getElementById('currentDate').textContent = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    // Load initial data
    loadDashboard();
}

/**
 * Navigation
 */
function navigateTo(section) {
    // Map section names to their corresponding section IDs
    const sectionMap = {
        'services-management': 'servicesManagementSection',
        'business-info': 'businessInfoSection',
        'booking-settings': 'bookingSettingsSection'
    };

    // Determine which nav item should be active (settings sub-pages keep settings active)
    const settingsSubPages = ['services-management', 'business-info', 'booking-settings'];
    const navSection = settingsSubPages.includes(section) ? 'settings' : section;

    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.section === navSection);
    });

    // Update sections
    document.querySelectorAll('.section').forEach(sec => {
        sec.classList.remove('active');
    });

    // Use the mapped section ID or default pattern
    const sectionId = sectionMap[section] || `${section}Section`;
    document.getElementById(sectionId)?.classList.add('active');

    // Load section data
    switch (section) {
        case 'overview':
            loadDashboard();
            break;
        case 'calendar':
            loadCalendar();
            break;
        case 'bookings':
            loadBookings();
            break;
        case 'availability':
            loadAvailability();
            break;
        case 'stylists':
            loadTeamMembers();
            break;
        case 'settings':
            // Just show the settings menu, no data to load
            break;
        case 'services-management':
            loadServicesManagement();
            break;
        case 'business-info':
            loadSettings();
            break;
        case 'booking-settings':
            loadSettings();
            break;
    }
}

/**
 * Dashboard
 */
async function loadDashboard() {
    showSectionLoading('upcomingList');
    showSectionLoading('recentList');
    try {
        const data = await api('/admin/dashboard');

        document.getElementById('todayBookings').textContent = data.today.bookings;
        document.getElementById('todayRevenue').textContent = `$${data.today.revenue.toFixed(0)}`;
        document.getElementById('weekBookings').textContent = data.week.bookings;
        document.getElementById('weekRevenue').textContent = `$${data.week.revenue.toFixed(0)}`;

        // Upcoming appointments
        const upcomingEl = document.getElementById('upcomingList');
        if (data.upcoming.length === 0) {
            upcomingEl.innerHTML = '<p class="empty-state">No upcoming appointments</p>';
        } else {
            upcomingEl.innerHTML = data.upcoming.map(appt => {
                const date = new Date(appt.start_datetime);
                return `
                    <div class="appointment-item" data-id="${appt.id}">
                        <div class="appointment-time">
                            ${date.toLocaleDateString('en-US', { timeZone: BUSINESS_TZ, month: 'short', day: 'numeric' })}<br>
                            ${date.toLocaleTimeString('en-US', { timeZone: BUSINESS_TZ, hour: 'numeric', minute: '2-digit' })}
                        </div>
                        <div class="appointment-info">
                            <div class="appointment-service">${escapeHtml(appt.service_name)}</div>
                            <div class="appointment-client">${escapeHtml(appt.client_name)} • ${escapeHtml(appt.stylist_name)}</div>
                        </div>
                        <span class="appointment-status status-${appt.status}">${escapeHtml(appt.status)}</span>
                    </div>
                `;
            }).join('');
        }

        // Recent bookings
        const recentEl = document.getElementById('recentList');
        if (data.recent.length === 0) {
            recentEl.innerHTML = '<p class="empty-state">No recent bookings</p>';
        } else {
            recentEl.innerHTML = data.recent.map(booking => {
                const date = new Date(booking.start_datetime);
                return `
                    <div class="booking-item" data-id="${booking.id}">
                        <div class="appointment-info">
                            <div class="appointment-service">${escapeHtml(booking.service_name)}</div>
                            <div class="appointment-client">${escapeHtml(booking.client_name)} • ${date.toLocaleDateString()}</div>
                        </div>
                        <span class="booking-status status-${booking.status}">${escapeHtml(booking.status)}</span>
                    </div>
                `;
            }).join('');
        }

    } catch (err) {
        console.error('Failed to load dashboard:', err);
    }
}

/**
 * Calendar
 */
let calendarDate = new Date();

function loadCalendar() {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();

    document.getElementById('calMonth').textContent = calendarDate.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
    });

    const grid = document.getElementById('calendarGrid');
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    let html = days.map(d => `<div class="calendar-header">${d}</div>`).join('');

    // Empty cells for days before first of month
    for (let i = 0; i < firstDay; i++) {
        html += `<div class="calendar-day other-month"></div>`;
    }

    // Days of month
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const isToday = date.toDateString() === today.toDateString();
        html += `
            <div class="calendar-day ${isToday ? 'today' : ''}" data-date="${date.toISOString().split('T')[0]}">
                <span class="day-number">${day}</span>
                <span class="day-bookings"></span>
            </div>
        `;
    }

    grid.innerHTML = html;

    // Load bookings for this month
    loadCalendarBookings(year, month);
}

async function loadCalendarBookings(year, month) {
    const startDate = new Date(year, month, 1).toISOString().split('T')[0];
    const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

    try {
        const data = await api(`/bookings?date_from=${startDate}&date_to=${endDate}&limit=500`);

        // Count bookings per day
        const bookingsByDay = {};
        data.bookings.forEach(b => {
            const day = new Date(b.start_datetime).toISOString().split('T')[0];
            bookingsByDay[day] = (bookingsByDay[day] || 0) + 1;
        });

        // Update calendar
        document.querySelectorAll('.calendar-day[data-date]').forEach(dayEl => {
            const date = dayEl.dataset.date;
            const count = bookingsByDay[date] || 0;
            const countEl = dayEl.querySelector('.day-bookings');
            if (count > 0) {
                countEl.textContent = `${count} booking${count > 1 ? 's' : ''}`;
            }
        });

    } catch (err) {
        console.error('Failed to load calendar bookings:', err);
    }
}

function navigateCalendar(direction) {
    calendarDate.setMonth(calendarDate.getMonth() + direction);
    loadCalendar();
}

/**
 * Bookings
 */
let bookingsCache = [];

async function loadBookings() {
    showSectionLoading('bookingsTable');
    const status = document.getElementById('bookingStatusFilter').value;
    const dateFrom = document.getElementById('bookingDateFrom').value;
    const dateTo = document.getElementById('bookingDateTo').value;

    let url = '/bookings?limit=50';
    if (status) url += `&status=${status}`;
    if (dateFrom) url += `&date_from=${dateFrom}`;
    if (dateTo) url += `&date_to=${dateTo}`;

    try {
        const data = await api(url);
        bookingsCache = data.bookings;

        const table = document.getElementById('bookingsTable');
        if (data.bookings.length === 0) {
            table.innerHTML = '<p class="empty-state" style="padding: 2rem; text-align: center;">No bookings found</p>';
            return;
        }

        table.innerHTML = `
            <div class="table-header">
                <span>Code</span>
                <span>Service</span>
                <span>Client</span>
                <span>Date & Time</span>
                <span>Stylist</span>
                <span>Status</span>
            </div>
            ${data.bookings.map(b => {
                const date = new Date(b.start_datetime);
                return `
                    <div class="table-row" data-id="${b.id}">
                        <span>${escapeHtml(b.confirmation_code)}</span>
                        <span>${escapeHtml(b.service_name)}</span>
                        <span>${escapeHtml(b.client_name)}</span>
                        <span>${date.toLocaleDateString('en-US', { timeZone: BUSINESS_TZ })} ${date.toLocaleTimeString('en-US', { timeZone: BUSINESS_TZ, hour: 'numeric', minute: '2-digit' })}</span>
                        <span>${escapeHtml(b.stylist_name)}</span>
                        <span class="booking-status status-${b.status}">${escapeHtml(b.status)}</span>
                    </div>
                `;
            }).join('')}
        `;

        // Attach click handlers for booking detail
        table.querySelectorAll('.table-row').forEach(row => {
            row.addEventListener('click', () => {
                openBookingDetail(row.dataset.id);
            });
        });

    } catch (err) {
        console.error('Failed to load bookings:', err);
    }
}

/**
 * Booking Detail View
 */
function openBookingDetail(bookingId) {
    const booking = bookingsCache.find(b => b.id === bookingId);
    if (!booking) return;

    const startDate = new Date(booking.start_datetime);
    const endDate = new Date(booking.end_datetime);
    const dateStr = startDate.toLocaleDateString('en-US', { timeZone: BUSINESS_TZ, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const startTime = formatETTime(startDate);
    const endTime = formatETTime(endDate);
    const isOpen = booking.status === 'confirmed' || booking.status === 'pending';

    const content = document.getElementById('bookingDetailContent');
    content.innerHTML = `
        <div class="booking-detail-card">
            <div class="booking-detail-status">
                <span class="confirmation-code">#${escapeHtml(booking.confirmation_code)}</span>
                <span class="booking-status status-${booking.status}">${escapeHtml(booking.status)}</span>
            </div>

            <div class="booking-detail-grid">
                <div class="booking-detail-field">
                    <label>Service</label>
                    <span class="field-value">${escapeHtml(booking.service_name)}</span>
                </div>
                <div class="booking-detail-field">
                    <label>Duration</label>
                    <span class="field-value">${booking.service_duration} min</span>
                </div>
                <div class="booking-detail-field">
                    <label>Date</label>
                    <span class="field-value">${dateStr}</span>
                </div>
                <div class="booking-detail-field">
                    <label>Time</label>
                    <span class="field-value">${startTime} – ${endTime}</span>
                </div>
                <div class="booking-detail-field">
                    <label>Stylist</label>
                    <span class="field-value">${escapeHtml(booking.stylist_name)}</span>
                </div>
                <div class="booking-detail-field">
                    <label>Price</label>
                    <span class="field-value">$${parseFloat(booking.service_price).toFixed(2)}</span>
                </div>
                <div class="booking-detail-field">
                    <label>Client</label>
                    <span class="field-value">${escapeHtml(booking.client_name)}</span>
                </div>
                <div class="booking-detail-field">
                    <label>Email</label>
                    <span class="field-value">${escapeHtml(booking.client_email)}</span>
                </div>
                ${booking.client_phone ? `
                <div class="booking-detail-field">
                    <label>Phone</label>
                    <span class="field-value">${escapeHtml(booking.client_phone)}</span>
                </div>` : ''}
                ${booking.client_notes ? `
                <div class="booking-detail-field full-width">
                    <label>Client Notes</label>
                    <span class="field-value">${escapeHtml(booking.client_notes)}</span>
                </div>` : ''}
            </div>

            ${isOpen ? `
            <div class="booking-tip-section">
                <h4>Tip</h4>
                <div class="tip-input-row">
                    <span class="tip-currency">$</span>
                    <input type="number" id="bookingTip" class="tip-input" min="0" step="0.01" placeholder="0.00" value="">
                    <div class="tip-presets">
                        <button class="tip-preset-btn" onclick="setTipPreset(${parseFloat(booking.service_price)}, 15)">15%</button>
                        <button class="tip-preset-btn" onclick="setTipPreset(${parseFloat(booking.service_price)}, 20)">20%</button>
                        <button class="tip-preset-btn" onclick="setTipPreset(${parseFloat(booking.service_price)}, 25)">25%</button>
                    </div>
                </div>
            </div>

            <div class="booking-notes-section">
                <h4>Session Notes</h4>
                <textarea class="booking-notes-textarea" id="bookingNotes" placeholder="Add notes about this appointment (will be saved to client record)...">${escapeHtml(booking.internal_notes || '')}</textarea>
            </div>

            <div class="booking-detail-actions">
                <button class="btn-cancel-booking" onclick="cancelBooking('${booking.id}')">Cancel Appointment</button>
                <button class="btn-complete-booking" onclick="completeBooking('${booking.id}')">Complete Appointment</button>
            </div>
            ` : `
            <div class="booking-closed-banner banner-${booking.status}">
                ${booking.status === 'completed' ? '✓ Appointment Completed' :
                  booking.status === 'cancelled' ? '✕ Appointment Cancelled' :
                  '⚠ No Show'}
            </div>
            ${booking.status === 'completed' ? `
            <div class="booking-completed-summary">
                <div class="completed-summary-row">
                    <span>Service</span>
                    <span>$${parseFloat(booking.service_price).toFixed(2)}</span>
                </div>
                ${parseFloat(booking.tip_amount) > 0 ? `
                <div class="completed-summary-row tip-row">
                    <span>Tip</span>
                    <span>$${parseFloat(booking.tip_amount).toFixed(2)}</span>
                </div>` : ''}
                <div class="completed-summary-row total-row">
                    <span>Total</span>
                    <span>$${(parseFloat(booking.service_price) + parseFloat(booking.tip_amount || 0)).toFixed(2)}</span>
                </div>
            </div>` : ''}
            ${booking.internal_notes ? `
            <div class="booking-notes-section">
                <h4>Session Notes</h4>
                <p style="font-size: 0.9rem; color: var(--charcoal); line-height: 1.5;">${escapeHtml(booking.internal_notes)}</p>
            </div>` : ''}
            `}
        </div>
    `;

    document.getElementById('bookingDetailModal').classList.add('active');
}

function closeBookingDetail() {
    document.getElementById('bookingDetailModal').classList.remove('active');
}

function setTipPreset(servicePrice, percent) {
    const tip = (servicePrice * percent / 100).toFixed(2);
    document.getElementById('bookingTip').value = tip;
    // Highlight the active preset
    document.querySelectorAll('.tip-preset-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
}

async function cancelBooking(bookingId) {
    if (!confirm('Are you sure you want to cancel this appointment?')) return;

    try {
        await api(`/bookings/${bookingId}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'cancelled' })
        });
        closeBookingDetail();
        loadBookings();
    } catch (err) {
        console.error('Failed to cancel booking:', err);
        alert('Failed to cancel booking. Please try again.');
    }
}

async function completeBooking(bookingId) {
    const notesEl = document.getElementById('bookingNotes');
    const notes = notesEl ? notesEl.value.trim() : '';
    const tipEl = document.getElementById('bookingTip');
    const tipAmount = tipEl ? parseFloat(tipEl.value) || 0 : 0;
    const booking = bookingsCache.find(b => b.id === bookingId);

    try {
        // Update booking status to completed (with notes and tip)
        const updateBody = { status: 'completed' };
        if (notes) updateBody.internal_notes = notes;
        if (tipAmount > 0) updateBody.tip_amount = tipAmount;
        await api(`/bookings/${bookingId}`, {
            method: 'PATCH',
            body: JSON.stringify(updateBody)
        });

        // If notes were entered, append to client record
        if (notes && booking && booking.client_id) {
            try {
                const client = await api(`/admin/clients/${booking.client_id}`);
                const dateStr = new Date(booking.start_datetime).toLocaleDateString('en-US', { timeZone: BUSINESS_TZ });
                const noteEntry = `[${dateStr} – ${booking.service_name}] ${notes}`;
                const updatedNotes = client.notes ? `${client.notes}\n${noteEntry}` : noteEntry;
                await api(`/admin/clients/${booking.client_id}`, {
                    method: 'PUT',
                    body: JSON.stringify({ notes: updatedNotes })
                });
            } catch (clientErr) {
                console.error('Failed to update client notes:', clientErr);
            }
        }

        closeBookingDetail();
        loadBookings();
    } catch (err) {
        console.error('Failed to complete booking:', err);
        alert('Failed to complete booking. Please try again.');
    }
}

/**
 * Availability
 */
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

async function loadAvailability() {
    if (!currentUser.stylist_id) return;

    try {
        // Load schedule
        const schedule = await api(`/admin/availability/${currentUser.stylist_id}`);

        const scheduleEl = document.getElementById('weeklySchedule');
        scheduleEl.innerHTML = dayNames.map((day, index) => {
            const slot = schedule.find(s => s.day_of_week === index);
            return `
                <div class="schedule-day" data-day="${index}">
                    <input type="checkbox" class="schedule-day-toggle" ${slot ? 'checked' : ''}>
                    <span class="schedule-day-name">${day}</span>
                    <div class="schedule-times">
                        <input type="time" class="schedule-start" value="${escapeHtml(slot?.start_time?.substring(0, 5) || '09:00')}">
                        <span>to</span>
                        <input type="time" class="schedule-end" value="${escapeHtml(slot?.end_time?.substring(0, 5) || '17:00')}">
                    </div>
                </div>
            `;
        }).join('');

        // Load time off
        const timeOff = await api(`/admin/time-off/${currentUser.stylist_id}`);

        const timeOffEl = document.getElementById('timeOffList');
        if (timeOff.length === 0) {
            timeOffEl.innerHTML = '<p class="empty-state">No scheduled time off</p>';
        } else {
            timeOffEl.innerHTML = timeOff.map(to => {
                const start = new Date(to.start_datetime);
                const end = new Date(to.end_datetime);
                return `
                    <div class="timeoff-item" data-id="${to.id}">
                        <div>
                            <div class="timeoff-dates">
                                ${start.toLocaleDateString('en-US', { timeZone: BUSINESS_TZ })} ${start.toLocaleTimeString('en-US', { timeZone: BUSINESS_TZ, hour: 'numeric', minute: '2-digit' })}
                                - ${end.toLocaleDateString('en-US', { timeZone: BUSINESS_TZ })} ${end.toLocaleTimeString('en-US', { timeZone: BUSINESS_TZ, hour: 'numeric', minute: '2-digit' })}
                            </div>
                            ${to.reason ? `<div class="timeoff-reason">${escapeHtml(to.reason)}</div>` : ''}
                        </div>
                        <button class="timeoff-delete" onclick="deleteTimeOff('${to.id}')">&times;</button>
                    </div>
                `;
            }).join('');
        }

    } catch (err) {
        console.error('Failed to load availability:', err);
    }
}

async function saveSchedule() {
    const schedule = [];
    document.querySelectorAll('.schedule-day').forEach(dayEl => {
        const isActive = dayEl.querySelector('.schedule-day-toggle').checked;
        if (isActive) {
            schedule.push({
                day_of_week: parseInt(dayEl.dataset.day),
                start_time: dayEl.querySelector('.schedule-start').value,
                end_time: dayEl.querySelector('.schedule-end').value
            });
        }
    });

    try {
        await api(`/admin/availability/${currentUser.stylist_id}`, {
            method: 'PUT',
            body: JSON.stringify({ schedule })
        });
        alert('Schedule saved!');
    } catch (err) {
        alert('Failed to save schedule: ' + err.message);
    }
}

function showTimeOffModal() {
    document.getElementById('modalOverlay').classList.remove('hidden');
    document.getElementById('timeOffModal').classList.remove('hidden');
}

async function handleAddTimeOff(e) {
    e.preventDefault();
    const form = e.target;
    const data = {
        start_datetime: form.start_datetime.value,
        end_datetime: form.end_datetime.value,
        reason: form.reason.value
    };

    try {
        await api(`/admin/time-off/${currentUser.stylist_id}`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
        closeModals();
        form.reset();
        loadAvailability();
    } catch (err) {
        alert('Failed to add time off: ' + err.message);
    }
}

async function deleteTimeOff(id) {
    if (!confirm('Delete this time off?')) return;

    try {
        await api(`/admin/time-off/${id}`, { method: 'DELETE' });
        loadAvailability();
    } catch (err) {
        alert('Failed to delete: ' + err.message);
    }
}

/**
 * Settings (Owner only)
 */
async function loadSettings() {
    try {
        const settings = await api('/admin/settings');

        document.getElementById('settingBusinessName').value = settings.business_name || '';
        document.getElementById('settingBusinessPhone').value = settings.business_phone || '';
        document.getElementById('settingBusinessEmail').value = settings.business_email || '';
        document.getElementById('settingBusinessAddress').value = settings.business_address || '';

        document.getElementById('settingBufferMinutes').value = settings.booking_buffer_minutes || 15;
        document.getElementById('settingMinAdvance').value = settings.min_advance_booking_hours || 2;
        document.getElementById('settingMaxAdvance').value = settings.max_advance_booking_days || 60;
        document.getElementById('settingCancelHours').value = settings.cancellation_policy_hours || 48;

    } catch (err) {
        console.error('Failed to load settings:', err);
    }
}

async function saveBusinessSettings(e) {
    e.preventDefault();
    const form = e.target;

    try {
        await api('/admin/settings', {
            method: 'PATCH',
            body: JSON.stringify({
                business_name: form.business_name.value,
                business_phone: form.business_phone.value,
                business_email: form.business_email.value,
                business_address: form.business_address.value
            })
        });
        alert('Settings saved!');
    } catch (err) {
        alert('Failed to save: ' + err.message);
    }
}

async function saveBookingSettings(e) {
    e.preventDefault();
    const form = e.target;

    try {
        await api('/admin/settings', {
            method: 'PATCH',
            body: JSON.stringify({
                booking_buffer_minutes: form.booking_buffer_minutes.value,
                min_advance_booking_hours: form.min_advance_booking_hours.value,
                max_advance_booking_days: form.max_advance_booking_days.value,
                cancellation_policy_hours: form.cancellation_policy_hours.value
            })
        });
        alert('Settings saved!');
    } catch (err) {
        alert('Failed to save: ' + err.message);
    }
}

/**
 * Modals
 */
function closeModals() {
    document.getElementById('modalOverlay')?.classList.add('hidden');
    document.querySelectorAll('.modal').forEach(m => {
        m.classList.add('hidden');
        m.classList.remove('active');
    });
}

/**
 * CLIENTS SECTION
 */
let selectedClientId = null;

// Client data loaded from API
let clientsData = [];
let clientPreferredServiceIds = [];

async function loadClients() {
    showSectionLoading('clientsList');
    try {
        const data = await api('/admin/clients');
        clientsData = data;
        renderClientsList();
        updateClientCount();
    } catch (err) {
        console.error('Failed to load clients:', err);
    }
}

function renderClientsList() {
    const list = document.getElementById('clientsList');
    if (!list) return;

    list.innerHTML = clientsData.map(client => {
        const initials = (client.first_name?.[0] || '') + (client.last_name?.[0] || '');
        const name = `${client.first_name} ${client.last_name || ''}`.trim();
        const visits = parseInt(client.visit_count) || 0;
        const lastVisit = client.last_visit
            ? `Last visit: ${formatDate(client.last_visit, 'MMM d, yyyy')}`
            : `Added: ${formatDate(client.created_at, 'MMM d, yyyy')}`;

        return `
            <div class="client-card" data-client-id="${client.id}">
                <div class="client-avatar">${escapeHtml(initials)}</div>
                <div class="client-info">
                    <span class="client-name">${escapeHtml(name)}</span>
                    <span class="client-last-visit">${lastVisit}</span>
                </div>
                <span class="client-visits">${visits} visits</span>
            </div>
        `;
    }).join('');
}

function setupClientsSection() {
    // Client search
    const searchInput = document.getElementById('clientSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterClients(e.target.value);
        });
    }

    // Client sort
    const sortSelect = document.getElementById('clientSort');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            sortClients(e.target.value);
        });
    }

    // Add client button
    const addClientBtn = document.getElementById('addClient');
    if (addClientBtn) {
        addClientBtn.addEventListener('click', showAddClientModal);
    }

    // Client card clicks
    document.getElementById('clientsList')?.addEventListener('click', (e) => {
        const card = e.target.closest('.client-card');
        if (card) {
            selectClient(card.dataset.clientId);
        }
    });

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            switchTab(tab);
        });
    });

    // Add note button
    document.getElementById('addNoteBtn')?.addEventListener('click', addClientNote);

    // Save preferences
    document.getElementById('savePreferences')?.addEventListener('click', saveClientPreferences);

    // Edit client button
    document.getElementById('editClientBtn')?.addEventListener('click', () => {
        if (selectedClientId) {
            showEditClientModal(selectedClientId);
        }
    });

    // Client form
    document.getElementById('clientForm')?.addEventListener('submit', handleClientFormSubmit);

    // Modal close buttons
    document.getElementById('closeClientModal')?.addEventListener('click', closeClientModal);
    document.getElementById('cancelClientBtn')?.addEventListener('click', closeClientModal);

    // Modal overlay click
    document.querySelector('#clientModal .modal-overlay')?.addEventListener('click', closeClientModal);

    // SMS button
    document.getElementById('smsBtn')?.addEventListener('click', openSmsModal);

    // SMS modal close
    document.getElementById('closeSmsModal')?.addEventListener('click', closeSmsModal);
    document.getElementById('cancelSmsBtn')?.addEventListener('click', closeSmsModal);
    document.querySelector('#smsModal .modal-overlay')?.addEventListener('click', closeSmsModal);

    // SMS template chips
    document.querySelectorAll('.sms-chip').forEach(chip => {
        chip.addEventListener('click', () => selectSmsTemplate(chip.dataset.template));
    });

    // SMS character counter
    document.getElementById('smsMessage')?.addEventListener('input', updateSmsCharCount);

    // SMS send
    document.getElementById('sendSmsBtn')?.addEventListener('click', handleSendSms);

    // Load clients from API
    loadClients();
}

function filterClients(query) {
    const cards = document.querySelectorAll('.client-card');
    const lowerQuery = query.toLowerCase();

    cards.forEach(card => {
        const name = card.querySelector('.client-name').textContent.toLowerCase();
        if (name.includes(lowerQuery)) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
}

function sortClients(sortBy) {
    const list = document.getElementById('clientsList');
    const cards = Array.from(list.querySelectorAll('.client-card'));

    cards.sort((a, b) => {
        if (sortBy === 'name') {
            return a.querySelector('.client-name').textContent.localeCompare(
                b.querySelector('.client-name').textContent
            );
        } else if (sortBy === 'visits') {
            const aVisits = parseInt(a.querySelector('.client-visits').textContent);
            const bVisits = parseInt(b.querySelector('.client-visits').textContent);
            return bVisits - aVisits;
        }
        return 0;
    });

    cards.forEach(card => list.appendChild(card));
}

async function selectClient(clientId) {
    selectedClientId = clientId;

    // Update active state on cards
    document.querySelectorAll('.client-card').forEach(card => {
        card.classList.toggle('active', card.dataset.clientId === String(clientId));
    });

    // Show profile panel
    const placeholder = document.querySelector('.detail-placeholder');
    const profile = document.getElementById('clientProfile');

    if (placeholder) placeholder.style.display = 'none';
    if (profile) profile.classList.remove('hidden');

    // Fetch full client details with history
    try {
        const client = await api(`/admin/clients/${clientId}`);
        populateClientProfile(client);
    } catch (err) {
        console.error('Failed to load client details:', err);
        // Fall back to list data
        const client = clientsData.find(c => String(c.id) === String(clientId));
        if (client) populateClientProfile(client);
    }
}

function populateClientProfile(client) {
    const initials = (client.first_name?.[0] || '') + (client.last_name?.[0] || '');

    document.getElementById('profileAvatar').textContent = initials;
    document.getElementById('profileName').textContent = `${client.first_name} ${client.last_name || ''}`.trim();
    document.querySelector('.profile-since').textContent = `Client since ${formatDate(client.created_at, 'MMMM yyyy')}`;
    document.getElementById('profilePhone').textContent = client.phone || '';
    document.getElementById('profileEmail').textContent = client.email || '';

    // Show/hide SMS button based on whether phone exists
    const smsBtn = document.getElementById('smsBtn');
    if (smsBtn) {
        smsBtn.classList.toggle('visible', !!client.phone);
    }

    const visits = parseInt(client.visit_count) || 0;
    const totalSpent = parseFloat(client.total_spent) || 0;
    document.getElementById('profileVisits').textContent = visits;
    document.getElementById('profileSpent').textContent = `$${totalSpent.toLocaleString()}`;
    document.getElementById('profileNoShows').textContent = '0';

    // Populate notes from client.notes text field
    let notes = [];
    if (client.notes && client.notes.trim()) {
        notes = client.notes.split('\n\n').filter(n => n.trim()).map((note, i) => {
            const match = note.match(/^\[(\d{4}-\d{2}-\d{2})\s*-\s*([^\]]+)\]\s*(.*)/s);
            return match
                ? { id: i, date: match[1], author: match[2], content: match[3] }
                : { id: i, date: client.created_at, author: 'Staff', content: note };
        });
    }
    populateNotes(notes);

    // Populate history from API data
    const history = (client.history || []).map(h => ({
        date: h.start_datetime,
        service: h.service_name || 'Service',
        stylist: h.stylist_name || '',
        price: parseFloat(h.service_price) || 0,
        tip: parseFloat(h.tip_amount) || 0,
        status: h.status || 'completed'
    }));
    populateHistory(history);

    // Populate preferences with real data
    const preferredServiceNames = (client.preferred_services || []).map(s => s.name);
    clientPreferredServiceIds = (client.preferred_services || []).map(s => s.id);

    populatePreferences({
        services: preferredServiceNames,
        stylist: client.preferred_stylist_id || '',
        emailReminders: client.email_reminders !== false,
        textReminders: client.sms_reminders !== false,
        marketing: client.marketing_consent || false,
        allergies: client.allergies || '',
        specialRequests: client.special_requests || ''
    });

    // Reset to notes tab
    switchTab('notes');
}

function populateNotes(notes) {
    const notesList = document.getElementById('notesList');
    notesList.innerHTML = notes.map(note => `
        <div class="note-item" data-note-id="${note.id}">
            <div class="note-header">
                <span class="note-author">${escapeHtml(note.author)}</span>
                <span class="note-date">${formatDate(note.date, 'MMM d, yyyy')}</span>
            </div>
            <p class="note-content">${escapeHtml(note.content)}</p>
        </div>
    `).join('');
}

function populateHistory(history) {
    const historyList = document.getElementById('historyList');
    historyList.innerHTML = history.map(item => {
        const date = new Date(item.date);
        const hasTip = item.status === 'completed' && item.tip > 0;
        return `
            <div class="history-item">
                <div class="history-date">
                    <span class="date-day">${date.getDate().toString().padStart(2, '0')}</span>
                    <span class="date-month">${date.toLocaleString('default', { month: 'short' })}</span>
                </div>
                <div class="history-details">
                    <span class="history-service">${escapeHtml(item.service)}</span>
                    <span class="history-stylist">with ${escapeHtml(item.stylist)}</span>
                </div>
                <div class="history-pricing">
                    <span class="history-price">$${item.price.toFixed(2)}</span>
                    ${hasTip ? `<span class="history-tip">+ $${item.tip.toFixed(2)} tip</span>` : ''}
                </div>
                <span class="history-status ${item.status}">${escapeHtml(item.status.charAt(0).toUpperCase() + item.status.slice(1))}</span>
            </div>
        `;
    }).join('');
}

async function populatePreferences(prefs) {
    // Services - render removable tags
    const servicesContainer = document.getElementById('prefServices');
    servicesContainer.innerHTML = prefs.services.map((name, i) =>
        `<span class="pref-tag">${escapeHtml(name)}<button class="pref-tag-remove" onclick="removePreferredService(${i})">&times;</button></span>`
    ).join('') + '<button class="add-pref" onclick="openClientServicesModal()">+</button>';

    // Stylist - populate dropdown with real stylist data
    const stylistSelect = document.getElementById('prefStylist');
    const currentVal = prefs.stylist || '';
    try {
        let stylists = teamMembersData;
        if (!stylists || stylists.length === 0) {
            stylists = await api('/admin/stylists');
        }
        stylistSelect.innerHTML = '<option value="">No preference</option>' +
            stylists.map(m =>
                `<option value="${m.id}" ${m.id === currentVal ? 'selected' : ''}>${escapeHtml(m.name)}</option>`
            ).join('');
    } catch (e) {
        console.warn('Could not load stylists for dropdown');
    }
    stylistSelect.value = currentVal;

    // Communication
    const checkboxes = document.querySelectorAll('#preferencesTab .checkbox-label input');
    if (checkboxes[0]) checkboxes[0].checked = prefs.emailReminders;
    if (checkboxes[1]) checkboxes[1].checked = prefs.textReminders;
    if (checkboxes[2]) checkboxes[2].checked = prefs.marketing;

    // Allergies & Requests
    document.getElementById('prefAllergies').value = prefs.allergies || '';
    document.getElementById('prefRequests').value = prefs.specialRequests || '';
}

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}Tab`)?.classList.add('active');
}

async function addClientNote() {
    const textarea = document.getElementById('newNote');
    const content = textarea.value.trim();

    if (!content || !selectedClientId) return;

    const client = clientsData.find(c => String(c.id) === String(selectedClientId));
    if (!client) return;

    // Append to existing notes
    const existingNotes = client.notes || '';
    const timestamp = new Date().toISOString().split('T')[0];
    const author = currentUser?.name || 'Emily';
    const updatedNotes = existingNotes
        ? `[${timestamp} - ${author}] ${content}\n\n${existingNotes}`
        : `[${timestamp} - ${author}] ${content}`;

    try {
        await api(`/admin/clients/${selectedClientId}`, {
            method: 'PUT',
            body: JSON.stringify({ notes: updatedNotes })
        });
        client.notes = updatedNotes;

        const noteItems = updatedNotes.split('\n\n').filter(n => n.trim()).map((note, i) => {
            const match = note.match(/^\[(\d{4}-\d{2}-\d{2})\s*-\s*([^\]]+)\]\s*(.*)/s);
            return match
                ? { id: i, date: match[1], author: match[2], content: match[3] }
                : { id: i, date: '', author: 'Staff', content: note };
        });
        populateNotes(noteItems);
        textarea.value = '';
    } catch (err) {
        alert('Failed to save note: ' + err.message);
    }
}

async function saveClientPreferences() {
    if (!selectedClientId) return;

    const checkboxes = document.querySelectorAll('#preferencesTab .checkbox-label input');

    const prefData = {
        preferred_stylist_id: document.getElementById('prefStylist').value || null,
        email_reminders: checkboxes[0]?.checked || false,
        sms_reminders: checkboxes[1]?.checked || false,
        marketing_consent: checkboxes[2]?.checked || false,
        allergies: document.getElementById('prefAllergies').value,
        special_requests: document.getElementById('prefRequests').value
    };

    try {
        await api(`/admin/clients/${selectedClientId}`, {
            method: 'PUT',
            body: JSON.stringify(prefData)
        });
        alert('Preferences saved!');
    } catch (err) {
        console.error('Failed to save preferences:', err);
        alert('Failed to save preferences: ' + err.message);
    }
}

// ---- Client Preferred Services Modal ----

function setupClientServicesModal() {
    document.getElementById('closeClientServicesModal')?.addEventListener('click', closeClientServicesModal);
    document.getElementById('cancelClientServicesBtn')?.addEventListener('click', closeClientServicesModal);
    document.querySelector('#clientServicesModal .modal-overlay')?.addEventListener('click', closeClientServicesModal);
    document.getElementById('saveClientServicesBtn')?.addEventListener('click', saveClientPreferredServices);
}

async function openClientServicesModal() {
    if (!selectedClientId) return;

    document.getElementById('clientServicesModalTitle').textContent = 'Select Preferred Services';
    document.getElementById('clientServicesModal').classList.add('active');

    const checklist = document.getElementById('clientServicesChecklist');
    checklist.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>Loading services...</span></div>';

    try {
        const services = await api(`/admin/client-preferred-services/${selectedClientId}`);
        renderClientServicesChecklist(services);
    } catch (err) {
        console.error('Failed to load services:', err);
        checklist.innerHTML = '<div class="error-state"><p>Failed to load services.</p></div>';
    }
}

function renderClientServicesChecklist(services) {
    const checklist = document.getElementById('clientServicesChecklist');

    const categories = {};
    services.forEach(svc => {
        if (!categories[svc.category_id]) {
            categories[svc.category_id] = {
                name: svc.category_name,
                order: svc.category_order,
                services: []
            };
        }
        categories[svc.category_id].services.push(svc);
    });

    const sortedCategories = Object.values(categories).sort((a, b) => a.order - b.order);

    let html = '';
    sortedCategories.forEach(category => {
        html += `<div class="service-category-section"><h4>${escapeHtml(category.name)}</h4>`;
        category.services.forEach(svc => {
            html += `
                <div class="service-check-row ${svc.is_preferred ? '' : 'unchecked'}" data-service-id="${svc.id}">
                    <div class="service-checkbox">
                        <input type="checkbox" id="cpref_${svc.id}" ${svc.is_preferred ? 'checked' : ''}
                               onchange="toggleClientServiceRow(this, '${svc.id}')">
                    </div>
                    <label for="cpref_${svc.id}" class="service-checkbox">${escapeHtml(svc.name)}</label>
                    <div class="service-default-info">
                        <span class="service-default-price">$${parseFloat(svc.price).toFixed(0)}</span>
                        <span class="service-default-duration">${svc.duration_minutes} min</span>
                    </div>
                </div>`;
        });
        html += '</div>';
    });

    checklist.innerHTML = html;
}

function toggleClientServiceRow(checkbox, serviceId) {
    const row = document.querySelector(`#clientServicesChecklist .service-check-row[data-service-id="${serviceId}"]`);
    if (checkbox.checked) {
        row.classList.remove('unchecked');
    } else {
        row.classList.add('unchecked');
    }
}

async function saveClientPreferredServices() {
    if (!selectedClientId) return;

    const serviceIds = [];
    document.querySelectorAll('#clientServicesChecklist .service-check-row').forEach(row => {
        const checkbox = row.querySelector('input[type="checkbox"]');
        if (checkbox.checked) {
            serviceIds.push(row.dataset.serviceId);
        }
    });

    try {
        await api(`/admin/client-preferred-services/${selectedClientId}`, {
            method: 'PUT',
            body: JSON.stringify({ service_ids: serviceIds })
        });

        const client = await api(`/admin/clients/${selectedClientId}`);
        const preferredServiceNames = (client.preferred_services || []).map(s => s.name);
        clientPreferredServiceIds = (client.preferred_services || []).map(s => s.id);

        const servicesContainer = document.getElementById('prefServices');
        servicesContainer.innerHTML = preferredServiceNames.map((name, i) =>
            `<span class="pref-tag">${escapeHtml(name)}<button class="pref-tag-remove" onclick="removePreferredService(${i})">&times;</button></span>`
        ).join('') + '<button class="add-pref" onclick="openClientServicesModal()">+</button>';

        closeClientServicesModal();
    } catch (err) {
        console.error('Failed to save preferred services:', err);
        alert('Failed to save preferred services: ' + err.message);
    }
}

async function removePreferredService(index) {
    clientPreferredServiceIds.splice(index, 1);

    try {
        await api(`/admin/client-preferred-services/${selectedClientId}`, {
            method: 'PUT',
            body: JSON.stringify({ service_ids: clientPreferredServiceIds })
        });

        const client = await api(`/admin/clients/${selectedClientId}`);
        const preferredServiceNames = (client.preferred_services || []).map(s => s.name);
        clientPreferredServiceIds = (client.preferred_services || []).map(s => s.id);

        const servicesContainer = document.getElementById('prefServices');
        servicesContainer.innerHTML = preferredServiceNames.map((name, i) =>
            `<span class="pref-tag">${escapeHtml(name)}<button class="pref-tag-remove" onclick="removePreferredService(${i})">&times;</button></span>`
        ).join('') + '<button class="add-pref" onclick="openClientServicesModal()">+</button>';
    } catch (err) {
        console.error('Failed to remove preferred service:', err);
        alert('Failed to remove service: ' + err.message);
    }
}

function closeClientServicesModal() {
    document.getElementById('clientServicesModal').classList.remove('active');
}

function showAddClientModal() {
    document.getElementById('clientModalTitle').textContent = 'Add New Client';
    document.getElementById('clientForm').reset();
    document.getElementById('clientForm').dataset.mode = 'add';
    document.getElementById('clientModal').classList.add('active');
}

function showEditClientModal(clientId) {
    const client = clientsData.find(c => String(c.id) === String(clientId));
    if (!client) return;

    document.getElementById('clientModalTitle').textContent = 'Edit Client';
    document.getElementById('clientFirstName').value = client.first_name || '';
    document.getElementById('clientLastName').value = client.last_name || '';
    document.getElementById('clientEmail').value = client.email || '';
    document.getElementById('clientPhone').value = client.phone || '';
    document.getElementById('clientBirthday').value = client.birthday ? client.birthday.split('T')[0] : '';
    document.getElementById('clientNotes').value = client.notes || '';

    document.getElementById('clientForm').dataset.mode = 'edit';
    document.getElementById('clientForm').dataset.clientId = clientId;
    document.getElementById('clientModal').classList.add('active');
}

function closeClientModal() {
    document.getElementById('clientModal').classList.remove('active');
}

async function handleClientFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const mode = form.dataset.mode;

    const initialNote = document.getElementById('clientNotes').value.trim();

    const birthdayVal = document.getElementById('clientBirthday').value;
    const clientData = {
        first_name: document.getElementById('clientFirstName').value,
        last_name: document.getElementById('clientLastName').value,
        email: document.getElementById('clientEmail').value,
        phone: document.getElementById('clientPhone').value,
        birthday: birthdayVal || null,
        notes: initialNote || ''
    };

    try {
        if (mode === 'add') {
            const newClient = await api('/admin/clients', {
                method: 'POST',
                body: JSON.stringify(clientData)
            });
            await loadClients();
            selectClient(newClient.id);
        } else if (mode === 'edit') {
            const clientId = form.dataset.clientId;
            await api(`/admin/clients/${clientId}`, {
                method: 'PUT',
                body: JSON.stringify(clientData)
            });
            await loadClients();
            selectClient(clientId);
        }

        closeClientModal();
    } catch (err) {
        console.error('Failed to save client:', err);
        alert('Failed to save client: ' + err.message);
    }
}

function updateClientCount() {
    const count = clientsData.length;
    const countEl = document.getElementById('clientCount');
    if (countEl) {
        countEl.textContent = `${count} client${count !== 1 ? 's' : ''}`;
    }
}

/**
 * SMS Messaging
 */
function openSmsModal() {
    const name = document.getElementById('profileName').textContent;
    const phone = document.getElementById('profilePhone').textContent;

    if (!phone) return;

    document.getElementById('smsRecipientName').textContent = name;
    document.getElementById('smsRecipientPhone').textContent = phone;
    document.getElementById('smsMessage').value = '';
    updateSmsCharCount();

    // Reset template chip active states
    document.querySelectorAll('.sms-chip').forEach(c => c.classList.remove('active'));

    // Reset status
    const status = document.getElementById('smsStatus');
    status.classList.add('hidden');
    status.classList.remove('success', 'error');

    // Reset send button
    const sendBtn = document.getElementById('sendSmsBtn');
    sendBtn.disabled = false;
    sendBtn.querySelector('.sms-send-text').classList.remove('hidden');
    sendBtn.querySelector('.sms-send-loading').classList.add('hidden');

    document.getElementById('smsModal').classList.add('active');
    document.getElementById('smsMessage').focus();
}

function closeSmsModal() {
    document.getElementById('smsModal').classList.remove('active');
}

function selectSmsTemplate(templateKey) {
    const template = SMS_TEMPLATES[templateKey];
    if (!template) return;

    const fullName = document.getElementById('smsRecipientName').textContent;
    const firstName = fullName.split(' ')[0];
    const message = template.replace(/{name}/g, firstName);

    document.getElementById('smsMessage').value = message;
    updateSmsCharCount();

    // Toggle active state on chips
    document.querySelectorAll('.sms-chip').forEach(c => {
        c.classList.toggle('active', c.dataset.template === templateKey);
    });
}

function updateSmsCharCount() {
    const textarea = document.getElementById('smsMessage');
    const counter = document.getElementById('smsCharCount');
    const counterWrap = counter.parentElement;
    const len = textarea.value.length;

    counter.textContent = len;
    counterWrap.classList.remove('warning', 'danger');

    if (len > 1500) {
        counterWrap.classList.add('danger');
    } else if (len > 1200) {
        counterWrap.classList.add('warning');
    }
}

async function handleSendSms() {
    const phone = document.getElementById('smsRecipientPhone').textContent;
    const message = document.getElementById('smsMessage').value.trim();

    if (!message) {
        showSmsStatus('Please enter a message', 'error');
        return;
    }

    if (!phone) {
        showSmsStatus('No phone number available', 'error');
        return;
    }

    const sendBtn = document.getElementById('sendSmsBtn');
    sendBtn.disabled = true;
    sendBtn.querySelector('.sms-send-text').classList.add('hidden');
    sendBtn.querySelector('.sms-send-loading').classList.remove('hidden');

    try {
        await api('/admin/send-sms', {
            method: 'POST',
            body: JSON.stringify({ to: phone, message })
        });

        showSmsStatus('Message sent successfully!', 'success');

        setTimeout(() => {
            closeSmsModal();
        }, 1500);
    } catch (err) {
        console.error('Failed to send SMS:', err);
        showSmsStatus('Failed to send: ' + err.message, 'error');

        sendBtn.disabled = false;
        sendBtn.querySelector('.sms-send-text').classList.remove('hidden');
        sendBtn.querySelector('.sms-send-loading').classList.add('hidden');
    }
}

function showSmsStatus(message, type) {
    const status = document.getElementById('smsStatus');
    status.textContent = message;
    status.className = 'sms-status ' + type;
}

function formatDate(dateStr, format) {
    const date = new Date(dateStr);
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];
    const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                         'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    if (format === 'MMMM yyyy') {
        return `${months[date.getMonth()]} ${date.getFullYear()}`;
    } else if (format === 'MMM d, yyyy') {
        return `${shortMonths[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    }
    return dateStr;
}

/**
 * TEAM SECTION
 */
let selectedTeamMemberId = null;
let teamMemberCalendarMonth = new Date();
let memberCalendarView = 'day';
let memberCalendarDate = new Date();
let memberCalendarBookings = [];

// Team data - will be loaded from API
let teamMembersData = [];

function setupTeamSection() {
    // Team card clicks
    document.getElementById('teamList')?.addEventListener('click', (e) => {
        const card = e.target.closest('.team-card');
        if (card) {
            const memberId = card.dataset.memberId;
            selectTeamMember(memberId);
        }
    });

    // Team tabs
    document.querySelectorAll('.team-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            switchTeamTab(tab);
        });
    });

    // Add team member button
    document.getElementById('addStylist')?.addEventListener('click', showAddTeamMemberModal);

    // Edit team member button
    const editBtn = document.getElementById('editMemberBtn');
    if (editBtn) {
        editBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Edit button clicked, selectedTeamMemberId:', selectedTeamMemberId);
            if (selectedTeamMemberId) {
                showEditTeamMemberModal(selectedTeamMemberId);
            } else {
                console.warn('No team member selected');
            }
        });
    } else {
        console.warn('editMemberBtn not found');
    }

    // Team member form
    document.getElementById('teamMemberForm')?.addEventListener('submit', handleTeamMemberFormSubmit);

    // Modal close
    document.getElementById('closeTeamMemberModal')?.addEventListener('click', closeTeamMemberModal);
    document.getElementById('cancelTeamMemberBtn')?.addEventListener('click', closeTeamMemberModal);
    document.querySelector('#teamMemberModal .modal-overlay')?.addEventListener('click', closeTeamMemberModal);

    // Avatar upload
    document.getElementById('memberFormAvatarInput')?.addEventListener('change', handleAvatarUpload);
    document.getElementById('memberFormAvatarRemove')?.addEventListener('click', handleAvatarRemove);

    // Calendar view toggle
    document.querySelectorAll('.member-cal-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => toggleMemberCalView(btn.dataset.calView));
    });

    // Day view navigation
    document.getElementById('memberDayPrev')?.addEventListener('click', () => navigateMemberDay(-1));
    document.getElementById('memberDayNext')?.addEventListener('click', () => navigateMemberDay(1));
    document.getElementById('memberDayToday')?.addEventListener('click', () => {
        memberCalendarDate = new Date();
        renderMemberCalendar();
    });

    // Month view navigation
    document.getElementById('memberMonthPrev')?.addEventListener('click', () => navigateMemberMonth(-1));
    document.getElementById('memberMonthNext')?.addEventListener('click', () => navigateMemberMonth(1));

    // Toggle settings
    document.getElementById('acceptingClients')?.addEventListener('change', (e) => {
        const member = teamMembersData.find(m => m.id === selectedTeamMemberId);
        if (member) member.accepting_new_clients = e.target.checked;
    });

    document.getElementById('displayOnSite')?.addEventListener('change', (e) => {
        const member = teamMembersData.find(m => m.id === selectedTeamMemberId);
        if (member) member.display_on_website = e.target.checked;
    });

    // Save availability
    document.getElementById('saveMemberAvailability')?.addEventListener('click', saveMemberAvailability);
}

// Load team members from API
async function loadTeamMembers() {
    try {
        const stylists = await api('/admin/stylists');
        teamMembersData = stylists;

        renderTeamList(stylists);

        // Select first member if any
        if (stylists.length > 0) {
            selectTeamMember(stylists[0].id);
        }
    } catch (err) {
        console.error('Failed to load team members:', err);
    }
}

function renderTeamList(members) {
    const list = document.getElementById('teamList');
    if (!list) return;

    list.innerHTML = members.map(member => {
        const initials = member.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const colorCode = member.color_code || '#D4944A';

        return `
            <div class="team-card ${selectedTeamMemberId === member.id ? 'active' : ''}" data-member-id="${member.id}">
                <div class="team-avatar" style="background: linear-gradient(135deg, ${escapeHtml(colorCode)}, ${escapeHtml(lightenColor(colorCode, 20))});">
                    ${member.avatar_url ? `<img src="${escapeHtml(member.avatar_url)}" alt="${escapeHtml(member.name)}" onerror="this.style.display='none'">` : ''}
                    <span class="avatar-initials">${escapeHtml(initials)}</span>
                </div>
                <div class="team-info">
                    <span class="team-name">${escapeHtml(member.name)}</span>
                    <span class="team-title">${escapeHtml(member.title || 'Team Member')}</span>
                </div>
                <span class="team-status ${member.is_active ? 'active' : 'inactive'}">${member.is_active ? 'Active' : 'Inactive'}</span>
            </div>
        `;
    }).join('');
}

async function selectTeamMember(memberId) {
    selectedTeamMemberId = memberId;
    const member = teamMembersData.find(m => m.id === memberId);
    if (!member) return;

    // Update active state
    document.querySelectorAll('.team-card').forEach(card => {
        card.classList.toggle('active', card.dataset.memberId === memberId);
    });

    // Load services from API if not already loaded
    if (!member.services) {
        try {
            const services = await api(`/admin/stylist-services/${memberId}`);
            // Group assigned services by category
            const categories = {};
            services.filter(s => s.is_assigned).forEach(svc => {
                if (!categories[svc.category_id]) {
                    categories[svc.category_id] = {
                        category: svc.category_name,
                        order: svc.category_order,
                        items: []
                    };
                }
                categories[svc.category_id].items.push({
                    name: svc.name,
                    duration: svc.custom_duration || svc.duration_minutes,
                    price: svc.custom_price || svc.price
                });
            });
            member.services = Object.values(categories).sort((a, b) => a.order - b.order);
        } catch (err) {
            console.error('Failed to load services:', err);
            member.services = [];
        }
    }

    // Populate profile
    populateTeamMemberProfile(member);
}

function populateTeamMemberProfile(member) {
    // Header
    document.getElementById('memberName').textContent = member.name;
    document.getElementById('memberTitle').textContent = member.title || 'Team Member';

    // Profile photo
    const photoContainer = document.getElementById('memberPhoto');
    if (photoContainer) {
        const photoImg = photoContainer.querySelector('img');
        const photoInitials = photoContainer.querySelector('.photo-initials');
        const initials = member.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

        if (photoInitials) photoInitials.textContent = initials;

        if (member.avatar_url) {
            if (photoImg) {
                photoImg.src = member.avatar_url;
                photoImg.style.display = 'block';
                photoImg.onerror = () => {
                    photoImg.style.display = 'none';
                    if (photoInitials) photoInitials.style.display = 'flex';
                };
            }
            if (photoInitials) photoInitials.style.display = 'none';
        } else {
            if (photoImg) photoImg.style.display = 'none';
            if (photoInitials) photoInitials.style.display = 'flex';
        }
    }

    // Social links
    const igLink = document.getElementById('memberInstagram');
    const fbLink = document.getElementById('memberFacebook');
    if (igLink) {
        igLink.href = member.instagram_url || '#';
        igLink.style.display = member.instagram_url ? 'flex' : 'none';
    }
    if (fbLink) {
        fbLink.href = member.facebook_url || '#';
        fbLink.style.display = member.facebook_url ? 'flex' : 'none';
    }

    // Bio
    document.getElementById('memberBio').textContent = member.bio || 'No bio available.';

    // Specialties - parse from JSON if stored as array
    const specialtiesEl = document.getElementById('memberSpecialties');
    if (specialtiesEl) {
        const specialties = member.specialties || [];
        if (specialties.length > 0) {
            specialtiesEl.innerHTML = specialties.map(s =>
                `<span class="specialty-tag">${escapeHtml(s)}</span>`
            ).join('');
        } else {
            specialtiesEl.innerHTML = '<span class="no-data">No specialties listed</span>';
        }
    }

    // Certifications - parse from JSON if stored as array
    const certsEl = document.getElementById('memberCerts');
    if (certsEl) {
        const certifications = member.certifications || [];
        if (certifications.length > 0) {
            certsEl.innerHTML = certifications.map(c =>
                `<li>${escapeHtml(c)}</li>`
            ).join('');
        } else {
            certsEl.innerHTML = '<li class="no-data">No certifications listed</li>';
        }
    }

    // Stats
    const yearsExp = member.years_experience || 0;
    document.getElementById('memberYears').textContent = yearsExp > 0 ? yearsExp + '+' : '-';
    document.getElementById('memberClients').textContent = '-'; // Would need to calculate from bookings
    document.getElementById('memberRating').textContent = '-'; // Would need reviews system

    // Settings
    document.getElementById('acceptingClients').checked = member.accepting_new_clients !== false;
    document.getElementById('displayOnSite').checked = member.display_on_website !== false;

    // Services
    populateMemberServices(member.services || []);

    // Calendar — reset to day view of today when switching members
    memberCalendarView = 'day';
    memberCalendarDate = new Date();
    teamMemberCalendarMonth = new Date();
    document.querySelectorAll('.member-cal-toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.calView === 'day');
    });
    document.getElementById('memberDayView').style.display = '';
    document.getElementById('memberMonthView').style.display = 'none';
    renderMemberCalendar();

    // Availability - load from API if not cached
    if (!member.availability) {
        loadMemberAvailability(member.id);
    } else {
        populateMemberAvailability(member.availability);
    }

    // Time off - load from API if not cached
    if (!member.timeOff) {
        loadMemberTimeOff(member.id);
    } else {
        populateMemberTimeOff(member.timeOff);
    }

    // Appointments would come from bookings API
    populateMemberAppointments(member.appointments || []);
}

async function loadMemberAvailability(memberId) {
    try {
        const availability = await api(`/admin/availability/${memberId}`);
        const member = teamMembersData.find(m => m.id === memberId);
        if (member) {
            // Convert array to object by day_of_week
            const availObj = {};
            for (let i = 0; i < 7; i++) {
                const daySlot = availability.find(a => a.day_of_week === i);
                availObj[i] = daySlot ? { start: daySlot.start_time, end: daySlot.end_time } : null;
            }
            member.availability = availObj;
            populateMemberAvailability(availObj);
        }
    } catch (err) {
        console.error('Failed to load availability:', err);
        // Show empty availability
        populateMemberAvailability({});
    }
}

async function loadMemberTimeOff(memberId) {
    try {
        const timeOff = await api(`/admin/time-off/${memberId}`);
        const member = teamMembersData.find(m => m.id === memberId);
        if (member) {
            member.timeOff = timeOff.map(t => ({
                id: t.id,
                startDate: t.start_datetime.split('T')[0],
                endDate: t.end_datetime.split('T')[0],
                reason: t.reason
            }));
            populateMemberTimeOff(member.timeOff);
        }
    } catch (err) {
        console.error('Failed to load time off:', err);
        populateMemberTimeOff([]);
    }
}

function populateMemberServices(services) {
    const container = document.getElementById('memberServicesList');
    if (!container) return;

    container.innerHTML = services.map(category => `
        <div class="service-category-group">
            <h4>${escapeHtml(category.category)}</h4>
            ${category.items.map(item => `
                <div class="member-service-item">
                    <span class="service-name">${escapeHtml(item.name)}</span>
                    <span class="service-duration">${item.duration} min</span>
                    <span class="service-price">$${item.price}</span>
                </div>
            `).join('')}
        </div>
    `).join('');
}

function renderMemberCalendar() {
    if (memberCalendarView === 'day') {
        renderMemberDayView();
    } else {
        renderMemberMonthView();
    }
}

function formatLocalDate(d) {
    // Format date in business timezone
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    return parts; // Returns YYYY-MM-DD
}

function getETHour(d) {
    return parseInt(new Intl.DateTimeFormat('en-US', { timeZone: BUSINESS_TZ, hour: 'numeric', hour12: false }).format(d));
}

function formatETTime(d) {
    return d.toLocaleTimeString('en-US', { timeZone: BUSINESS_TZ, hour: 'numeric', minute: '2-digit', hour12: true });
}

async function loadMemberBookingsForDay(stylistId, date) {
    const dateStr = formatLocalDate(date);
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDateStr = formatLocalDate(nextDay);

    try {
        const data = await api(`/bookings?stylist_id=${stylistId}&date_from=${dateStr}&date_to=${nextDateStr}&limit=50`);
        memberCalendarBookings = (data.bookings || []).filter(b => b.status !== 'cancelled');
        return memberCalendarBookings;
    } catch (err) {
        console.error('Failed to load day bookings:', err);
        return [];
    }
}

async function renderMemberDayView() {
    if (!selectedTeamMemberId) return;

    const grid = document.getElementById('memberDayGrid');
    const dateDisplay = document.getElementById('memberDayDate');
    if (!grid || !dateDisplay) return;

    // Update date display
    dateDisplay.textContent = memberCalendarDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });

    // Show loading state
    grid.innerHTML = '<div class="day-empty-state">Loading...</div>';

    // Load bookings for this day
    const bookings = await loadMemberBookingsForDay(selectedTeamMemberId, memberCalendarDate);

    // Group bookings by hour (in ET)
    const bookingsByHour = {};
    bookings.forEach(b => {
        const startTime = new Date(b.start_datetime);
        const hour = getETHour(startTime);
        if (!bookingsByHour[hour]) bookingsByHour[hour] = [];
        bookingsByHour[hour].push(b);
    });

    // Generate time grid (8 AM to 10 PM)
    let html = '';
    for (let hour = 8; hour <= 22; hour++) {
        const timeLabel = hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
        const hourBookings = bookingsByHour[hour] || [];

        html += `<div class="time-row">
            <div class="time-label">${timeLabel}</div>
            <div class="time-slot-area">`;

        hourBookings.forEach(b => {
            const startTime = new Date(b.start_datetime);
            const apptTime = formatETTime(startTime);

            html += `
                <div class="day-appt-block">
                    <span class="day-appt-time">${apptTime}</span>
                    <div class="day-appt-info">
                        <span class="day-appt-service">${escapeHtml(b.service_name)}</span>
                        <span class="day-appt-client">${escapeHtml(b.client_name)}</span>
                    </div>
                    <span class="day-appt-status ${b.status}">${escapeHtml(b.status)}</span>
                </div>
            `;
        });

        html += `</div></div>`;
    }

    if (bookings.length === 0) {
        grid.innerHTML = `
            <div class="day-empty-state">
                <svg class="day-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <span>No appointments scheduled</span>
            </div>
        `;
    } else {
        grid.innerHTML = html;
    }
}

async function loadMemberBookingsForMonth(stylistId, year, month) {
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endDate = new Date(year, month + 1, 0);
    const endDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

    try {
        const data = await api(`/bookings?stylist_id=${stylistId}&date_from=${startDate}&date_to=${endDateStr}T23:59:59&limit=500`);
        const bookings = (data.bookings || []).filter(b => b.status !== 'cancelled');

        // Group by date and count (use local date, not UTC)
        const countsByDay = {};
        bookings.forEach(b => {
            const day = formatLocalDate(new Date(b.start_datetime));
            countsByDay[day] = (countsByDay[day] || 0) + 1;
        });
        return countsByDay;
    } catch (err) {
        console.error('Failed to load month bookings:', err);
        return {};
    }
}

async function renderMemberMonthView() {
    if (!selectedTeamMemberId) return;

    const grid = document.getElementById('memberHeatmapGrid');
    const monthDisplay = document.getElementById('memberMonthDisplay');
    if (!grid || !monthDisplay) return;

    const year = teamMemberCalendarMonth.getFullYear();
    const month = teamMemberCalendarMonth.getMonth();

    monthDisplay.textContent = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Show loading
    grid.innerHTML = '<div class="day-empty-state" style="grid-column: 1/-1;">Loading...</div>';

    // Load booking counts
    const countsByDay = await loadMemberBookingsForMonth(selectedTeamMemberId, year, month);

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    let html = '';

    // Previous month filler days
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = firstDay - 1; i >= 0; i--) {
        html += `<div class="heatmap-day other-month">${prevMonthDays - i}</div>`;
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const isToday = date.toDateString() === today.toDateString();
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const count = countsByDay[dateStr] || 0;

        let heatClass = '';
        if (count >= 5) heatClass = 'heat-3';
        else if (count >= 3) heatClass = 'heat-2';
        else if (count >= 1) heatClass = 'heat-1';

        const classes = ['heatmap-day', isToday ? 'today' : '', heatClass].filter(Boolean).join(' ');

        html += `<div class="${classes}" data-date="${dateStr}" onclick="heatmapDayClick('${dateStr}')">
            <span>${day}</span>
            ${count > 0 ? `<span class="heatmap-count">${count}</span>` : ''}
        </div>`;
    }

    // Next month filler days
    const totalCells = firstDay + daysInMonth;
    const rows = Math.ceil(totalCells / 7);
    const remainingCells = (rows * 7) - totalCells;
    for (let i = 1; i <= remainingCells; i++) {
        html += `<div class="heatmap-day other-month">${i}</div>`;
    }

    grid.innerHTML = html;
}

function toggleMemberCalView(view) {
    memberCalendarView = view;
    document.querySelectorAll('.member-cal-toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.calView === view);
    });
    document.getElementById('memberDayView').style.display = view === 'day' ? '' : 'none';
    document.getElementById('memberMonthView').style.display = view === 'month' ? '' : 'none';
    renderMemberCalendar();
}

function navigateMemberDay(direction) {
    memberCalendarDate.setDate(memberCalendarDate.getDate() + direction);
    renderMemberDayView();
}

function navigateMemberMonth(direction) {
    teamMemberCalendarMonth.setMonth(teamMemberCalendarMonth.getMonth() + direction);
    renderMemberMonthView();
}

window.heatmapDayClick = function(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    memberCalendarDate = new Date(year, month - 1, day);
    toggleMemberCalView('day');
};

function populateMemberAvailability(availability) {
    const container = document.getElementById('memberWeeklySchedule');
    if (!container) return;

    const days = container.querySelectorAll('.schedule-day');
    days.forEach((dayEl, index) => {
        const checkbox = dayEl.querySelector('input[type="checkbox"]');
        const hoursDiv = dayEl.querySelector('.day-hours');
        const avail = availability[index];

        if (checkbox) checkbox.checked = !!avail;

        if (avail) {
            hoursDiv.classList.remove('inactive');
            hoursDiv.innerHTML = `
                <input type="time" value="${escapeHtml(avail.start)}" class="time-input start">
                <span class="time-separator">to</span>
                <input type="time" value="${escapeHtml(avail.end)}" class="time-input end">
            `;
        } else {
            hoursDiv.classList.add('inactive');
            hoursDiv.innerHTML = '<span class="closed-label">Closed</span>';
        }
    });
}

function populateMemberTimeOff(timeOff) {
    const container = document.getElementById('memberTimeOffList');
    if (!container) return;

    if (timeOff.length === 0) {
        container.innerHTML = '<p class="no-items">No time off scheduled</p>';
        return;
    }

    container.innerHTML = timeOff.map(item => {
        const start = new Date(item.startDate);
        const end = new Date(item.endDate);
        const dateRange = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

        return `
            <div class="time-off-item" data-id="${item.id}">
                <div class="time-off-dates">
                    <span class="date-range">${dateRange}</span>
                    <span class="time-off-reason">${item.reason ? escapeHtml(item.reason) : ''}</span>
                </div>
                <button class="delete-time-off" onclick="deleteMemberTimeOff(${item.id})" title="Remove">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                </button>
            </div>
        `;
    }).join('');
}

function populateMemberAppointments(appointments) {
    const container = document.querySelector('.appointment-list');
    if (!container) return;

    if (appointments.length === 0) {
        container.innerHTML = '<p class="no-items">No upcoming appointments</p>';
        return;
    }

    container.innerHTML = appointments.map(appt => `
        <div class="appointment-item">
            <div class="appt-time">${formatTime(appt.time)}</div>
            <div class="appt-details">
                <span class="appt-client">${escapeHtml(appt.client)}</span>
                <span class="appt-service">${escapeHtml(appt.service)}</span>
            </div>
            <span class="appt-status ${appt.status}">${escapeHtml(appt.status.charAt(0).toUpperCase() + appt.status.slice(1))}</span>
        </div>
    `).join('');
}

function formatTime(time24) {
    const [hours, minutes] = time24.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
}

function switchTeamTab(tabName) {
    document.querySelectorAll('.team-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    document.querySelectorAll('.team-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}Tab`)?.classList.add('active');
}

function showAddTeamMemberModal() {
    document.getElementById('teamMemberModalTitle').textContent = 'Add Team Member';
    document.getElementById('teamMemberForm').reset();
    document.getElementById('teamMemberForm').dataset.mode = 'add';

    // Reset avatar
    const avatarImg = document.getElementById('memberFormAvatarImg');
    const avatarInitials = document.getElementById('memberFormAvatarInitials');
    const avatarRemoveBtn = document.getElementById('memberFormAvatarRemove');
    const avatarUrlInput = document.getElementById('memberFormAvatarUrl');

    avatarImg.src = '';
    avatarImg.style.display = 'none';
    avatarInitials.textContent = '?';
    avatarInitials.style.display = 'flex';
    avatarRemoveBtn.style.display = 'none';
    avatarUrlInput.value = '';

    document.getElementById('teamMemberModal').classList.add('active');
}

function showEditTeamMemberModal(memberId) {
    console.log('showEditTeamMemberModal called with:', memberId);
    const member = teamMembersData.find(m => m.id === memberId);
    if (!member) {
        console.error('Member not found:', memberId);
        return;
    }
    console.log('Member found:', member.name);

    document.getElementById('teamMemberModalTitle').textContent = 'Edit Team Member';
    document.getElementById('memberFormName').value = member.name;
    document.getElementById('memberFormTitle').value = member.title || '';
    document.getElementById('memberFormEmail').value = member.email || member.login_email || '';
    document.getElementById('memberFormPhone').value = member.phone || '';
    document.getElementById('memberFormBio').value = member.bio || '';
    document.getElementById('memberFormYears').value = member.years_experience || '';
    document.getElementById('memberFormColor').value = member.color_code || '#D4944A';
    document.getElementById('memberFormInstagram').value = member.instagram_url || '';
    document.getElementById('memberFormFacebook').value = member.facebook_url || '';

    // Specialties and Certifications
    const specialties = member.specialties ? (Array.isArray(member.specialties) ? member.specialties.join(', ') : member.specialties) : '';
    const specialtiesInput = document.getElementById('memberFormSpecialties');
    if (specialtiesInput) specialtiesInput.value = specialties;

    const certifications = member.certifications ? (Array.isArray(member.certifications) ? member.certifications.join('\n') : member.certifications) : '';
    const certificationsInput = document.getElementById('memberFormCertifications');
    if (certificationsInput) certificationsInput.value = certifications;

    // Avatar
    const avatarImg = document.getElementById('memberFormAvatarImg');
    const avatarInitials = document.getElementById('memberFormAvatarInitials');
    const avatarRemoveBtn = document.getElementById('memberFormAvatarRemove');
    const avatarUrlInput = document.getElementById('memberFormAvatarUrl');

    const initials = member.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    if (avatarInitials) avatarInitials.textContent = initials;

    if (member.avatar_url) {
        if (avatarImg) {
            avatarImg.src = member.avatar_url;
            avatarImg.style.display = 'block';
        }
        if (avatarInitials) avatarInitials.style.display = 'none';
        if (avatarRemoveBtn) avatarRemoveBtn.style.display = 'inline';
        if (avatarUrlInput) avatarUrlInput.value = member.avatar_url;
    } else {
        if (avatarImg) avatarImg.style.display = 'none';
        if (avatarInitials) avatarInitials.style.display = 'flex';
        if (avatarRemoveBtn) avatarRemoveBtn.style.display = 'none';
        if (avatarUrlInput) avatarUrlInput.value = '';
    }

    document.getElementById('teamMemberForm').dataset.mode = 'edit';
    document.getElementById('teamMemberForm').dataset.memberId = memberId;
    document.getElementById('teamMemberModal').classList.add('active');
}

function closeTeamMemberModal() {
    document.getElementById('teamMemberModal').classList.remove('active');
}

function handleAvatarUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        alert('Image must be less than 5MB');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(event) {
        const dataUrl = event.target.result;

        // Update preview
        const avatarImg = document.getElementById('memberFormAvatarImg');
        const avatarInitials = document.getElementById('memberFormAvatarInitials');
        const avatarRemoveBtn = document.getElementById('memberFormAvatarRemove');
        const avatarUrlInput = document.getElementById('memberFormAvatarUrl');

        avatarImg.src = dataUrl;
        avatarImg.style.display = 'block';
        avatarInitials.style.display = 'none';
        avatarRemoveBtn.style.display = 'inline';
        avatarUrlInput.value = dataUrl; // Store as data URL for now
    };
    reader.readAsDataURL(file);
}

function handleAvatarRemove() {
    const avatarImg = document.getElementById('memberFormAvatarImg');
    const avatarInitials = document.getElementById('memberFormAvatarInitials');
    const avatarRemoveBtn = document.getElementById('memberFormAvatarRemove');
    const avatarUrlInput = document.getElementById('memberFormAvatarUrl');
    const avatarInput = document.getElementById('memberFormAvatarInput');

    avatarImg.src = '';
    avatarImg.style.display = 'none';
    avatarInitials.style.display = 'flex';
    avatarRemoveBtn.style.display = 'none';
    avatarUrlInput.value = '';
    avatarInput.value = '';
}

async function handleTeamMemberFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const mode = form.dataset.mode;

    // Parse specialties from comma-separated string
    const specialtiesStr = document.getElementById('memberFormSpecialties').value;
    const specialties = specialtiesStr ? specialtiesStr.split(',').map(s => s.trim()).filter(s => s) : [];

    // Parse certifications from newline-separated string
    const certificationsStr = document.getElementById('memberFormCertifications').value;
    const certifications = certificationsStr ? certificationsStr.split('\n').map(s => s.trim()).filter(s => s) : [];

    const memberData = {
        name: document.getElementById('memberFormName').value,
        title: document.getElementById('memberFormTitle').value,
        email: document.getElementById('memberFormEmail').value,
        phone: document.getElementById('memberFormPhone').value,
        bio: document.getElementById('memberFormBio').value,
        years_experience: parseInt(document.getElementById('memberFormYears').value) || 0,
        color_code: document.getElementById('memberFormColor').value,
        instagram_url: document.getElementById('memberFormInstagram').value,
        facebook_url: document.getElementById('memberFormFacebook').value,
        specialties: specialties,
        certifications: certifications,
        avatar_url: document.getElementById('memberFormAvatarUrl').value || null
    };

    try {
        if (mode === 'add') {
            // Create via API
            const newMember = await api('/admin/stylists', {
                method: 'POST',
                body: JSON.stringify(memberData)
            });

            teamMembersData.push(newMember);
            renderTeamList(teamMembersData);
            selectTeamMember(newMember.id);

            if (newMember.temp_password) {
                alert(`Team member created!\nTemporary password: ${newMember.temp_password}\nPlease have them change it on first login.`);
            }
        } else if (mode === 'edit') {
            const memberId = form.dataset.memberId;

            // Update via API
            const updatedMember = await api(`/admin/stylists/${memberId}`, {
                method: 'PATCH',
                body: JSON.stringify(memberData)
            });

            // Update local data
            const index = teamMembersData.findIndex(m => m.id === memberId);
            if (index !== -1) {
                teamMembersData[index] = { ...teamMembersData[index], ...updatedMember };
                renderTeamList(teamMembersData);
                populateTeamMemberProfile(teamMembersData[index]);
            }
        }

        closeTeamMemberModal();
    } catch (err) {
        console.error('Failed to save team member:', err);
        alert('Failed to save: ' + err.message);
    }
}

async function saveMemberAvailability() {
    if (!selectedTeamMemberId) return;

    const container = document.getElementById('memberWeeklySchedule');
    const days = container.querySelectorAll('.schedule-day');

    const schedule = [];
    days.forEach((dayEl, index) => {
        const checkbox = dayEl.querySelector('input[type="checkbox"]');
        const startInput = dayEl.querySelector('.time-input.start');
        const endInput = dayEl.querySelector('.time-input.end');

        if (checkbox && checkbox.checked && startInput && endInput) {
            schedule.push({
                day_of_week: index,
                start_time: startInput.value,
                end_time: endInput.value
            });
        }
    });

    try {
        await api(`/admin/availability/${selectedTeamMemberId}`, {
            method: 'PUT',
            body: JSON.stringify({ schedule })
        });

        // Update local cache
        const member = teamMembersData.find(m => m.id === selectedTeamMemberId);
        if (member) {
            member.availability = {};
            for (let i = 0; i < 7; i++) {
                const slot = schedule.find(s => s.day_of_week === i);
                member.availability[i] = slot ? { start: slot.start_time, end: slot.end_time } : null;
            }
        }

        alert('Availability saved!');
    } catch (err) {
        console.error('Failed to save availability:', err);
        alert('Failed to save availability: ' + err.message);
    }
}

async function deleteMemberTimeOff(timeOffId) {
    if (!confirm('Delete this time off?')) return;

    try {
        await api(`/admin/time-off/${timeOffId}`, { method: 'DELETE' });

        // Update local cache
        const member = teamMembersData.find(m => m.id === selectedTeamMemberId);
        if (member && member.timeOff) {
            member.timeOff = member.timeOff.filter(t => t.id !== timeOffId);
            populateMemberTimeOff(member.timeOff);
        }
    } catch (err) {
        console.error('Failed to delete time off:', err);
        alert('Failed to delete: ' + err.message);
    }
}

function lightenColor(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
        (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
        (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
}

// Initialize team section when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    setupTeamSection();
});

/**
 * EDIT SERVICES MODAL
 */
let editingServicesForStylistId = null;
let allServicesData = [];

function setupServicesModal() {
    // Close button
    document.getElementById('closeServicesModal')?.addEventListener('click', closeServicesModal);
    document.getElementById('cancelServicesBtn')?.addEventListener('click', closeServicesModal);
    document.querySelector('#servicesModal .modal-overlay')?.addEventListener('click', closeServicesModal);

    // Save button
    document.getElementById('saveServicesBtn')?.addEventListener('click', saveServicesAssignments);

    // Edit services button in team section
    document.getElementById('editMemberServices')?.addEventListener('click', () => {
        if (selectedTeamMemberId) {
            manageStylistServices(selectedTeamMemberId);
        }
    });
}

async function manageStylistServices(stylistId) {
    editingServicesForStylistId = stylistId;

    // Find stylist name for title
    const member = teamMembersData.find(m => m.id === stylistId);
    const stylistName = member?.name || 'Team Member';

    document.getElementById('servicesModalTitle').textContent = `Edit Services - ${stylistName}`;
    document.getElementById('servicesModal').classList.add('active');

    // Show loading state
    const checklist = document.getElementById('servicesChecklist');
    checklist.innerHTML = `
        <div class="loading-state">
            <div class="spinner"></div>
            <span>Loading services...</span>
        </div>
    `;

    try {
        // Fetch all services with stylist's current assignments
        const services = await api(`/admin/stylist-services/${stylistId}`);
        allServicesData = services;
        renderServicesChecklist(services);
    } catch (err) {
        console.error('Failed to load services:', err);
        checklist.innerHTML = `
            <div class="error-state">
                <p>Failed to load services. Please try again.</p>
            </div>
        `;
    }
}

function renderServicesChecklist(services) {
    const checklist = document.getElementById('servicesChecklist');

    // Group services by category
    const categories = {};
    services.forEach(svc => {
        if (!categories[svc.category_id]) {
            categories[svc.category_id] = {
                name: svc.category_name,
                order: svc.category_order,
                services: []
            };
        }
        categories[svc.category_id].services.push(svc);
    });

    // Sort categories by display order
    const sortedCategories = Object.values(categories).sort((a, b) => a.order - b.order);

    // Render HTML
    let html = '';
    sortedCategories.forEach(category => {
        html += `
            <div class="service-category-section">
                <h4>${escapeHtml(category.name)}</h4>
                ${category.services.map(svc => `
                    <div class="service-check-row ${svc.is_assigned ? '' : 'unchecked'}" data-service-id="${svc.id}">
                        <div class="service-checkbox">
                            <input type="checkbox"
                                   id="svc_${svc.id}"
                                   ${svc.is_assigned ? 'checked' : ''}
                                   onchange="toggleServiceRow(this, '${svc.id}')">
                        </div>
                        <label for="svc_${svc.id}" class="service-checkbox">
                            ${escapeHtml(svc.name)}
                        </label>
                        <div class="service-default-info">
                            <span class="service-default-price">Base: $${parseFloat(svc.price).toFixed(0)}</span>
                            <span class="service-default-duration">${svc.duration_minutes} min</span>
                        </div>
                        <div class="service-custom-price">
                            <span>$</span>
                            <input type="number"
                                   id="price_${svc.id}"
                                   value="${svc.custom_price ? parseFloat(svc.custom_price).toFixed(0) : ''}"
                                   placeholder="${parseFloat(svc.price).toFixed(0)}"
                                   ${svc.is_assigned ? '' : 'disabled'}
                                   min="0"
                                   step="1">
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    });

    checklist.innerHTML = html;
}

function toggleServiceRow(checkbox, serviceId) {
    const row = document.querySelector(`.service-check-row[data-service-id="${serviceId}"]`);
    const priceInput = document.getElementById(`price_${serviceId}`);

    if (checkbox.checked) {
        row.classList.remove('unchecked');
        priceInput.disabled = false;
    } else {
        row.classList.add('unchecked');
        priceInput.disabled = true;
    }
}

async function saveServicesAssignments() {
    if (!editingServicesForStylistId) return;

    // Gather all checked services with their custom prices
    const services = [];
    document.querySelectorAll('.service-check-row').forEach(row => {
        const serviceId = row.dataset.serviceId;
        const checkbox = row.querySelector('input[type="checkbox"]');
        const priceInput = row.querySelector('input[type="number"]');

        if (checkbox.checked) {
            const customPrice = priceInput.value ? parseFloat(priceInput.value) : null;
            services.push({
                service_id: serviceId,
                custom_price: customPrice,
                custom_duration: null // Could add custom duration support later
            });
        }
    });

    try {
        await api(`/admin/stylist-services/${editingServicesForStylistId}`, {
            method: 'PUT',
            body: JSON.stringify({ services })
        });

        // Update local team member data
        const member = teamMembersData.find(m => m.id === editingServicesForStylistId);
        if (member) {
            // Refresh services display in team profile
            await refreshMemberServicesDisplay(editingServicesForStylistId);
        }

        closeServicesModal();
        alert('Services saved successfully!');

    } catch (err) {
        console.error('Failed to save services:', err);
        alert('Failed to save services: ' + err.message);
    }
}

async function refreshMemberServicesDisplay(stylistId) {
    try {
        // Fetch updated services for this stylist
        const services = await api(`/admin/stylist-services/${stylistId}`);

        // Group assigned services by category
        const categories = {};
        services.filter(s => s.is_assigned).forEach(svc => {
            if (!categories[svc.category_id]) {
                categories[svc.category_id] = {
                    name: svc.category_name,
                    order: svc.category_order,
                    items: []
                };
            }
            categories[svc.category_id].items.push({
                name: svc.name,
                duration: svc.custom_duration || svc.duration_minutes,
                price: svc.custom_price || svc.price
            });
        });

        // Update local teamMembersData
        const member = teamMembersData.find(m => m.id === stylistId);
        if (member) {
            member.services = Object.values(categories)
                .sort((a, b) => a.order - b.order)
                .map(cat => ({
                    category: cat.name,
                    items: cat.items
                }));

            // Re-render services list
            populateMemberServices(member.services);
        }
    } catch (err) {
        console.error('Failed to refresh services display:', err);
    }
}

function closeServicesModal() {
    document.getElementById('servicesModal').classList.remove('active');
    editingServicesForStylistId = null;
}

// Initialize services modal on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    setupServicesModal();
    setupClientServicesModal();
});

// Global functions for onclick handlers
window.deleteTimeOff = deleteTimeOff;
window.deleteMemberTimeOff = deleteMemberTimeOff;
window.toggleServiceRow = toggleServiceRow;
window.manageStylistServices = manageStylistServices;
window.editCategory = editCategory;
window.deleteCategory = deleteCategory;
window.editService = editService;
window.deleteService = deleteService;
window.openClientServicesModal = openClientServicesModal;
window.toggleClientServiceRow = toggleClientServiceRow;
window.removePreferredService = removePreferredService;

/**
 * ============================================
 * SERVICES MANAGEMENT (Settings Section)
 * ============================================
 */

let allCategoriesData = [];
let allMasterServicesData = [];
let selectedCategoryId = null;
let editingServiceId = null;
let editingCategoryId = null;

function setupServicesManagement() {
    // Category buttons
    document.getElementById('addCategoryBtn')?.addEventListener('click', showAddCategoryModal);
    document.getElementById('closeCategoryModal')?.addEventListener('click', closeCategoryModal);
    document.getElementById('cancelCategoryBtn')?.addEventListener('click', closeCategoryModal);
    document.querySelector('#categoryModal .modal-overlay')?.addEventListener('click', closeCategoryModal);
    document.getElementById('categoryForm')?.addEventListener('submit', handleCategoryFormSubmit);

    // Service buttons
    document.getElementById('addServiceBtn')?.addEventListener('click', showAddServiceModal);
    document.getElementById('closeServiceModal')?.addEventListener('click', closeServiceModal);
    document.getElementById('cancelServiceBtn')?.addEventListener('click', closeServiceModal);
    document.querySelector('#serviceModal .modal-overlay')?.addEventListener('click', closeServiceModal);
    document.getElementById('serviceForm')?.addEventListener('submit', handleServiceFormSubmit);

    // Category list click handler
    document.getElementById('serviceCategoryList')?.addEventListener('click', (e) => {
        const categoryItem = e.target.closest('.category-item');
        if (categoryItem && !e.target.closest('.category-action-btn')) {
            const categoryId = categoryItem.dataset.categoryId;
            selectCategory(categoryId);
        }
    });
}

async function loadServicesManagement() {
    try {
        // Load categories and services in parallel
        const [categories, services] = await Promise.all([
            api('/admin/categories'),
            api('/admin/services/all')
        ]);

        allCategoriesData = categories;
        allMasterServicesData = services;

        // Render UI
        renderCategoryList(categories);
        renderServicesTable(services);

        // Show all services by default
        selectCategory(null);

    } catch (err) {
        console.error('Failed to load services management:', err);
    }
}

function renderCategoryList(categories) {
    const list = document.getElementById('serviceCategoryList');
    if (!list) return;

    // Add "All Services" option
    let html = `
        <div class="category-item ${selectedCategoryId === null ? 'active' : ''}" data-category-id="">
            <span class="category-count">${allMasterServicesData.length || 0}</span>
            <div class="category-info">
                <span class="category-name">All Services</span>
            </div>
        </div>
    `;

    html += categories.map(cat => `
        <div class="category-item ${selectedCategoryId === cat.id ? 'active' : ''}" data-category-id="${cat.id}">
            <span class="category-count">${cat.service_count || 0}</span>
            <div class="category-info">
                <span class="category-name">${escapeHtml(cat.name)}</span>
            </div>
            <div class="category-actions">
                <button class="category-action-btn" onclick="editCategory('${cat.id}')" title="Edit">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                <button class="category-action-btn delete" onclick="deleteCategory('${cat.id}')" title="Delete">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');

    list.innerHTML = html;
}

function selectCategory(categoryId) {
    selectedCategoryId = categoryId || null;

    // Update active state
    document.querySelectorAll('.category-item').forEach(item => {
        const itemCatId = item.dataset.categoryId || null;
        item.classList.toggle('active', itemCatId === selectedCategoryId);
    });

    // Update panel title
    const title = document.getElementById('servicesPanelTitle');
    if (title) {
        if (selectedCategoryId) {
            const cat = allCategoriesData.find(c => c.id === selectedCategoryId);
            title.textContent = cat ? cat.name : 'Services';
        } else {
            title.textContent = 'All Services';
        }
    }

    // Filter and render services
    const filteredServices = selectedCategoryId
        ? allMasterServicesData.filter(s => s.category_id === selectedCategoryId)
        : allMasterServicesData;

    renderServicesTable(filteredServices);
}

function renderServicesTable(services) {
    const tbody = document.getElementById('servicesTableBody');
    if (!tbody) return;

    if (services.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5">
                    <div class="services-empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
                        </svg>
                        <p>No services found</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = services.map(svc => `
        <tr data-service-id="${svc.id}">
            <td class="service-name-cell">${escapeHtml(svc.name)}</td>
            <td>${svc.duration_minutes} min</td>
            <td>$${parseFloat(svc.price).toFixed(2)}</td>
            <td>
                <span class="service-status ${svc.is_active ? 'active' : 'inactive'}">
                    ${svc.is_active ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td>
                <div class="service-actions">
                    <button class="service-action-btn" onclick="editService('${svc.id}')" title="Edit">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="service-action-btn delete" onclick="deleteService('${svc.id}')" title="Delete">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                        </svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Category Modal Functions
function showAddCategoryModal() {
    editingCategoryId = null;
    document.getElementById('categoryModalTitle').textContent = 'Add Category';
    document.getElementById('categoryForm').reset();
    document.getElementById('categoryModal').classList.add('active');
}

function editCategory(categoryId) {
    const category = allCategoriesData.find(c => c.id === categoryId);
    if (!category) return;

    editingCategoryId = categoryId;
    document.getElementById('categoryModalTitle').textContent = 'Edit Category';
    document.getElementById('categoryFormName').value = category.name;
    document.getElementById('categoryFormDescription').value = category.description || '';
    document.getElementById('categoryFormOrder').value = category.display_order || '';
    document.getElementById('categoryModal').classList.add('active');
}

function closeCategoryModal() {
    document.getElementById('categoryModal').classList.remove('active');
    editingCategoryId = null;
}

async function handleCategoryFormSubmit(e) {
    e.preventDefault();

    const categoryData = {
        name: document.getElementById('categoryFormName').value,
        description: document.getElementById('categoryFormDescription').value || null,
        display_order: parseInt(document.getElementById('categoryFormOrder').value) || 99
    };

    try {
        if (editingCategoryId) {
            await api(`/admin/categories/${editingCategoryId}`, {
                method: 'PATCH',
                body: JSON.stringify(categoryData)
            });
        } else {
            await api('/admin/categories', {
                method: 'POST',
                body: JSON.stringify(categoryData)
            });
        }

        closeCategoryModal();
        await loadServicesManagement();

    } catch (err) {
        console.error('Failed to save category:', err);
        alert('Failed to save category: ' + err.message);
    }
}

async function deleteCategory(categoryId) {
    const category = allCategoriesData.find(c => c.id === categoryId);
    if (!category) return;

    if (!confirm(`Are you sure you want to delete "${category.name}"?\n\nNote: You can only delete categories that have no services.`)) {
        return;
    }

    try {
        await api(`/admin/categories/${categoryId}`, { method: 'DELETE' });
        await loadServicesManagement();
    } catch (err) {
        console.error('Failed to delete category:', err);
        alert('Failed to delete category: ' + err.message);
    }
}

// Service Modal Functions
function showAddServiceModal() {
    editingServiceId = null;
    document.getElementById('serviceModalTitle').textContent = 'Add Service';
    document.getElementById('serviceForm').reset();
    document.getElementById('serviceFormActive').checked = true;

    // Populate category dropdown
    populateServiceCategoryDropdown();

    // Pre-select current category if one is selected
    if (selectedCategoryId) {
        document.getElementById('serviceFormCategory').value = selectedCategoryId;
    }

    document.getElementById('serviceModal').classList.add('active');
}

function editService(serviceId) {
    const service = allMasterServicesData.find(s => s.id === serviceId);
    if (!service) return;

    editingServiceId = serviceId;
    document.getElementById('serviceModalTitle').textContent = 'Edit Service';

    // Populate category dropdown first
    populateServiceCategoryDropdown();

    // Fill form
    document.getElementById('serviceFormName').value = service.name;
    document.getElementById('serviceFormCategory').value = service.category_id;
    document.getElementById('serviceFormDuration').value = service.duration_minutes;
    document.getElementById('serviceFormPrice').value = parseFloat(service.price).toFixed(2);
    document.getElementById('serviceFormDescription').value = service.description || '';
    document.getElementById('serviceFormDeposit').value = service.deposit_amount ? parseFloat(service.deposit_amount).toFixed(2) : '';
    document.getElementById('serviceFormActive').checked = service.is_active !== false;

    document.getElementById('serviceModal').classList.add('active');
}

function populateServiceCategoryDropdown() {
    const select = document.getElementById('serviceFormCategory');
    if (!select) return;

    select.innerHTML = '<option value="">Select a category...</option>' +
        allCategoriesData.map(cat => `
            <option value="${cat.id}">${escapeHtml(cat.name)}</option>
        `).join('');
}

function closeServiceModal() {
    document.getElementById('serviceModal').classList.remove('active');
    editingServiceId = null;
}

async function handleServiceFormSubmit(e) {
    e.preventDefault();

    const serviceData = {
        name: document.getElementById('serviceFormName').value,
        category_id: document.getElementById('serviceFormCategory').value,
        duration_minutes: parseInt(document.getElementById('serviceFormDuration').value),
        price: parseFloat(document.getElementById('serviceFormPrice').value),
        description: document.getElementById('serviceFormDescription').value || null,
        deposit_amount: parseFloat(document.getElementById('serviceFormDeposit').value) || 0,
        is_active: document.getElementById('serviceFormActive').checked
    };

    try {
        if (editingServiceId) {
            await api(`/admin/services/${editingServiceId}`, {
                method: 'PATCH',
                body: JSON.stringify(serviceData)
            });
        } else {
            await api('/admin/services', {
                method: 'POST',
                body: JSON.stringify(serviceData)
            });
        }

        closeServiceModal();
        const savedCategoryId = serviceData.category_id;
        await loadServicesManagement();
        selectCategory(savedCategoryId);

    } catch (err) {
        console.error('Failed to save service:', err);
        alert('Failed to save service: ' + err.message);
    }
}

async function deleteService(serviceId) {
    const service = allMasterServicesData.find(s => String(s.id) === String(serviceId));
    if (!service) return;

    if (!confirm(`Are you sure you want to delete "${service.name}"?\n\nThis will also remove it from all team members.`)) {
        return;
    }

    try {
        const savedCategoryId = service.category_id;
        await api(`/admin/services/${serviceId}`, { method: 'DELETE' });
        await loadServicesManagement();
        selectCategory(savedCategoryId);
    } catch (err) {
        console.error('Failed to delete service:', err);
        alert('Failed to delete service: ' + err.message);
    }
}

// Initialize services management and settings navigation
document.addEventListener('DOMContentLoaded', () => {
    setupServicesManagement();
    setupSettingsNavigation();
});

/**
 * Settings Navigation (Menu items and Back buttons)
 */
function setupSettingsNavigation() {
    // Settings menu item clicks
    document.querySelectorAll('.settings-menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.dataset.nav;
            if (section) {
                navigateTo(section);
            }
        });
    });

    // Back button clicks
    document.querySelectorAll('.back-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const section = btn.dataset.nav;
            if (section) {
                navigateTo(section);
            }
        });
    });
}
