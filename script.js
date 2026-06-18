// Nav scroll effect
const header = document.getElementById('header');
window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 40);
});

// Mobile burger menu
const burger = document.getElementById('burger');
const navLinks = document.querySelector('.nav__links');
burger.addEventListener('click', () => {
  burger.classList.toggle('open');
  navLinks.classList.toggle('open');
});

// Close menu on link click
navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    burger.classList.remove('open');
    navLinks.classList.remove('open');
  });
});

// Smooth scroll active link highlight
const sections = document.querySelectorAll('section[id]');
const navItems = document.querySelectorAll('.nav__links a[href^="#"]');

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      navItems.forEach(a => a.classList.remove('active'));
      const active = document.querySelector(`.nav__links a[href="#${entry.target.id}"]`);
      if (active) active.classList.add('active');
    }
  });
}, { threshold: 0.4 });

sections.forEach(s => observer.observe(s));

// Form submit — ouvre l'app SMS avec le message pré-rempli
document.getElementById('contactForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const prenom    = document.getElementById('prenom').value.trim();
  const nom       = document.getElementById('nom').value.trim();
  const telephone = document.getElementById('telephone').value.trim();
  const dureeEl   = document.querySelector('input[name="duree"]:checked');
  const serviceEl = document.querySelector('input[name="service"]:checked');
  const message   = document.getElementById('message').value.trim();
  const duree     = dureeEl ? dureeEl.value : '';
  const service   = serviceEl ? serviceEl.value : '';

  let sms = `Bonjour Isabelle, je suis ${prenom} ${nom}`;
  if (telephone) sms += `, mon numéro : ${telephone}`;
  if (duree)     sms += `. Durée : ${duree}`;
  if (service)   sms += `. Service : ${service}`;
  if (message)   sms += `. ${message}`;
  sms += `. J'aimerais prendre rendez-vous.`;

  const encoded = encodeURIComponent(sms);
  window.location.href = `sms:+14389398359?body=${encoded}`;
});

// Fade-in animation on scroll
const fadeEls = document.querySelectorAll('.service-card, .formation-card, .info-card, .coord-item, .valeur');
const fadeObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
      fadeObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

fadeEls.forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(20px)';
  el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  fadeObserver.observe(el);
});

// Scroll-to-top button
const scrollTopBtn = document.getElementById('scrollTopBtn');
if (scrollTopBtn) {
  window.addEventListener('scroll', () => {
    scrollTopBtn.classList.toggle('visible', window.scrollY > 400);
  });
  scrollTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}
