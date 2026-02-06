// Layout 3: Story-Driven / Scroll-Triggered
// JavaScript for scroll progress and chapter animations

document.addEventListener('DOMContentLoaded', () => {
    // Scroll progress bar
    const progressBar = document.querySelector('.progress-bar');

    const updateProgress = () => {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const progress = (scrollTop / docHeight) * 100;
        progressBar.style.width = `${progress}%`;
    };

    window.addEventListener('scroll', updateProgress, { passive: true });

    // Chapter visibility on scroll
    const chapters = document.querySelectorAll('.chapter');

    const observerOptions = {
        threshold: 0.2,
        rootMargin: '0px 0px -10% 0px'
    };

    const chapterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, observerOptions);

    chapters.forEach(chapter => {
        chapterObserver.observe(chapter);
    });

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Parallax effect for intro chapter (subtle)
    const introChapter = document.querySelector('.chapter-intro');
    const introContent = introChapter?.querySelector('.chapter-content');

    if (introContent && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        window.addEventListener('scroll', () => {
            const scrollY = window.scrollY;
            const introHeight = introChapter.offsetHeight;

            if (scrollY < introHeight) {
                const parallax = scrollY * 0.3;
                introContent.style.transform = `translateY(${parallax}px)`;
                introContent.style.opacity = 1 - (scrollY / introHeight) * 0.5;
            }
        }, { passive: true });
    }

    // Pillar hover effect (cards)
    const pillars = document.querySelectorAll('.pillar');
    pillars.forEach(pillar => {
        pillar.addEventListener('mouseenter', () => {
            pillars.forEach(p => {
                if (p !== pillar) p.style.opacity = '0.6';
            });
        });

        pillar.addEventListener('mouseleave', () => {
            pillars.forEach(p => p.style.opacity = '1');
        });
    });
});
