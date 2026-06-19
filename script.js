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
  function updateScrollBtn() {
    const show = window.scrollY > 10;
    scrollTopBtn.style.opacity = show ? '1' : '0';
    scrollTopBtn.style.transform = show ? 'translateY(0)' : 'translateY(12px)';
    scrollTopBtn.style.pointerEvents = show ? 'auto' : 'none';
  }
  window.addEventListener('scroll', updateScrollBtn);
  updateScrollBtn();
  scrollTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// ===== PLAGES HORAIRES AUTO =====
(function generatePlages() {
  const grid = document.getElementById('plagesGrid');
  if (!grid) return;

  const JOURS = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const MOIS  = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const SLOTS_SEMAINE = ['8h00','9h30','11h00','12h30','14h00','15h30'];
  const SLOTS_WEEKEND = ['9h00','10h30','12h00','13h30','14h30'];

  // Référence : samedi 21 juin 2026 = 1er weekend disponible
  const REF_SAT = new Date(2026, 5, 21);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Lundi de la semaine courante
  const dow = today.getDay();
  const diffLundi = dow === 0 ? -6 : 1 - dow;
  const lundi = new Date(today);
  lundi.setDate(today.getDate() + diffLundi);

  // Jours affichés : lun(+0), mar(+1), mer(+2), sam(+5), dim(+6)
  const offsets = [0, 1, 2, 5, 6];
  const jours = offsets.map(o => { const d = new Date(lundi); d.setDate(lundi.getDate() + o); return d; });

  // Weekend dispo ? (alternance depuis REF_SAT)
  const msWeek = 7 * 24 * 60 * 60 * 1000;
  const semDiff = Math.round((jours[3] - REF_SAT) / msWeek);
  const weekendDispo = semDiff % 2 === 0;

  grid.innerHTML = jours.map((d, i) => {
    const isWE = i >= 3;
    const dispo = isWE ? weekendDispo : true;
    const nom = JOURS[d.getDay()];
    const date = d.getDate() + ' ' + MOIS[d.getMonth()];
    if (!dispo) {
      return `<div class="plage plage--ferme"><div class="plage__jour">${nom}</div><div class="plage__date">${date}</div><div class="plage__ferme-label">Fermé</div></div>`;
    }
    const slots = isWE ? SLOTS_WEEKEND : SLOTS_SEMAINE;
    return `<div class="plage plage--dispo"><div class="plage__jour">${nom}</div><div class="plage__date">${date}</div><div class="plage__heures">${slots.map(s => `<span class="plage__heure">${s}</span>`).join('')}</div></div>`;
  }).join('');
})();
