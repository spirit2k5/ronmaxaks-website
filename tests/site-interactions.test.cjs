const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const siteRoot = path.resolve(__dirname, '..');
const scriptPath = process.env.RONMAXAKS_SCRIPT
  ? path.resolve(process.env.RONMAXAKS_SCRIPT)
  : path.join(siteRoot, 'assets/js/main.js');
const script = fs.readFileSync(scriptPath, 'utf8');

// Actual site markup and script, with network/navigation deliberately disabled.
// These DOM regressions do not constitute visual or physical-browser testing.
function page(t, filename = 'gallery.html', beforeScript = () => {}) {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(fs.readFileSync(path.join(siteRoot, filename), 'utf8'), {
    url: `https://ronmaxaks.com/${filename}`,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
  t.after(() => dom.window.close());
  const { window } = dom;
  const { document } = window;
  const opens = [];
  const pauses = [];
  window.open = (...args) => { opens.push(args); return null; };
  window.fetch = () => { throw new Error('Unexpected external request in DOM regression'); };
  window.HTMLMediaElement.prototype.pause = function () { pauses.push(this); };
  for (const prototype of [window.HTMLInputElement.prototype, window.HTMLSelectElement.prototype,
    window.HTMLTextAreaElement.prototype, window.HTMLFormElement.prototype]) {
    prototype.reportValidity = function () { return this.checkValidity(); };
  }
  document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', event => event.preventDefault());
  });
  beforeScript(document, window);
  window.eval(script);
  return { window, document, opens, pauses };
}

function key(window, element, name, options = {}) {
  const event = new window.KeyboardEvent('keydown', {
    key: name, bubbles: true, cancelable: true, ...options,
  });
  element.dispatchEvent(event);
  return event;
}

function openFirstPhoto(context) {
  const trigger = context.document.querySelector('[data-full]');
  assert.ok(trigger, 'The actual gallery should contain photo triggers');
  trigger.focus();
  trigger.click();
  return {
    trigger,
    box: context.document.getElementById('lightbox'),
    image: context.document.getElementById('lightbox-image'),
    close: context.document.querySelector('.lightbox-close'),
  };
}

function validQuote(context) {
  const { document } = context;
  document.getElementById('quoteName').value = '  Alex & Co <North>  ';
  document.getElementById('quotePhone').value = '  +27 73 000 0000  ';
  document.getElementById('quoteService').value = 'Access Control & Biometrics';
  document.getElementById('quoteMessage').value = '  Gate & CCTV?\nA/B #1 = priority  ';
}

function submitQuote(context) {
  const event = new context.window.Event('submit', { bubbles: true, cancelable: true });
  context.document.getElementById('quote').dispatchEvent(event);
  assert.equal(event.defaultPrevented, true, 'The site handles quote preparation without a form navigation');
}

test('mobile navigation exposes matching expanded state and action label', t => {
  const { document } = page(t);
  const menu = document.querySelector('.menu-button');
  const nav = document.querySelector('.nav-links');
  menu.click();
  assert.equal(nav.classList.contains('open'), true);
  assert.equal(menu.getAttribute('aria-expanded'), 'true');
  assert.equal(menu.getAttribute('aria-label'), 'Close navigation');
  menu.click();
  assert.equal(nav.classList.contains('open'), false);
  assert.equal(menu.getAttribute('aria-expanded'), 'false');
  assert.equal(menu.getAttribute('aria-label'), 'Open navigation');
});

test('choosing a navigation link retires both visual and accessible open state', t => {
  const { document } = page(t);
  const menu = document.querySelector('.menu-button');
  const nav = document.querySelector('.nav-links');
  menu.click();
  nav.querySelector('a').click();
  assert.equal(nav.classList.contains('open'), false);
  assert.equal(menu.getAttribute('aria-expanded'), 'false');
  assert.equal(menu.getAttribute('aria-label'), 'Open navigation');
});

test('Escape closes navigation and returns keyboard focus to its toggle', t => {
  const { document, window } = page(t);
  const menu = document.querySelector('.menu-button');
  const nav = document.querySelector('.nav-links');
  menu.click();
  nav.querySelector('a').focus();
  key(window, document.activeElement, 'Escape');
  assert.equal(nav.classList.contains('open'), false);
  assert.equal(menu.getAttribute('aria-expanded'), 'false');
  assert.equal(document.activeElement, menu);
});

