/**
 * Ember & Roots - Booking Page
 * Simple, focused booking experience
 */

const API_URL = '/api';

async function safeFetch(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            throw new Error(data.error || data.errors?.join(', ') || `Request failed (${response.status})`);
        }
        throw new Error(`Request failed (${response.status})`);
    }
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Unexpected response format');
    }
    return response.json();
}

function showToast(message, type = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('toast-exit'); setTimeout(() => toast.remove(), 300); }, 4000);
}

let currentAbortController = null;
function getAbortSignal() {
    if (currentAbortController) currentAbortController.abort();
    currentAbortController = new AbortController();
    return currentAbortController.signal;
}

// Booking State
let bookingState = {
    step: 1,
    teamMember: null,
    service: null,
    date: null,
    time: null,
    slot: null,
    authMethod: 'email',
    authContact: null,
    isReturning: false,
    client: null,
    sessionToken: null
};

let calendarMonth = new Date();
let otpResendTimer = null;

document.addEventListener('DOMContentLoaded', () => {
    loadTeamMembers();
    initBookingFlow();
});

/**
 * Load Team Members
 */
async function loadTeamMembers() {
    const container = document.getElementById('teamGrid');

    try {
        const stylists = await safeFetch(`${API_URL}/stylists`);

        if (stylists.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--sage); grid-column: 1/-1;">No team members available at this time.</p>';
            return;
        }

        container.innerHTML = stylists.map(stylist => `
            <div class="team-card" data-id="${stylist.id}" data-name="${escapeHtml(stylist.name)}">
                <div class="team-card-avatar">
                    ${stylist.avatar_url
                        ? `<img src="${escapeHtml(stylist.avatar_url)}" alt="${escapeHtml(stylist.name)}">`
                        : escapeHtml(stylist.name.charAt(0))}
                </div>
                <h3 class="team-card-name">${escapeHtml(stylist.name)}</h3>
                <p class="team-card-title">${stylist.title ? escapeHtml(stylist.title) : 'Wellness Specialist'}</p>
                ${stylist.bio ? `<p class="team-card-bio">${escapeHtml(stylist.bio)}</p>` : ''}
                <button class="team-card-cta">Book with ${escapeHtml(stylist.name.split(' ')[0])}</button>
            </div>
        `).join('');

        // Add click handlers
        container.querySelectorAll('.team-card').forEach(card => {
            card.addEventListener('click', () => selectTeamMember(card));
        });

    } catch (err) {
        console.error('Failed to load team members:', err);
        container.innerHTML = '<p style="text-align: center; color: var(--sage); grid-column: 1/-1;">Unable to load team members. Please try again later.</p>';
    }
}

/**
 * Select Team Member
 */
function selectTeamMember(card) {
    // Update selection visually
    document.querySelectorAll('.team-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');

    // Store selection
    bookingState.teamMember = {
        id: card.dataset.id,
        name: card.dataset.name
    };

    // Update the selected member bar
    document.getElementById('selectedMemberName').textContent = bookingState.teamMember.name;

    // Show booking flow
    document.getElementById('bookingFlowSection').style.display = 'block';

    // Scroll to booking flow
    setTimeout(() => {
        document.getElementById('bookingFlowSection').scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }, 100);

    // Load services and show step 1
    resetBookingSteps();
    loadTeamMemberServices();
}

/**
 * Reset booking steps to beginning
 */
function resetBookingSteps() {
    bookingState.step = 1;
    bookingState.service = null;
    bookingState.date = null;
    bookingState.time = null;
    bookingState.slot = null;
    bookingState.client = null;
    bookingState.sessionToken = null;
    calendarMonth = new Date();

    document.querySelectorAll('.booking-step').forEach(step => step.classList.remove('active'));
    document.querySelector('.step-1').classList.add('active');

    // Reset progress dots
    document.querySelectorAll('.progress-dot').forEach((dot, index) => {
        dot.classList.toggle('active', index === 0);
    });

    // Reset buttons
    document.getElementById('btnStep1').disabled = true;
    document.getElementById('btnStep1').textContent = 'Select a Service';

    // Clear confirmation step so stale data never shows
    document.getElementById('confirmInitials').textContent = '';
    document.getElementById('confirmName').textContent = '';
    document.getElementById('confirmEmail').textContent = '';
    document.getElementById('confirmAvatar').innerHTML = '<span id="confirmInitials"></span>';
    document.getElementById('confirmService').textContent = '';
    document.getElementById('confirmStylist').textContent = '';
    document.getElementById('confirmDate').textContent = '';
    document.getElementById('confirmTime').textContent = '';
    document.getElementById('confirmPrice').textContent = '';

    // Clear success step
    document.getElementById('finalCode').textContent = '';
    document.getElementById('finalService').textContent = '';
    document.getElementById('finalDate').textContent = '';
    document.getElementById('finalTime').textContent = '';

    // Clear OTP inputs and timer
    document.querySelectorAll('#otpInputs input').forEach(i => i.value = '');
    if (otpResendTimer) clearInterval(otpResendTimer);
}

