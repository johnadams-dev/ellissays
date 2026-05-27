// ── Navigation active state ───────────────────────────
(function() {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav__links a').forEach(a => {
    const href = a.getAttribute('href');
    if (href === path || (path === 'index.html' && href === 'index.html')) {
      a.classList.add('active');
    }
  });
})();

// ── Mobile nav toggle ─────────────────────────────────
const menuBtn = document.getElementById('menu-btn');
const mobileNav = document.getElementById('mobile-nav');
if (menuBtn && mobileNav) {
  menuBtn.addEventListener('click', () => {
    mobileNav.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded',
      mobileNav.classList.contains('open') ? 'true' : 'false');
  });
}

// ── Email capture forms ───────────────────────────────
function handleEmailForm(formId, successId) {
  const form = document.getElementById(formId);
  const success = document.getElementById(successId);
  if (!form) return;

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    const data = new FormData(form);
    const entry = {
      timestamp: new Date().toISOString(),
      email: data.get('email') || '',
      name: data.get('name') || '',
      type: data.get('type') || '',
      role: data.get('role') || '',
      source: document.title
    };

    // Store locally until wired to email service
    const stored = JSON.parse(localStorage.getItem('ellis_leads') || '[]');
    stored.push(entry);
    localStorage.setItem('ellis_leads', JSON.stringify(stored));

    // Visual feedback
    form.style.display = 'none';
    if (success) {
      success.style.display = 'block';
      success.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });
}

// Init all forms on page
handleEmailForm('waitlist-form', 'waitlist-success');
handleEmailForm('investor-form', 'investor-success');
handleEmailForm('agent-form', 'agent-success');
handleEmailForm('contact-form', 'contact-success');
handleEmailForm('hero-form', 'hero-success');

// ── Scroll-triggered fade-in ──────────────────────────
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('in-view');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll('[data-reveal]').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(20px)';
  el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
  const delay = el.dataset.delay || '0';
  el.style.transitionDelay = delay + 'ms';
  observer.observe(el);
});

document.addEventListener('animationend', () => {}, true);

// When in-view class is added, apply styles
const styleEl = document.createElement('style');
styleEl.textContent = `.in-view { opacity: 1 !important; transform: translateY(0) !important; }`;
document.head.appendChild(styleEl);

// ── Smooth scroll for anchor links ────────────────────
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

// ── Nav scroll shadow ─────────────────────────────────
window.addEventListener('scroll', () => {
  const nav = document.querySelector('.nav');
  if (nav) {
    nav.style.boxShadow = window.scrollY > 10
      ? '0 2px 16px rgba(28,43,58,0.08)'
      : 'none';
  }
}, { passive: true });