test('opening a real gallery image produces a named modal and preserves the photo', t => {
  const context = page(t);
  const { trigger, box, image, close } = openFirstPhoto(context);
  assert.equal(box.classList.contains('open'), true);
  assert.equal(box.getAttribute('aria-hidden'), 'false');
  assert.equal(box.getAttribute('role'), 'dialog');
  assert.equal(box.getAttribute('aria-modal'), 'true');
  const label = box.getAttribute('aria-label');
  const labelledBy = box.getAttribute('aria-labelledby');
  assert.ok(label?.trim() || (labelledBy && context.document.getElementById(labelledBy)?.textContent.trim()),
    'The image dialog must have an accessible name');
  assert.equal(context.document.activeElement, close);
  assert.equal(image.getAttribute('src'), trigger.dataset.full);
  assert.equal(image.alt, trigger.querySelector('img').alt);
});

test('Tab and Shift+Tab stay within the image dialog instead of reaching the page', t => {
  const context = page(t);
  const { close } = openFirstPhoto(context);
  for (const shiftKey of [false, true]) {
    const event = key(context.window, close, 'Tab', { shiftKey });
    assert.equal(event.defaultPrevented, true, 'The single modal control wraps its keyboard focus');
    assert.equal(context.document.activeElement, close);
  }
});

test('image modal makes background content inert and restores prior inert state', t => {
  const context = page(t, 'gallery.html', document => {
    const header = document.querySelector('header');
    header.inert = true;
    header.setAttribute('inert', '');
  });
  const { close } = openFirstPhoto(context);
  const main = context.document.querySelector('main');
  assert.ok(main.inert || main.hasAttribute('inert'), 'The page behind the image is inert');
  close.click();
  assert.equal(Boolean(main.inert || main.hasAttribute('inert')), false);
  const header = context.document.querySelector('header');
  assert.ok(header.inert || header.hasAttribute('inert'), 'Previously inert content must remain inert');
});

test('programmatic focus leaving the open image dialog is returned to its control', t => {
  const context = page(t);
  const { close } = openFirstPhoto(context);
  context.document.querySelector('.nav-links a').focus();
  assert.equal(context.document.activeElement, close);
});

test('closing an image with Escape restores initiating focus and previous scrolling', t => {
  const context = page(t, 'gallery.html', document => { document.body.style.overflow = 'clip'; });
  const { trigger, box, close } = openFirstPhoto(context);
  assert.equal(context.document.body.style.overflow, 'hidden');
  key(context.window, close, 'Escape');
  assert.equal(box.classList.contains('open'), false);
  assert.equal(box.getAttribute('aria-hidden'), 'true');
  assert.equal(context.document.activeElement, trigger);
  assert.equal(context.document.body.style.overflow, 'clip');
});

test('photo clicks keep the viewer open while a backdrop click closes it', t => {
  const context = page(t);
  const { trigger, box, image } = openFirstPhoto(context);
  image.click();
  assert.equal(box.classList.contains('open'), true);
  box.dispatchEvent(new context.window.MouseEvent('click', { bubbles: true }));
  assert.equal(box.classList.contains('open'), false);
  assert.equal(context.document.activeElement, trigger);
});

test('gallery filters keep visible categories and pressed states in agreement', t => {
  const { document } = page(t);
  const all = document.querySelector('[data-filter="all"]');
  const cctv = document.querySelector('[data-filter="cctv"]');
  assert.equal(all.getAttribute('aria-pressed'), 'true');
  cctv.click();
  assert.equal(cctv.getAttribute('aria-pressed'), 'true');
  assert.equal(all.getAttribute('aria-pressed'), 'false');
  const visible = [...document.querySelectorAll('.gallery-card')]
    .filter(card => !card.hidden && !card.classList.contains('hide'));
  assert.ok(visible.length > 0);
  assert.ok(visible.every(card => card.dataset.category === 'cctv'));
  all.click();
  assert.equal(all.getAttribute('aria-pressed'), 'true');
  assert.ok([...document.querySelectorAll('.gallery-card')]
    .every(card => !card.hidden && !card.classList.contains('hide')));
});