/**
 * Initialize Booking Flow
 */
function initBookingFlow() {
    // Change member button
    document.getElementById('changeMemberBtn')?.addEventListener('click', () => {
        document.getElementById('bookingFlowSection').style.display = 'none';
        document.querySelectorAll('.team-card').forEach(c => c.classList.remove('selected'));
        document.getElementById('teamSection').scrollIntoView({ behavior: 'smooth' });
    });

    // Step navigation
    document.getElementById('btnStep1')?.addEventListener('click', () => goToStep(2));
    document.getElementById('backToStep1')?.addEventListener('click', () => goToStep(1));
    document.getElementById('btnStep2')?.addEventListener('click', () => goToStep(3));
    document.getElementById('backToStep2')?.addEventListener('click', () => goToStep(2));
    document.getElementById('btnStep3')?.addEventListener('click', () => goToStep(4));
    document.getElementById('backToStep3')?.addEventListener('click', () => goToStep(3));

    // Auth tabs
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => switchAuthMethod(tab.dataset.auth));
    });
    document.getElementById('btnSendOTP')?.addEventListener('click', sendOTP);

    // OTP
    document.getElementById('backToStep4')?.addEventListener('click', () => goToStep(4));
    document.getElementById('btnVerifyOTP')?.addEventListener('click', verifyOTP);
    document.getElementById('resendOTP')?.addEventListener('click', resendOTP);
    initOTPInputs();

    // Profile
    document.getElementById('newCustomerForm')?.addEventListener('submit', saveNewCustomerProfile);
    document.getElementById('avatarInput')?.addEventListener('change', handleAvatarUpload);

    // Booking
    document.getElementById('btnBookIt')?.addEventListener('click', submitBooking);

    // Book another
    document.getElementById('btnBookAnother')?.addEventListener('click', () => {
        document.getElementById('bookingFlowSection').style.display = 'none';
        document.querySelectorAll('.team-card').forEach(c => c.classList.remove('selected'));
        bookingState.teamMember = null;
        document.getElementById('teamSection').scrollIntoView({ behavior: 'smooth' });
    });

    // Calendar navigation
    document.getElementById('calPrev')?.addEventListener('click', () => navigateCalendar(-1));
    document.getElementById('calNext')?.addEventListener('click', () => navigateCalendar(1));
}

/**
 * Go to Step
 */
function goToStep(step) {
    bookingState.step = step;

    document.querySelectorAll('.booking-step').forEach(s => s.classList.remove('active'));
    document.querySelector(`.step-${step}`)?.classList.add('active');

    // Update progress dots
    document.querySelectorAll('.progress-dot').forEach((dot, index) => {
        dot.classList.toggle('active', index < step);
    });

    // Update progressbar ARIA
    const progressBar = document.querySelector('[role="progressbar"]');
    if (progressBar) progressBar.setAttribute('aria-valuenow', step);

    // Load step-specific data
    if (step === 2) {
        renderCalendar();
    } else if (step === 3 && bookingState.date) {
        loadTimeSlots();
    } else if (step === 4) {
        document.getElementById('authEmail').value = '';
        document.getElementById('authPhone').value = '';
    } else if (step === 7) {
        prepareConfirmation();
    }
}

/**
 * Load Team Member Services
 */
