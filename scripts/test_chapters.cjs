/* DOM integration checks; rendered desktop/mobile checks are separate. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require(process.env.TEST_JSDOM_PATH || '../planning/test-runtime/node_modules/jsdom');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const data = JSON.parse(read('data/homes.json'));
const tick = () => new Promise(resolve => setTimeout(resolve, 25));
async function setup(page = 'future.html', { query = '', fail = false } = {}) {
  const dom = new JSDOM(read(page), { url: `https://example.test/to-my-love/${page}${query}`, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.fetch = async () => ({ ok: !fail, status: fail ? 503 : 200, json: async () => structuredClone(data) });
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new window.Event('close')); };
  window.pausedMedia = new WeakSet();
  window.HTMLMediaElement.prototype.pause = function () { window.pausedMedia.add(this); };
  window.console.error = () => {};
  window.eval(read('chapters.js'));
  if (page === 'future.html') window.eval(read('future.js'));
  await tick(); return dom;
}

test('side menu preserves album DOM, query/hash, and viewer navigation state', async () => {
  const dom = await setup('index.html', { query: '?topic=water#photo-eafc9b315fb5' });
  const { window: win } = dom, doc = win.document;
  const mainBefore = doc.querySelector('main').innerHTML;
  const initial = win.location.href;
  win.history.replaceState({ albumViewer: true }, '', initial);
  doc.querySelector('.chapters-toggle').click();
  assert.equal(doc.querySelector('#chapters-menu').open, true);
  assert.equal(doc.querySelector('.chapters-toggle').getAttribute('aria-expanded'), 'true');
  assert.ok(doc.documentElement.classList.contains('chapters-menu-open'));
  for (const media of doc.querySelectorAll('video, audio')) assert.ok(win.pausedMedia.has(media));
  const links = [...doc.querySelectorAll('#chapters-menu nav a')];
  assert.deepEqual(links.map(a => a.getAttribute('href')), ['index.html', 'calendar.html', 'future.html']);
  assert.equal(links[0].getAttribute('aria-current'), 'page');
  doc.querySelector('.chapters-close').click();
  assert.equal(doc.querySelector('#chapters-menu').open, false);
  assert.equal(doc.documentElement.classList.contains('chapters-menu-open'), false);
  assert.equal(doc.activeElement, doc.querySelector('.chapters-toggle'));
  assert.equal(win.location.href, initial);
  assert.equal(win.history.state.albumViewer, true);
  assert.equal(doc.querySelector('main').innerHTML, mainBefore);
  win.close();
});

test('five housing candidates and a watch candidate retain price provenance and Naver labels', async () => {
  const dom = await setup(), doc = dom.window.document;
  assert.equal(doc.querySelectorAll('.home-card').length, 6);
  assert.equal(doc.querySelectorAll('.home-card.is-watch').length, 1);
  assert.match(doc.querySelector('#homes-note').textContent, /현재 매물을 뜻하지/);
  for (const home of data.homes) {
    const card = doc.querySelector(`#home-${home.id}`);
    const naver = card.querySelector('.home-nav-link');
    assert.equal(naver.href, home.naverUrl);
    assert.equal(naver.target, '_blank'); assert.match(naver.rel, /noopener/);
    assert.ok(naver.textContent.includes(home.naverLinkLabel));
    assert.equal(card.querySelectorAll('.home-price').length, home.prices.length);
    for (const price of home.prices) {
      assert.ok(card.textContent.includes(price.label));
      assert.ok(card.textContent.includes(price.date));
      if (price.note) assert.ok(card.textContent.includes(price.note));
    }
  }
  for (const link of doc.querySelectorAll('a[target="_blank"]')) {
    assert.equal(new URL(link.href).protocol, 'https:');
    assert.match(link.rel, /noreferrer/);
  }
  assert.equal(doc.querySelector('#homes-grid').getAttribute('aria-busy'), 'false');
  dom.window.close();
});

test('environment filters select actual candidates and preserve shareable state', async () => {
  const dom = await setup('future.html', { query: '?setting=%ED%98%B8%EC%88%98#homes' });
  const doc = dom.window.document;
  assert.equal(doc.querySelectorAll('.home-card').length, 2);
  assert.equal(doc.querySelector('[data-setting="호수"]').getAttribute('aria-pressed'), 'true');
  doc.querySelector('[data-setting="바다"]').click();
  assert.equal(doc.querySelectorAll('.home-card').length, 1);
  assert.ok(doc.querySelector('#home-blue-ma-city-prugio-1'));
  assert.equal(new URL(dom.window.location.href).searchParams.get('setting'), '바다');
  assert.equal(dom.window.location.hash, '#homes');
  doc.querySelector('[data-setting="all"]').click();
  assert.equal(doc.querySelectorAll('.home-card').length, 6);
  assert.equal(new URL(dom.window.location.href).searchParams.has('setting'), false);
  dom.window.close();
});

test('housing load failures can recover without disabling the side navigation', async () => {
  const dom = await setup('future.html', { fail: true }), doc = dom.window.document;
  assert.ok(doc.querySelector('#homes-message button'));
  doc.querySelector('.chapters-toggle').click(); assert.ok(doc.querySelector('#chapters-menu').open);
  doc.querySelector('.chapters-close').click();
  dom.window.fetch = async () => ({ ok: true, json: async () => structuredClone(data) });
  doc.querySelector('#homes-message button').click(); await tick();
  assert.equal(doc.querySelectorAll('.home-card').length, 6);
  assert.equal(doc.querySelector('#homes-message').textContent, '');
  dom.window.close();
});
