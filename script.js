/**
 * Ember & Roots Wellness
 * Interactive Booking Experience with Backend Integration
 * Enhanced Flow: Team Member → Service → Date → Time → OTP Auth → Profile → Book It!
 */

const API_URL = 'http://localhost:3001/api';

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
    initNavigation();
    loadServicesFromAPI();
    initBookingModal();
    initScrollAnimations();
});

/**
 * Navigation - Scroll effects and mobile menu
 */
function initNavigation() {
    const nav = document.querySelector('.main-nav');
    const mobileBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 100) {
            nav.style.background = 'rgba(26, 22, 18, 0.98)';
        } else {
            nav.style.background = 'linear-gradient(to bottom, rgba(26, 22, 18, 0.95), transparent)';
        }
    });

    mobileBtn?.addEventListener('click', () => {
        mobileBtn.classList.toggle('active');
        navLinks?.classList.toggle('mobile-open');
    });

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            const href = anchor.getAttribute('href');
            if (href !== '#') {
                e.preventDefault();
                const target = document.querySelector(href);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    mobileBtn?.classList.remove('active');
                    navLinks?.classList.remove('mobile-open');
                }
            }
        });
    });
}

/**
 * Load services from API
 */
async function loadServicesFromAPI() {
    try {
        const response = await fetch(`${API_URL}/services`);
        const categories = await response.json();

        const stylistsResponse = await fetch(`${API_URL}/stylists`);
        const stylists = await stylistsResponse.json();
        window.allStylists = stylists;

        renderServiceCategories(categories);
    } catch (err) {
        console.log('API not available, using static content');
        initServiceAccordions();
    }
}

/**
 * Render service categories
 */
function renderServiceCategories(categories) {
    const container = document.querySelector('.offerings-grid');
    if (!container) return;

    const icons = {
        'Facial + Body Treatments': `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="20" cy="15" r="10"/><path d="M10 35c0-8 4.5-12 10-12s10 4 10 12"/></svg>`,
        'Eyelash Services': `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 20c8-8 22-8 30 0"/><ellipse cx="20" cy="22" rx="8" ry="5"/></svg>`,
        'Brow Services': `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 16c4-4 9-4 12-2" stroke-width="2"/><path d="M32 16c-4-4-9-4-12-2" stroke-width="2"/></svg>`,
        'Sound Therapy': `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5"><ellipse cx="20" cy="30" rx="15" ry="5"/><path d="M10 30v-15c0-8 20-8 20 0v15"/></svg>`,
        'Reiki': `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 5v30"/><circle cx="20" cy="20" r="5"/></svg>`,
        'Massage Therapy': `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M15 10c-3 5-3 15 0 20"/><path d="M25 10c3 5 3 15 0 20"/></svg>`,
        'Waxing Services': `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M15 35l5-25 5 25"/><path d="M12 35h16"/></svg>`,
        'Makeup': `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 30l8-20h4l8 20"/><circle cx="20" cy="12" r="3"/></svg>`
    };

    container.innerHTML = categories.map(cat => `
        <div class="offering-category" data-category="${cat.category_id}">
            <button class="category-header">
                <div class="category-icon">
                    ${icons[cat.category_name] || icons['Facial + Body Treatments']}
                </div>
                <div class="category-info">
                    <h3>${cat.category_name}</h3>
                    <p>${cat.category_description || ''}</p>
                </div>
                <span class="category-toggle">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M6 9l6 6 6-6"/>
                    </svg>
                </span>
            </button>
            <div class="category-services">
                ${cat.services.map(svc => `
                    <div class="service-item" data-service-id="${svc.id}">
                        <div class="service-info">
                            <h4>${svc.name}</h4>
                            <p class="service-duration">${formatDuration(svc.duration)}</p>
                        </div>
                        <div class="service-price">$${svc.price}</div>
                        <button class="service-book">Book</button>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');

    initServiceAccordions();
}

/**
 * Service Category Accordions
 */
function initServiceAccordions() {
    const categories = document.querySelectorAll('.offering-category');

    categories.forEach(category => {
        const header = category.querySelector('.category-header');
        header?.addEventListener('click', () => {
            categories.forEach(cat => {
                if (cat !== category && cat.classList.contains('active')) {
                    cat.classList.remove('active');
                }
            });
            category.classList.toggle('active');
        });
    });

    document.querySelectorAll('.service-book').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openBookingModal();
        });
    });
}

/**
 * Initialize Booking Modal
 */