async function loadTeamMemberServices() {
    const container = document.getElementById('serviceSelection');
    container.innerHTML = '<div class="loading-spinner"></div>';
    const signal = getAbortSignal();

    try {
        const data = await safeFetch(`${API_URL}/stylists/${bookingState.teamMember.id}`, { signal });
        const services = data.services || [];

        if (services.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--sage);">No services available</p>';
            return;
        }

        container.innerHTML = services.map(svc => `
            <div class="service-option" data-id="${svc.id}" data-name="${escapeHtml(svc.name)}" data-duration="${svc.duration}" data-price="${svc.price}">
                <div class="service-info">
                    <span class="service-name">${escapeHtml(svc.name)}</span>
                    <span class="service-meta">${formatDuration(svc.duration)}</span>
                </div>
                <span class="service-price">$${escapeHtml(String(svc.price))}</span>
            </div>
        `).join('');

        container.querySelectorAll('.service-option').forEach(option => {
            option.addEventListener('click', () => selectService(option));
        });

    } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('Failed to load services:', err);
        container.innerHTML = '<p style="text-align: center; color: var(--sage);">Unable to load services</p>';
    }
}

/**
 * Select Service
 */
function selectService(option) {
    document.querySelectorAll('.service-option').forEach(o => o.classList.remove('selected'));
    option.classList.add('selected');

    bookingState.service = {
        id: option.dataset.id,
        name: option.dataset.name,
        duration: parseInt(option.dataset.duration),
        price: parseFloat(option.dataset.price)
    };

    const btn = document.getElementById('btnStep1');
    btn.disabled = false;
    btn.textContent = `Continue`;
}

/**
 * Calendar Navigation
 */
function navigateCalendar(direction) {
    calendarMonth.setMonth(calendarMonth.getMonth() + direction);
    renderCalendar();
}

/**
 * Render Calendar
 */
async function renderCalendar() {
    const calendarDays = document.getElementById('calendarDays');
    const monthDisplay = document.getElementById('calMonth');

    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();

    monthDisplay.textContent = calendarMonth.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
    });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Load available dates
    let availableDates = [];
    if (bookingState.teamMember?.id && bookingState.service?.id) {
        try {
            const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
            const data = await safeFetch(`${API_URL}/availability/${bookingState.teamMember.id}/${bookingState.service.id}?month=${monthStr}`);
            availableDates = data.available_dates || [];
        } catch (err) {
            console.log('Could not load availability');
        }
    }

    calendarDays.innerHTML = '';

    // Empty cells for days before first of month
    for (let i = 0; i < firstDay; i++) {
        const emptyDay = document.createElement('span');
        emptyDay.className = 'day inactive';
        emptyDay.setAttribute('role', 'gridcell');
        calendarDays.appendChild(emptyDay);
    }

    // Day cells
    for (let day = 1; day <= daysInMonth; day++) {
        const dayEl = document.createElement('span');
        dayEl.className = 'day';
        dayEl.textContent = day;
        dayEl.setAttribute('role', 'gridcell');

        const dayDate = new Date(year, month, day);
        const dateStr = dayDate.toISOString().split('T')[0];

        // Full date label for screen readers
        const fullDateLabel = dayDate.toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
        });
        dayEl.setAttribute('aria-label', fullDateLabel);

        if (dayDate < today) {
            dayEl.classList.add('inactive');
        } else if (availableDates.length > 0 && !availableDates.includes(dateStr)) {
            dayEl.classList.add('inactive');
        } else {
            if (dayDate.toDateString() === today.toDateString()) {
                dayEl.classList.add('today');
            }

            dayEl.addEventListener('click', () => {
                document.querySelectorAll('.calendar-days .day').forEach(d => d.classList.remove('selected'));
                dayEl.classList.add('selected');
                bookingState.date = dayDate;

                const btn = document.getElementById('btnStep2');
                btn.disabled = false;
                btn.textContent = `Continue`;
            });
        }

        calendarDays.appendChild(dayEl);
    }
}

/**
 * Load Time Slots
 */
async function loadTimeSlots() {
    const container = document.getElementById('timeSlots');
    container.innerHTML = '<div class="loading-spinner"></div>';
    const signal = getAbortSignal();

    try {
        const dateStr = bookingState.date.toISOString().split('T')[0];
        const data = await safeFetch(`${API_URL}/availability/${bookingState.teamMember.id}/${bookingState.service.id}/slots?date=${dateStr}`, { signal });
        const slots = data.slots || [];

        if (slots.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--sage);">No available times for this date</p>';
            return;
        }

        container.innerHTML = slots.map(slot => `
            <button class="time-slot" data-start="${escapeHtml(slot.start)}" data-end="${escapeHtml(slot.end)}">
                ${escapeHtml(slot.display)}
            </button>
        `).join('');

        container.querySelectorAll('.time-slot').forEach(slotEl => {
            slotEl.addEventListener('click', () => {
                container.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
                slotEl.classList.add('selected');

                bookingState.time = slotEl.textContent.trim();
                bookingState.slot = {
                    start: slotEl.dataset.start,
                    end: slotEl.dataset.end
                };

                const btn = document.getElementById('btnStep3');
                btn.disabled = false;
                btn.textContent = `Continue`;
            });
        });

    } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('Failed to load time slots:', err);
        container.innerHTML = '<p style="text-align: center; color: var(--sage);">Unable to load time slots</p>';
    }
}

