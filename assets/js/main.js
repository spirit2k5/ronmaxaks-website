
const menu = document.querySelector('.menu-button');
const nav = document.querySelector('.nav-links');

function setNavigationOpen(open, restoreFocus = false) {
  if (!menu || !nav) return;
  nav.classList.toggle('open', open);
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  if (restoreFocus) menu.focus();
}

if (menu && nav) {
  if (!nav.id) nav.id = 'site-navigation';
  menu.setAttribute('aria-controls', nav.id);
  setNavigationOpen(nav.classList.contains('open'));
  menu.addEventListener('click', () => setNavigationOpen(!nav.classList.contains('open')));
  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setNavigationOpen(false)));
}

const box = document.getElementById('lightbox');
const boxImg = document.getElementById('lightbox-image');
const close = document.querySelector('.lightbox-close');
let imageTrigger = null;
let previousOverflow = '';
const backgroundState = new Map();

if (box) {
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'Project photo viewer');
  box.tabIndex = -1;
}

function openImage(src, alt = 'Project photo', trigger = document.activeElement) {
  if (!box || !boxImg || !src) return;
  if (!box.classList.contains('open')) {
    imageTrigger = trigger;
    previousOverflow = document.body.style.overflow;
    for (const element of document.body.children) {
      if (element === box || element.contains(box) || element.matches('script, style, link')) continue;
      backgroundState.set(element, element.hasAttribute('inert'));
      element.setAttribute('inert', '');
    }
  }
  boxImg.src = src;
  boxImg.alt = alt;
  box.classList.add('open');
  box.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  (close || box).focus();
}

function closeImage() {
  if (!box?.classList.contains('open')) return;
  box.classList.remove('open');
  box.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = previousOverflow;
  for (const [element, wasInert] of backgroundState) {
    if (!wasInert) element.removeAttribute('inert');
  }
  backgroundState.clear();
  if (imageTrigger?.isConnected && typeof imageTrigger.focus === 'function') {
    imageTrigger.focus({ preventScroll: true });
  }
  imageTrigger = null;
}

document.querySelectorAll('[data-full]').forEach(element => {
  element.addEventListener('click', event => {
    event.preventDefault();
    openImage(element.dataset.full, element.querySelector('img')?.alt || 'Project photo', element);
  });
});
close?.addEventListener('click', closeImage);
box?.addEventListener('click', event => { if (event.target === box) closeImage(); });

document.addEventListener('focusin', event => {
  if (box?.classList.contains('open') && !box.contains(event.target)) (close || box).focus();
});
document.addEventListener('keydown', event => {
  if (box?.classList.contains('open')) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeImage();
    } else if (event.key === 'Tab') {
      const focusable = [...box.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter(element => !element.disabled && !element.closest('[hidden], [inert]'));
      const first = focusable[0] || box;
      const last = focusable[focusable.length - 1] || box;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === box)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === box)) {
        event.preventDefault();
        first.focus();
      }
    }
  } else if (event.key === 'Escape' && nav?.classList.contains('open')) {
    event.preventDefault();
    setNavigationOpen(false, true);
  }
});

const filters = document.querySelectorAll('.filter-button');
const cards = document.querySelectorAll('.gallery-card');
filters.forEach(button => {
  button.setAttribute('aria-pressed', String(button.classList.contains('active')));
  button.addEventListener('click', () => {
    filters.forEach(other => {
      other.classList.toggle('active', other === button);
      other.setAttribute('aria-pressed', String(other === button));
    });
    cards.forEach(card => card.classList.toggle('hide', button.dataset.filter !== 'all' && card.dataset.category !== button.dataset.filter));
  });
});

document.querySelectorAll('video').forEach(video => {
  video.addEventListener('play', () => document.querySelectorAll('video').forEach(other => { if (other !== video) other.pause(); }));
  video.addEventListener('error', () => console.warn('Video could not load:', video.currentSrc));
});

const form = document.getElementById('quote');
if (form) {
  const name = document.getElementById('quoteName');
  const phone = document.getElementById('quotePhone');
  const service = document.getElementById('quoteService');
  const message = document.getElementById('quoteMessage');
  const status = document.getElementById('quoteStatus');
  const continueLink = document.getElementById('quoteContinue');
  const required = [[name, 'Please enter your name.'], [phone, 'Please enter your phone number.'], [service, 'Please choose a service.']];

  function clearPreparedMessage() {
    if (status) status.textContent = '';
    if (continueLink) {
      continueLink.hidden = true;
      continueLink.removeAttribute('href');
    }
  }

  // Native required validation remains available when JavaScript is unavailable.
  form.noValidate = true;
  [name, phone, service, message].forEach(field => {
    ['input', 'change'].forEach(type => field.addEventListener(type, () => {
      field.setCustomValidity('');
      field.removeAttribute('aria-invalid');
      clearPreparedMessage();
    }));
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    clearPreparedMessage();
    required.forEach(([field]) => { field.setCustomValidity(''); field.removeAttribute('aria-invalid'); });
    const invalid = required.find(([field]) => !field.value.trim());
    if (invalid) {
      const [field, error] = invalid;
      field.setCustomValidity(error);
      field.setAttribute('aria-invalid', 'true');
      if (status) status.textContent = error;
      field.focus();
      field.reportValidity();
      return;
    }
    const text = `Hello RONMAXAKS, my name is ${name.value.trim()}. I need a quote for ${service.value.trim()}. My phone number is ${phone.value.trim()}. ${message.value.trim()}`.trim();
    const url = 'https://wa.me/27738932997?text=' + encodeURIComponent(text);
    if (continueLink) { continueLink.href = url; continueLink.hidden = false; }
    if (status) status.textContent = 'Your quote message is ready. Review and send it in WhatsApp. If WhatsApp did not open, use the link below.';
    // noopener can return null even after a successful open. Keep the visible link.
    try { window.open(url, '_blank', 'noopener,noreferrer'); } catch (_) { /* The visible link remains available. */ }
  });
}