for (const [field, value] of [['quoteName', '   '], ['quotePhone', '\t  '], ['quoteService', '']]) {
  test(`quote preparation rejects an empty-looking ${field} before any external opening`, t => {
    const context = page(t, 'contact.html');
    validQuote(context);
    const input = context.document.getElementById(field);
    input.value = value;
    submitQuote(context);
    assert.equal(context.opens.length, 0);
    assert.equal(input.getAttribute('aria-invalid'), 'true');
    assert.equal(context.document.activeElement, input);
    const link = context.document.getElementById('quoteContinue');
    assert.ok(!link || link.hidden || !link.hasAttribute('href'));
    assert.ok(context.document.getElementById('quoteStatus')?.textContent.trim(), 'Validation explains the correction needed');
  });
}

test('editing an invalid field clears stale custom validity and accessible error state', t => {
  const context = page(t, 'contact.html');
  validQuote(context);
  const name = context.document.getElementById('quoteName');
  name.value = '   ';
  submitQuote(context);
  assert.equal(name.getAttribute('aria-invalid'), 'true');
  name.value = 'Alex';
  name.dispatchEvent(new context.window.Event('input', { bubbles: true }));
  assert.equal(name.validationMessage, '');
  assert.notEqual(name.getAttribute('aria-invalid'), 'true');
});

test('a valid trimmed quote prepares one encoded WhatsApp message plus a visible fallback', t => {
  const context = page(t, 'contact.html');
  validQuote(context);
  submitQuote(context);
  assert.equal(context.opens.length, 1, 'A valid submit attempts one WhatsApp review window');
  const url = new URL(context.opens[0][0]);
  assert.equal(url.origin, 'https://wa.me');
  assert.equal(url.pathname, '/27738932997');
  assert.equal(url.hash, '');
  assert.deepEqual([...url.searchParams.keys()], ['text']);
  const text = url.searchParams.get('text');
  for (const expected of ['Alex & Co <North>', '+27 73 000 0000', 'Access Control & Biometrics', 'Gate & CCTV?\nA/B #1 = priority']) {
    assert.ok(text.includes(expected), `Prepared message preserves ${expected}`);
  }
  assert.ok(!text.includes('  Alex') && !text.includes('priority  '), 'Outer whitespace is trimmed');
  const link = context.document.getElementById('quoteContinue');
  assert.ok(link && !link.hidden, 'The prepared message remains available if a new window does not appear');
  assert.equal(link.href, url.href);
  assert.equal(link.target, '_blank');
  assert.ok(link.rel.includes('noopener'));
  const status = context.document.getElementById('quoteStatus').textContent;
  assert.match(status, /WhatsApp/i);
  assert.match(status, /review|ready|continue/i);
  assert.doesNotMatch(status, /(?:message|request|quote)\s+(?:has\s+been\s+)?sent|popup\s+(?:was\s+)?blocked/i,
    'A noopener null return proves neither a blocked popup nor a sent message');
});

test('editing any quote field retires the old prepared contact URL', t => {
  const context = page(t, 'contact.html');
  for (const [id, eventName] of [['quoteName', 'input'], ['quotePhone', 'input'], ['quoteService', 'change'], ['quoteMessage', 'input']]) {
    validQuote(context);
    submitQuote(context);
    const link = context.document.getElementById('quoteContinue');
    assert.ok(link && !link.hidden);
    context.document.getElementById(id).dispatchEvent(new context.window.Event(eventName, { bubbles: true }));
    assert.equal(link.hidden, true, `${id} change hides a message based on old details`);
    assert.equal(link.hasAttribute('href'), false, `${id} change removes its actionable old URL`);
  }
});

test('contact fields provide appropriate mobile and autofill hints without inventing phone eligibility', t => {
  const { document } = page(t, 'contact.html');
  const name = document.getElementById('quoteName');
  const phone = document.getElementById('quotePhone');
  assert.equal(name.autocomplete, 'name');
  assert.equal(phone.type, 'tel');
  assert.equal(phone.autocomplete, 'tel');
  assert.equal(phone.inputMode, 'tel');
  assert.equal(phone.hasAttribute('pattern'), false, 'Do not exclude legitimate international/local numbers with an invented pattern');
});
