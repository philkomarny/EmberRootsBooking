/**
 * Ember & Roots Wellness - Medium Variant
 * Interactive Booking Experience
 */

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initServiceAccordions();
    initBookingModal();
    initScrollAnimations();
    initCalendar();
});

/**
 * Navigation
 */
function initNavigation() {
    const nav = document.querySelector('.main-nav');
    const mobileBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 100) {
            nav.style.background = 'rgba(242, 235, 226, 0.98)';
            nav.style.boxShadow = '0 4px 30px rgba(0,0,0,0.08)';
        } else {
            nav.style.background = 'rgba(242, 235, 226, 0.92)';
            nav.style.boxShadow = 'none';
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
            const serviceItem = btn.closest('.service-item');
            const serviceName = serviceItem.querySelector('h4')?.textContent;
            const serviceDuration = serviceItem.querySelector('.service-duration')?.textContent;
            const servicePrice = serviceItem.querySelector('.service-price')?.textContent;

            openBookingModal({
                name: serviceName,
                duration: serviceDuration,
                price: servicePrice
            });
        });
    });
}

/**
 * Booking Modal
 */
let currentStep = 1;
let selectedService = null;
let selectedDate = null;
let selectedTime = null;

function initBookingModal() {
    const modal = document.getElementById('bookingModal');
    const overlay = modal?.querySelector('.modal-overlay');
    const closeBtn = modal?.querySelector('.modal-close');
    const closeFinalBtn = modal?.querySelector('.close-modal-btn');

    overlay?.addEventListener('click', closeBookingModal);
    closeBtn?.addEventListener('click', closeBookingModal);
    closeFinalBtn?.addEventListener('click', closeBookingModal);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal?.classList.contains('active')) {
            closeBookingModal();
        }
    });

    document.querySelectorAll('.step-next').forEach(btn => {
        if (!btn.classList.contains('submit-booking')) {
            btn.addEventListener('click', () => {
                if (!btn.disabled) {
                    goToStep(currentStep + 1);
                }
            });
        }
    });

    const form = document.querySelector('.booking-form');
    form?.addEventListener('submit', (e) => {
        e.preventDefault();
        handleBookingSubmit();
    });
}

function openBookingModal(service) {
    selectedService = service;
    currentStep = 1;

    const modal = document.getElementById('bookingModal');
    const serviceName = modal?.querySelector('.selected-service h4');
    const serviceDetails = modal?.querySelector('.service-details');
    const summaryService = modal?.querySelector('.booking-summary .summary-item:first-child .value');

    if (serviceName) serviceName.textContent = service.name || 'Service';
    if (serviceDetails) {
        serviceDetails.innerHTML = `
            <span class="detail"><span class="icon">&#9711;</span> ${service.duration || '1 hr'}</span>
            <span class="detail"><span class="icon">&#10022;</span> ${service.price || '$0'}</span>
        `;
    }
    if (summaryService) summaryService.textContent = service.name || 'Service';

    resetModalState();
    goToStep(1);

    modal?.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeBookingModal() {
    const modal = document.getElementById('bookingModal');
    modal?.classList.remove('active');
    document.body.style.overflow = '';

    setTimeout(() => {
        resetModalState();
    }, 400);
}

function resetModalState() {
    currentStep = 1;
    selectedDate = null;
    selectedTime = null;

    document.querySelectorAll('.calendar-days .day').forEach(day => {
        day.classList.remove('selected');
    });

    document.querySelectorAll('.time-slot').forEach(slot => {
        slot.classList.remove('selected');
    });

    const form = document.querySelector('.booking-form');
    form?.reset();

    document.querySelectorAll('.step-next').forEach(btn => {
        if (btn.closest('.step-2') || btn.closest('.step-3')) {
            btn.disabled = true;
            if (btn.closest('.step-2')) btn.textContent = 'Select a Date';
            if (btn.closest('.step-3')) btn.textContent = 'Select a Time';
        }
    });
}

function goToStep(step) {
    currentStep = step;

    document.querySelectorAll('.booking-step').forEach(stepEl => {
        stepEl.classList.remove('active');
    });
    document.querySelector(`.step-${step}`)?.classList.add('active');

    document.querySelectorAll('.progress-dot').forEach((dot, index) => {
        dot.classList.toggle('active', index < step);
    });

    if (step === 3) {
        initTimeSlots();
    }
}

function handleBookingSubmit() {
    const dateValue = document.querySelector('.date-value');
    const timeValue = document.querySelector('.time-value');

    if (dateValue && selectedDate) {
        dateValue.textContent = selectedDate.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
    }
    if (timeValue && selectedTime) {
        timeValue.textContent = selectedTime;
    }

    goToStep(5);
}

/**
 * Calendar
 */
let calendarMonth = new Date();

function initCalendar() {
    renderCalendar(calendarMonth);

    document.querySelector('.cal-nav.prev')?.addEventListener('click', () => {
        calendarMonth.setMonth(calendarMonth.getMonth() - 1);
        renderCalendar(calendarMonth);
    });

    document.querySelector('.cal-nav.next')?.addEventListener('click', () => {
        calendarMonth.setMonth(calendarMonth.getMonth() + 1);
        renderCalendar(calendarMonth);
    });
}

function renderCalendar(date) {
    const calendarDays = document.querySelector('.calendar-days');
    const monthDisplay = document.querySelector('.cal-month');

    const year = date.getFullYear();
    const month = date.getMonth();

    if (monthDisplay) {
        monthDisplay.textContent = date.toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric'
        });
    }

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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

            if (dayDate < today) {
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
                    selectedDate = dayDate;

                    const nextBtn = document.querySelector('.step-2 .step-next');
                    if (nextBtn) {
                        nextBtn.disabled = false;
                        nextBtn.textContent = `Continue with ${dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
                    }
                });
            }

            calendarDays.appendChild(dayEl);
        }
    }
}

/**
 * Time Slots
 */
function initTimeSlots() {
    document.querySelectorAll('.time-slot:not(.unavailable)').forEach(slot => {
        slot.addEventListener('click', () => {
            document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
            slot.classList.add('selected');
            selectedTime = slot.textContent.trim();

            const nextBtn = document.querySelector('.step-3 .step-next');
            if (nextBtn) {
                nextBtn.disabled = false;
                nextBtn.textContent = `Continue with ${selectedTime}`;
            }
        });
    });
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