function initBookingModal() {
    const modal = document.getElementById('bookingModal');
    const overlay = modal?.querySelector('.modal-overlay');
    const closeBtn = modal?.querySelector('.modal-close');
    const doneBtn = document.getElementById('btnDone');

    overlay?.addEventListener('click', closeBookingModal);
    closeBtn?.addEventListener('click', closeBookingModal);
    doneBtn?.addEventListener('click', closeBookingModal);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal?.classList.contains('active')) {
            closeBookingModal();
        }
    });

    // Step 1: Team Member
    document.getElementById('btnStep1')?.addEventListener('click', () => goToStep(2));

    // Step 2: Service
    document.getElementById('backToStep1')?.addEventListener('click', () => goToStep(1));
    document.getElementById('btnStep2')?.addEventListener('click', () => goToStep(3));

    // Step 3: Date
    document.getElementById('backToStep2')?.addEventListener('click', () => goToStep(2));
    document.getElementById('btnStep3')?.addEventListener('click', () => goToStep(4));
    document.getElementById('calPrev')?.addEventListener('click', () => navigateCalendar(-1));
    document.getElementById('calNext')?.addEventListener('click', () => navigateCalendar(1));

    // Step 4: Time
    document.getElementById('backToStep3')?.addEventListener('click', () => goToStep(3));
    document.getElementById('btnStep4')?.addEventListener('click', () => goToStep(5));

    // Step 5: Auth Method
    document.getElementById('backToStep4')?.addEventListener('click', () => goToStep(4));
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => switchAuthMethod(tab.dataset.auth));
    });
    document.getElementById('btnSendOTP')?.addEventListener('click', sendOTP);

    // Step 6: OTP Verification
    document.getElementById('backToStep5')?.addEventListener('click', () => goToStep(5));
    document.getElementById('btnVerifyOTP')?.addEventListener('click', verifyOTP);
    document.getElementById('resendOTP')?.addEventListener('click', resendOTP);
    initOTPInputs();

    // Step 7: New Customer Profile
    document.getElementById('newCustomerForm')?.addEventListener('submit', saveNewCustomerProfile);
    document.getElementById('avatarInput')?.addEventListener('change', handleAvatarUpload);

    // Step 8: Final Confirmation
    document.getElementById('btnBookIt')?.addEventListener('click', submitBooking);
}

/**
 * Open Booking Modal
 */
async function openBookingModal() {
    resetBookingState();
    const modal = document.getElementById('bookingModal');
    modal?.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Load team members
    await loadTeamMembers();
    goToStep(1);
}

/**
 * Close Booking Modal
 */
function closeBookingModal() {
    const modal = document.getElementById('bookingModal');
    modal?.classList.remove('active');
    document.body.style.overflow = '';

    if (otpResendTimer) {
        clearInterval(otpResendTimer);
        otpResendTimer = null;
    }
}

/**
 * Reset Booking State
 */
function resetBookingState() {
    bookingState = {
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
    calendarMonth = new Date();
}

/**
 * Navigate to Step
 */
function goToStep(step) {
    bookingState.step = step;

    document.querySelectorAll('.booking-step').forEach(stepEl => {
        stepEl.classList.remove('active');
    });
    document.querySelector(`.step-${step}`)?.classList.add('active');

    // Update progress dots
    document.querySelectorAll('.progress-dot').forEach((dot, index) => {
        dot.classList.toggle('active', index < step);
    });

    // Load step-specific data
    if (step === 2 && bookingState.teamMember) {
        loadTeamMemberServices();
    } else if (step === 3) {
        renderCalendar();
    } else if (step === 4 && bookingState.date) {
        loadTimeSlots();
    } else if (step === 5) {
        // Pre-fill if we have contact info
        document.getElementById('authEmail').value = '';
        document.getElementById('authPhone').value = '';
    } else if (step === 8) {
        prepareConfirmation();
    }
}

/**
 * Load Team Members
 */
async function loadTeamMembers() {
    const container = document.getElementById('teamSelection');
    container.innerHTML = '<div class="loading-spinner"></div>';

    try {
        const response = await fetch(`${API_URL}/stylists`);
        const stylists = await response.json();

        if (stylists.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--sage);">No team members available</p>';
            return;
        }

        container.innerHTML = stylists
            .filter(s => s.is_active && s.display_on_website)
            .map(stylist => `
                <div class="team-member-card" data-id="${stylist.id}" data-name="${stylist.name}">
                    <div class="member-avatar">
                        ${stylist.avatar_url
                            ? `<img src="${stylist.avatar_url}" alt="${stylist.name}">`
                            : stylist.name.charAt(0)}
                    </div>
                    <div class="member-info">
                        <span class="member-name">${stylist.name}</span>
                        <span class="member-title">${stylist.title || 'Wellness Specialist'}</span>
                    </div>
                    <div class="member-check">✓</div>
                </div>
            `).join('');

        // Add click handlers
        container.querySelectorAll('.team-member-card').forEach(card => {
            card.addEventListener('click', () => selectTeamMember(card));
        });

    } catch (err) {
        console.error('Failed to load team members:', err);
        container.innerHTML = '<p style="text-align: center; color: var(--sage);">Unable to load team members</p>';
    }
}