/**
 * Switch Auth Method
 */
function switchAuthMethod(method) {
    bookingState.authMethod = method;

    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.auth === method);
    });

    document.getElementById('authEmailGroup').style.display = method === 'email' ? 'block' : 'none';
    document.getElementById('authPhoneGroup').style.display = method === 'phone' ? 'block' : 'none';
}

/**
 * Send OTP
 */
async function sendOTP() {
    const email = document.getElementById('authEmail').value.trim();
    const phone = document.getElementById('authPhone').value.trim();
    const errorEl = document.getElementById('authError');
    const btn = document.getElementById('btnSendOTP');

    errorEl.style.display = 'none';

    const contact = bookingState.authMethod === 'email' ? email : phone;
    if (!contact) {
        errorEl.textContent = `Please enter your ${bookingState.authMethod === 'email' ? 'email address' : 'phone number'}`;
        errorEl.style.display = 'block';
        return;
    }

    // Client-side validation
    if (email) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showToast('Please enter a valid email address', 'error');
            return;
        }
    }
    if (phone) {
        if (phone.replace(/\D/g, '').length < 10) {
            showToast('Please enter a valid phone number', 'error');
            return;
        }
    }

    bookingState.authContact = contact;

    btn.disabled = true;
    btn.classList.add('btn-loading');
    btn.textContent = '';

    try {
        const data = await safeFetch(`${API_URL}/client-auth/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: bookingState.authMethod === 'email' ? contact : null,
                phone: bookingState.authMethod === 'phone' ? contact : null
            })
        });

        bookingState.isReturning = data.isReturning;

        // Dev mode: auto-fill OTP code when email/SMS is not configured
        if (data.devMode && data.devCode) {
            document.getElementById('otpMessage').innerHTML = `
                <span style="color: #d4a574;">Demo Mode</span> — Code auto-filled below
                <br><span style="font-size: 12px; color: #7d8471;">Email service not configured. Code provided for demo purposes.</span>
            `;
            // Auto-fill the OTP inputs after a brief delay
            setTimeout(() => {
                const inputs = document.querySelectorAll('#otpInputs input');
                const digits = data.devCode.split('');
                inputs.forEach((input, i) => {
                    if (digits[i]) {
                        input.value = digits[i];
                    }
                });
                checkOTPComplete();
            }, 500);
        } else {
            document.getElementById('otpMessage').textContent = `Enter the 6-digit code sent to ${bookingState.authMethod === 'email' ? 'your email' : 'your phone'}`;
        }

        startResendTimer();
        goToStep(5);

    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.classList.remove('btn-loading');
        btn.textContent = 'Send Verification Code';
    }
}

/**
 * Init OTP Inputs
 */
function initOTPInputs() {
    const inputs = document.querySelectorAll('#otpInputs input');

    inputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            const value = e.target.value.replace(/[^0-9]/g, '');
            e.target.value = value;

            if (value && index < inputs.length - 1) {
                inputs[index + 1].focus();
            }

            checkOTPComplete();
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value && index > 0) {
                inputs[index - 1].focus();
            }
        });

        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pasteData = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6);

            pasteData.split('').forEach((char, i) => {
                if (inputs[i]) inputs[i].value = char;
            });

            const lastIndex = Math.min(pasteData.length - 1, inputs.length - 1);
            if (inputs[lastIndex]) inputs[lastIndex].focus();

            checkOTPComplete();
        });
    });
}

/**
 * Check OTP Complete
 */
function checkOTPComplete() {
    const inputs = document.querySelectorAll('#otpInputs input');
    const code = Array.from(inputs).map(i => i.value).join('');
    document.getElementById('btnVerifyOTP').disabled = code.length !== 6;
}

/**
 * Verify OTP
 */
async function verifyOTP() {
    const inputs = document.querySelectorAll('#otpInputs input');
    const code = Array.from(inputs).map(i => i.value).join('');
    const errorEl = document.getElementById('otpError');
    const btn = document.getElementById('btnVerifyOTP');

    errorEl.style.display = 'none';

    btn.disabled = true;
    btn.classList.add('btn-loading');
    btn.textContent = '';

    try {
        const data = await safeFetch(`${API_URL}/client-auth/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: bookingState.authMethod === 'email' ? bookingState.authContact : null,
                phone: bookingState.authMethod === 'phone' ? bookingState.authContact : null,
                code
            })
        });

        bookingState.sessionToken = data.sessionToken;
        bookingState.isReturning = data.isReturning;
        bookingState.client = data.client;

        if (data.isReturning && data.client) {
            goToStep(7); // Confirmation
        } else {
            prefillNewCustomerForm();
            goToStep(6); // Profile
        }

    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
        inputs.forEach(i => i.value = '');
        inputs[0].focus();
    } finally {
        btn.disabled = false;
        btn.classList.remove('btn-loading');
        btn.textContent = 'Verify Code';
    }
}

