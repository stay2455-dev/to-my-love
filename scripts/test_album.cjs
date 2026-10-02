/* DOM-only integration checks. This is not a rendered-browser or device test.
   npm install --prefix planning/test-runtime jsdom@26.1.0
   node --test scripts/test_album.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../planning/test-runtime/node_modules/jsdom');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data/memories.json'), 'utf8'));
const tick = () => new Promise(resolve => setTimeout(resolve, 25));

async function setup({ hash = '', fail = false } = {}) {
  const dom = new JSDOM(html, { url: `https://example.test/to-my-love/${hash}`, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.fetch = async () => fail ? { ok: false, status: 503 } : { ok: true, json: async () => structuredClone(data) };
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.HTMLElement.prototype.scrollTo = function () {};
  window.scrollTo = function () {};
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  window.HTMLMediaElement.prototype.pause = function () { this.dataset.paused = 'true'; };
  window.HTMLMediaElement.prototype.load = function () {};
  window.console.error = () => {};
  window.eval(source);
  await tick();
  return dom;
}

test('all 201 unique files are accounted for, ordered, local and metadata-safe in the manifest', () => {
  assert.equal(data.items.length, 201);
  assert.equal(new Set(data.items.map(x => x.id)).size, 201);
  assert.equal(data.items.filter(x => x.kind === 'image').length, 192);
  assert.equal(data.items.filter(x => x.kind === 'image' && x.date).length, 177);
  assert.equal(data.items.filter(x => x.kind === 'image' && !x.date).length, 15);
  assert.equal(data.items.filter(x => x.kind === 'video').length, 9);
  const dates = data.items.filter(x => x.date).map(x => x.date);
  assert.deepEqual(dates, [...dates].sort());
  assert.deepEqual(data.range, ['2024-04-08', '2026-05-24']);
  for (const item of data.items) {
    for (const key of ['src', 'thumb']) {
      assert.match(item[key], /^assets\/album\/[a-z]+\/[a-f0-9]{12}\.(webp|mp4)$/);
      assert.ok(fs.statSync(path.join(root, item[key])).size > 100);
    }
    assert.ok(item.width > 0 && item.height > 0);
    assert.equal(item.source, undefined);
    assert.equal(item.hasGps, undefined);
    if (item.date) assert.match(item.date, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('17 chronological months and year filters preserve the full archive', async () => {
  const dom = await setup();
  const doc = dom.window.document;
  const months = [...doc.querySelectorAll('.memory-month')];
  assert.equal(months.length, 17);
  assert.deepEqual(months.map(x => x.id), months.map(x => x.id).sort());
  assert.equal(doc.querySelector('#album-count').textContent, '전체 177장');
  for (const year of ['2024', '2025', '2026', 'all']) {
    doc.querySelector(`button[data-year="${year}"]`).click();
    assert.equal(doc.querySelectorAll('.year-tabs [aria-pressed="true"]').length, 1);
    const visible = months.filter(x => !x.hidden);
    assert.ok(visible.length > 0);
    assert.ok(visible.every(x => year === 'all' || x.dataset.year === year));
  }
  assert.equal(doc.querySelectorAll('#collected-grid .photo-card').length, 15);
  assert.equal(doc.querySelectorAll('#film-grid .film-card').length, 9);
  dom.window.close();
});

test('expanding every month gives exactly the 177 dated photographs in capture order', async () => {
  const dom = await setup();
  const doc = dom.window.document;
  doc.querySelectorAll('.expand-button').forEach(button => button.click());
  const shown = [...doc.querySelectorAll('#timeline [data-memory]')].map(x => x.dataset.memory);
  assert.deepEqual(shown, data.items.filter(x => x.kind === 'image' && x.date).map(x => x.id));
  const may = doc.querySelector('#month-2024-05');
  assert.equal(may.querySelectorAll('.photo-card').length, 28);
  may.querySelector('.expand-button').click();
  assert.equal(may.querySelectorAll('.photo-card').length, 4);
  assert.equal(may.querySelector('.expand-button').getAttribute('aria-expanded'), 'false');
  dom.window.close();
});

test('viewer opens correct photograph, supports arrows, thumbnails, history and focus restoration', async () => {
  const dom = await setup();
  const { document: doc } = dom.window;
  const trigger = doc.querySelector('#month-2024-04 .photo-open');
  trigger.focus(); trigger.click();
  const viewer = doc.querySelector('#viewer');
  assert.ok(viewer.open);
  assert.equal(doc.querySelector('#viewer-position').textContent, '1 / 9');
  assert.equal(doc.querySelector('#viewer-date').textContent, '2024. 04. 08');
  assert.ok(doc.querySelector('#viewer-prev').disabled);
  doc.querySelector('#viewer-next').click();
  assert.equal(doc.querySelector('#viewer-position').textContent, '2 / 9');
  viewer.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(doc.querySelector('#viewer-position').textContent, '3 / 9');
  doc.querySelector('#viewer-strip button:last-child').click();
  assert.ok(doc.querySelector('#viewer-next').disabled);
  assert.equal(doc.querySelectorAll('#viewer-strip [aria-current="true"]').length, 1);
  assert.equal(doc.querySelector('#viewer-strip').children.length, 9);
  doc.querySelector('#viewer-close').click();
  await tick();
  assert.ok(!viewer.open);
  assert.equal(doc.activeElement, trigger);
  assert.ok(!doc.body.classList.contains('viewer-open'));
  assert.equal(doc.querySelector('#viewer-media').children.length, 0);
  dom.window.close();
});

test('undated photos have no fabricated date; clips have native controls and no autoplay', async () => {
  const dom = await setup();
  const doc = dom.window.document;
  doc.querySelector('#collected-grid button').click();
  assert.equal(doc.querySelector('#viewer-date').textContent, '');
  assert.equal(doc.querySelector('#viewer-title').textContent, '모아둔 사진');
  doc.querySelector('#viewer-close').click();
  await tick();
  doc.querySelector('#film-grid button').click();
  const video = doc.querySelector('#viewer-media video');
  assert.ok(video.controls);
  assert.ok(video.playsInline);
  assert.equal(video.autoplay, false);
  assert.equal(video.preload, 'metadata');
  doc.querySelector('#viewer-next').click();
  assert.equal(video.dataset.paused, 'true');
  assert.ok(!video.hasAttribute('src'));
  doc.querySelector('#viewer-close').click();
  await tick();
  assert.equal(doc.querySelector('#viewer-media').children.length, 0);
  dom.window.close();
});

test('direct photo links and escape close without leaving the website', async () => {
  const dom = await setup({ hash: '#photo-eafc9b315fb5' });
  const doc = dom.window.document;
  assert.ok(doc.querySelector('#viewer').open);
  assert.match(doc.querySelector('#viewer-media img').src, /eafc9b315fb5.webp$/);
  doc.querySelector('#viewer').dispatchEvent(new dom.window.Event('cancel', { cancelable: true }));
  assert.ok(!doc.querySelector('#viewer').open);
  assert.equal(dom.window.location.hash, '#album');
  dom.window.close();
});

test('load failure has an accessible retry and can recover', async () => {
  const dom = await setup({ fail: true });
  const doc = dom.window.document;
  assert.ok(doc.querySelector('[role="alert"] .retry-button'));
  assert.equal(doc.querySelector('#timeline').getAttribute('aria-busy'), 'false');
  dom.window.fetch = async () => ({ ok: true, json: async () => structuredClone(data) });
  doc.querySelector('.retry-button').click();
  await tick();
  assert.equal(doc.querySelectorAll('.memory-month').length, 17);
  dom.window.close();
});