/**
 * Select Team Member
 */
function selectTeamMember(card) {
    document.querySelectorAll('.team-member-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');

    bookingState.teamMember = {
        id: card.dataset.id,
        name: card.dataset.name
    };

    const btn = document.getElementById('btnStep1');
    btn.disabled = false;
    btn.textContent = `Continue with ${bookingState.teamMember.name}`;
}

/**
 * Load Team Member's Services
 */
async function loadTeamMemberServices() {
    const container = document.getElementById('serviceSelection');
    const subtitle = document.querySelector('#servicesSubtitle span');

    if (subtitle) subtitle.textContent = bookingState.teamMember.name;
    container.innerHTML = '<div class="loading-spinner"></div>';

    try {
        const response = await fetch(`${API_URL}/stylists/${bookingState.teamMember.id}`);
        const data = await response.json();

        const services = data.services || [];

        if (services.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--sage);">No services available</p>';
            return;
        }

        container.innerHTML = services.map(svc => `
            <div class="service-option" data-id="${svc.id}" data-name="${svc.name}" data-duration="${svc.duration}" data-price="${svc.price}">
                <div class="service-info">
                    <span class="service-name">${svc.name}</span>
                    <span class="service-meta">${formatDuration(svc.duration)}</span>
                </div>
                <span class="service-price">$${svc.price}</span>
            </div>
        `).join('');

        container.querySelectorAll('.service-option').forEach(option => {
            option.addEventListener('click', () => selectService(option));
        });

    } catch (err) {
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

    const btn = document.getElementById('btnStep2');
    btn.disabled = false;
    btn.textContent = `Continue with ${bookingState.service.name}`;
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

    if (monthDisplay) {
        monthDisplay.textContent = calendarMonth.toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric'
        });
    }

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Load available dates
    let availableDates = [];
    if (bookingState.teamMember?.id && bookingState.service?.id) {
        try {
            const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
            const response = await fetch(`${API_URL}/availability/${bookingState.teamMember.id}/${bookingState.service.id}?month=${monthStr}`);
            const data = await response.json();
            availableDates = data.available_dates || [];
        } catch (err) {
            console.log('Could not load availability');
        }
    }

    if (calendarDays) {
        calendarDays.innerHTML = '';

        for (let i = 0; i < firstDay; i++) {
            const emptyDay = document.createElement('span');
            emptyDay.className = 'day inactive';
            calendarDays.appendChild(emptyDay);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dayEl = document.createElement('span');
            dayEl.className = 'day';
            dayEl.textContent = day;

            const dayDate = new Date(year, month, day);
            const dateStr = dayDate.toISOString().split('T')[0];

            if (dayDate < today) {
                dayEl.classList.add('inactive');
            } else if (availableDates.length > 0 && !availableDates.includes(dateStr)) {
                dayEl.classList.add('inactive');
            } else {
                if (dayDate.toDateString() === today.toDateString()) {
                    dayEl.classList.add('today');
                }

                dayEl.addEventListener('click', () => {
                    document.querySelectorAll('.calendar-days .day').forEach(d => {
                        d.classList.remove('selected');
                    });
                    dayEl.classList.add('selected');
                    bookingState.date = dayDate;

                    const btn = document.getElementById('btnStep3');
                    btn.disabled = false;
                    btn.textContent = `Continue with ${dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
                });
            }

            calendarDays.appendChild(dayEl);
        }
    }
}

/**
 * Load Time Slots
 */
async function loadTimeSlots() {
    const container = document.getElementById('timeSlots');
    container.innerHTML = '<div class="loading-spinner"></div>';

    try {
        const dateStr = bookingState.date.toISOString().split('T')[0];
        const response = await fetch(`${API_URL}/availability/${bookingState.teamMember.id}/${bookingState.service.id}/slots?date=${dateStr}`);
        const data = await response.json();

        const slots = data.slots || [];

        if (slots.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--sage);">No available times for this date</p>';
            return;
        }

        container.innerHTML = slots.map(slot => `
            <button class="time-slot" data-start="${slot.start}" data-end="${slot.end}">
                ${slot.display}
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

                const btn = document.getElementById('btnStep4');
                btn.disabled = false;
                btn.textContent = `Continue with ${bookingState.time}`;
            });
        });

    } catch (err) {
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

    bookingState.authContact = contact;

    btn.disabled = true;
    btn.classList.add('btn-loading');
    btn.textContent = '';

    try {
        const response = await fetch(`${API_URL}/client-auth/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: bookingState.authMethod === 'email' ? contact : null,
                phone: bookingState.authMethod === 'phone' ? contact : null
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to send code');
        }

        bookingState.isReturning = data.isReturning;

        // Update OTP message
        const otpMessage = document.getElementById('otpMessage');
        otpMessage.textContent = `Enter the 6-digit code sent to ${bookingState.authMethod === 'email' ? 'your email' : 'your phone'}`;

        // Start resend timer
        startResendTimer();

        // Go to OTP step
        goToStep(6);

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
 * Initialize OTP Inputs
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
                if (inputs[i]) {
                    inputs[i].value = char;
                }
            });

            const lastIndex = Math.min(pasteData.length - 1, inputs.length - 1);
            if (inputs[lastIndex]) {
                inputs[lastIndex].focus();
            }

            checkOTPComplete();
        });
    });
}

/**
 * Check if OTP is complete
 */
function checkOTPComplete() {
    const inputs = document.querySelectorAll('#otpInputs input');
    const code = Array.from(inputs).map(i => i.value).join('');
    const btn = document.getElementById('btnVerifyOTP');
    btn.disabled = code.length !== 6;
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
        const response = await fetch(`${API_URL}/client-auth/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: bookingState.authMethod === 'email' ? bookingState.authContact : null,
                phone: bookingState.authMethod === 'phone' ? bookingState.authContact : null,
                code
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Invalid code');
        }

        bookingState.sessionToken = data.sessionToken;
        bookingState.isReturning = data.isReturning;
        bookingState.client = data.client;

        if (data.isReturning && data.client) {
            // Returning customer - go to confirmation
            goToStep(8);
        } else {
            // New customer - go to profile form
            prefillNewCustomerForm();
            goToStep(7);
        }

    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';

        // Clear inputs
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
    const timerSpan = document.getElementById('resendTimer');
    let seconds = 60;

    btn.disabled = true;
    timerSpan.textContent = seconds;

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
        await fetch(`${API_URL}/client-auth/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: bookingState.authMethod === 'email' ? bookingState.authContact : null,
                phone: bookingState.authMethod === 'phone' ? bookingState.authContact : null
            })
        });

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
        btn.innerHTML = `<img src="${e.target.result}" alt="Avatar">`;
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
        const response = await fetch(`${API_URL}/client-auth/register`, {
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

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Registration failed');
        }

        bookingState.client = data.client;
        bookingState.sessionToken = data.sessionToken;

        // Go to confirmation
        goToStep(8);

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
 * Prepare Confirmation
 */
function prepareConfirmation() {
    const client = bookingState.client;

    // Customer card
    if (client) {
        document.getElementById('confirmInitials').textContent =
            (client.firstName?.[0] || '') + (client.lastName?.[0] || '');
        document.getElementById('confirmName').textContent =
            `${client.firstName || ''} ${client.lastName || ''}`.trim();
        document.getElementById('confirmEmail').textContent =
            client.email || client.phone || '';

        if (client.avatarUrl) {
            document.getElementById('confirmAvatar').innerHTML =
                `<img src="${client.avatarUrl}" alt="Avatar" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        }
    }

    // Booking details
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
        const response = await fetch(`${API_URL}/bookings`, {
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

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Booking failed');
        }

        // Update final confirmation
        document.getElementById('finalCode').textContent = result.booking?.confirmation_code || '';
        document.getElementById('finalService').textContent = bookingState.service.name;
        document.getElementById('finalDate').textContent = bookingState.date.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
        document.getElementById('finalTime').textContent = bookingState.time;

        goToStep(9);

    } catch (err) {
        alert('Booking failed: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.classList.remove('btn-loading');
        btn.textContent = 'BOOK IT!';
    }
}

/**
 * Scroll Animations
 */
function initScrollAnimations() {
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('.offering-category, .review-card, .gallery-item, .contact-item').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s cubic-bezier(0.22, 1, 0.36, 1), transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)';
        observer.observe(el);
    });

    const style = document.createElement('style');
    style.textContent = `.animate-in { opacity: 1 !important; transform: translateY(0) !important; }`;
    document.head.appendChild(style);

    document.querySelectorAll('.offerings-grid .offering-category').forEach((el, index) => {
        el.style.transitionDelay = `${index * 0.1}s`;
    });

    document.querySelectorAll('.reviews-carousel .review-card').forEach((el, index) => {
        el.style.transitionDelay = `${index * 0.15}s`;
    });

    document.querySelectorAll('.gallery-grid .gallery-item').forEach((el, index) => {
        el.style.transitionDelay = `${index * 0.1}s`;
    });
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