/**
 * Start Resend Timer
 */
function startResendTimer() {
    const btn = document.getElementById('resendOTP');
    let seconds = 60;

    // Always rebuild the button content with the timer span
    btn.innerHTML = `Resend code in <span id="resendTimer">${seconds}</span>s`;
    btn.disabled = true;

    const timerSpan = document.getElementById('resendTimer');

    if (otpResendTimer) clearInterval(otpResendTimer);

    otpResendTimer = setInterval(() => {
        seconds--;
        timerSpan.textContent = seconds;

        if (seconds <= 0) {
            clearInterval(otpResendTimer);
            btn.disabled = false;
            btn.innerHTML = 'Resend code';
        }
    }, 1000);
}

/**
 * Resend OTP
 */
async function resendOTP() {
    const btn = document.getElementById('resendOTP');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    try {
        const data = await safeFetch(`${API_URL}/client-auth/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: bookingState.authMethod === 'email' ? bookingState.authContact : null,
                phone: bookingState.authMethod === 'phone' ? bookingState.authContact : null
            })
        });

        // Dev mode: auto-fill new code on resend
        if (data.devMode && data.devCode) {
            const inputs = document.querySelectorAll('#otpInputs input');
            const digits = data.devCode.split('');
            inputs.forEach((input, i) => {
                input.value = digits[i] || '';
            });
            checkOTPComplete();
        }

        startResendTimer();
    } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Resend code';
    }
}

/**
 * Prefill New Customer Form
 */
function prefillNewCustomerForm() {
    if (bookingState.authMethod === 'email') {
        document.getElementById('profileEmail').value = bookingState.authContact || '';
    } else {
        document.getElementById('profileCell').value = bookingState.authContact || '';
    }
}

/**
 * Handle Avatar Upload
 */
function handleAvatarUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const btn = document.getElementById('avatarUploadBtn');
        btn.innerHTML = `<img src="${e.target.result}" alt="Avatar" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        bookingState.avatarData = e.target.result;
    };
    reader.readAsDataURL(file);
}

/**
 * Save New Customer Profile
 */
async function saveNewCustomerProfile(e) {
    e.preventDefault();

    const errorEl = document.getElementById('profileError');
    const btn = document.getElementById('btnSaveProfile');
    errorEl.style.display = 'none';

    const firstName = document.getElementById('profileFirstName').value.trim();
    if (!firstName) {
        errorEl.textContent = 'First name is required';
        errorEl.style.display = 'block';
        return;
    }

    btn.disabled = true;
    btn.classList.add('btn-loading');
    btn.textContent = '';

    try {
        const data = await safeFetch(`${API_URL}/client-auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionToken: bookingState.sessionToken,
                firstName,
                lastName: document.getElementById('profileLastName').value.trim(),
                email: document.getElementById('profileEmail').value.trim() || (bookingState.authMethod === 'email' ? bookingState.authContact : null),
                phone: document.getElementById('profileCell').value.trim() || (bookingState.authMethod === 'phone' ? bookingState.authContact : null),
                avatarUrl: bookingState.avatarData || null,
                addressStreet: document.getElementById('profileAddress').value.trim(),
                addressCity: document.getElementById('profileCity').value.trim(),
                addressState: document.getElementById('profileState').value.trim(),
                addressZip: document.getElementById('profileZip').value.trim(),
                instagramUrl: document.getElementById('profileInstagram').value.trim(),
                facebookUrl: document.getElementById('profileFacebook').value.trim(),
                tiktokUrl: document.getElementById('profileTiktok').value.trim()
            })
        });

        bookingState.client = data.client;
        bookingState.sessionToken = data.sessionToken;

        goToStep(7);

    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.classList.remove('btn-loading');
        btn.textContent = 'Save & Continue';
    }
}

/**
 * Prepare Confirmation — re-validates the slot is still available
 */
async function prepareConfirmation() {
    const client = bookingState.client;

    if (client) {
        document.getElementById('confirmInitials').textContent =
            (client.firstName?.[0] || '') + (client.lastName?.[0] || '');
        document.getElementById('confirmName').textContent =
            `${client.firstName || ''} ${client.lastName || ''}`.trim();
        document.getElementById('confirmEmail').textContent =
            client.email || client.phone || '';

        if (client.avatarUrl) {
            document.getElementById('confirmAvatar').innerHTML =
                `<img src="${escapeHtml(client.avatarUrl)}" alt="Avatar" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        }
    }

    document.getElementById('confirmService').textContent = bookingState.service?.name || '';
    document.getElementById('confirmStylist').textContent = bookingState.teamMember?.name || '';
    document.getElementById('confirmDate').textContent = bookingState.date?.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    }) || '';
    document.getElementById('confirmTime').textContent = bookingState.time || '';
    document.getElementById('confirmPrice').textContent = `$${bookingState.service?.price || 0}`;

    // Re-validate the selected slot is still available
    try {
        const dateStr = bookingState.date.toISOString().split('T')[0];
        const data = await safeFetch(`${API_URL}/availability/${bookingState.teamMember.id}/${bookingState.service.id}/slots?date=${dateStr}`);
        const slots = data.slots || [];
        const selectedStart = bookingState.slot.start;
        const stillAvailable = slots.some(s => s.start === selectedStart);

        if (!stillAvailable) {
            showToast('Sorry, the time you selected is no longer available. Please choose a different time.', 'error');
            goToStep(3);
            loadTimeSlots();
            return;
        }
    } catch (err) {
        // If the check fails, let them proceed — the server will catch conflicts on submit
        console.warn('Slot re-validation failed:', err);
    }
}

/**
 * Submit Booking
 */
async function submitBooking() {
    const btn = document.getElementById('btnBookIt');
    btn.disabled = true;
    btn.classList.add('btn-loading');
    btn.textContent = '';

    try {
        const result = await safeFetch(`${API_URL}/bookings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${bookingState.sessionToken}`
            },
            body: JSON.stringify({
                stylist_id: bookingState.teamMember.id,
                service_id: bookingState.service.id,
                start_datetime: bookingState.slot.start,
                client_name: `${bookingState.client.firstName} ${bookingState.client.lastName || ''}`.trim(),
                client_email: bookingState.client.email,
                client_phone: bookingState.client.phone,
                client_id: bookingState.client.id
            })
        });

        document.getElementById('finalCode').textContent = result.booking?.confirmation_code || '';
        document.getElementById('finalService').textContent = bookingState.service.name;
        document.getElementById('finalDate').textContent = bookingState.date.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
        document.getElementById('finalTime').textContent = bookingState.time;

        goToStep(8);

    } catch (err) {
        const isSlotTaken = err.message.toLowerCase().includes('no longer available') ||
                            err.message.toLowerCase().includes('conflict') ||
                            err.message.toLowerCase().includes('slot');
        if (isSlotTaken) {
            showToast('Sorry, this time slot was just booked by someone else. Let\'s pick a new time.', 'error');
            goToStep(3);
            loadTimeSlots();
        } else {
            showToast('Booking failed: ' + err.message, 'error');
        }
    } finally {
        btn.disabled = false;
        btn.classList.remove('btn-loading');
        btn.textContent = 'BOOK IT!';
    }
}

/**
 * Format Duration
 */
function formatDuration(minutes) {
    if (minutes < 60) return `${minutes} mins`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) return `${hours} hr${hours > 1 ? 's' : ''}`;
    return `${hours} hr ${mins} mins`;
}
