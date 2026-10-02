/* DOM-only checks. No rendered browser or device playback is claimed. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../planning/test-runtime/node_modules/jsdom');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const experience = fs.readFileSync(path.join(root, 'experience.js'), 'utf8');
const archive = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data/memories.json'), 'utf8'));
const keepsakes = JSON.parse(fs.readFileSync(path.join(root, 'data/keepsakes.json'), 'utf8'));
const $ = (doc, selector) => doc.querySelector(selector);
const $$ = (doc, selector) => [...doc.querySelectorAll(selector)];
const tick = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));

async function setup({ location = '', reduced = true, fail = false } = {}) {
  const dom = new JSDOM(html, { url: `https://example.test/to-my-love/${location}`, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.fetch = async () => fail ? { ok: false, status: 503 } : { ok: true, json: async () => structuredClone(data) };
  window.matchMedia = () => ({ matches: reduced });
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.HTMLElement.prototype.scrollTo = function () {};
  window.scrollTo = function () {};
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  window.HTMLMediaElement.prototype.pause = function () { this.dataset.paused = 'true'; };
  window.HTMLMediaElement.prototype.load = function () { this.dataset.loaded = 'true'; };
  window.HTMLMediaElement.prototype.play = function () {
    this.dataset.played = String(Number(this.dataset.played || 0) + 1);
    this.dispatchEvent(new window.Event('play')); return Promise.resolve();
  };
  window.console.error = () => {};
  window.eval(experience); window.eval(archive); await tick();
  return dom;
}

test('cover is the first screen, opens without motion when requested, and is reusable', async () => {
  const dom = await setup(); const doc = dom.window.document;
  const cover = $(doc, '#top'), book = $(doc, '#open-album');
  assert.ok(!cover.hidden); assert.equal($(doc, '#feature-video').dataset.played, undefined);
  book.click(); assert.ok(cover.hidden); assert.equal(doc.activeElement.id, 'keepsakes-title');
  assert.equal(dom.window.location.hash, '#keepsakes');
  $(doc, '.site-footer a').click(); assert.ok(!cover.hidden); assert.equal(doc.activeElement, book);
  assert.equal(dom.window.location.hash, '#top');
  book.click(); assert.ok(cover.hidden); assert.ok(!book.hasAttribute('aria-busy'));
  dom.window.close();
});

test('cover animation cannot duplicate transitions and a skip link cancels a pending opening', async () => {
  const dom = await setup({ reduced: false }); const doc = dom.window.document;
  const book = $(doc, '#open-album'); book.click(); book.click();
  assert.ok(book.classList.contains('is-opening')); assert.ok(!$(doc, '#top').hidden);
  $(doc, '.skip-link').click(); await tick(900);
  assert.ok($(doc, '#top').hidden); assert.equal(dom.window.location.hash, '#album');
  assert.ok(!book.hasAttribute('aria-busy')); assert.ok(!book.classList.contains('is-opening'));
  dom.window.close();
});

test('ordinary cover animation finishes, while incoming archive links bypass it', async () => {
  const dom = await setup({ reduced: false }); const doc = dom.window.document;
  $(doc, '#open-album').click(); await tick(900);
  assert.ok($(doc, '#top').hidden); assert.equal(dom.window.location.hash, '#keepsakes');
  dom.window.close();
  const linked = await setup({ location: '?topic=water#album' });
  assert.ok($(linked.window.document, '#top').hidden);
  assert.equal($(linked.window.document, '#topic-tabs [aria-pressed="true"]').dataset.category, 'water');
  linked.window.close();
});

test('five completed montages keep full images and all public references resolve locally', () => {
  const dom = new JSDOM(html); const doc = dom.window.document;
  assert.equal(keepsakes.montages.length, 5); assert.equal(keepsakes.films.length, 2);
  assert.deepEqual($$(doc, '[data-keepsake]').map(x => x.dataset.keepsake), keepsakes.montages.map(x => x.id));
  for (const element of $$(doc, '[src], [poster], link[href], a[href]')) {
    for (const attr of ['src', 'poster', 'href']) {
      const value = element.getAttribute(attr); if (!value || value.startsWith('#') || value.startsWith('http')) continue;
      assert.ok(fs.existsSync(path.join(root, value.split('?')[0])), value);
    }
  }
  for (const item of keepsakes.films) {
    const bytes = fs.readFileSync(path.join(root, item.src));
    assert.ok(bytes.length < 100 * 1024 * 1024);
    assert.ok(bytes.indexOf(Buffer.from('moov')) < bytes.indexOf(Buffer.from('mdat')));
    assert.ok(bytes.includes(Buffer.from('Alexander Holm')));
  }
  const ids = $$(doc, '[id]').map(x => x.id); assert.equal(new Set(ids).size, ids.length);
  dom.window.close();
});

test('montage navigation uses one history entry and closing restores focus and scroll styles', async () => {
  const dom = await setup({ location: '#keepsakes' }); const doc = dom.window.document;
  const trigger = $(doc, '[data-keepsake="together"]'); trigger.click();
  assert.ok($(doc, '#keepsake-viewer').open); assert.equal(doc.body.style.position, 'fixed');
  assert.equal($(doc, '#keepsake-position').textContent, '1 / 5');
  assert.ok($(doc, '#keepsake-prev').disabled);
  for (let i = 0; i < 4; i++) $(doc, '#keepsake-next').click();
  assert.equal($(doc, '#keepsake-position').textContent, '5 / 5');
  assert.ok($(doc, '#keepsake-next').disabled);
  $(doc, '#keepsake-viewer').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  assert.equal($(doc, '#keepsake-position').textContent, '4 / 5');
  $(doc, '#keepsake-viewer').dispatchEvent(new dom.window.Event('cancel', { cancelable: true })); await tick();
  assert.ok(!$(doc, '#keepsake-viewer').open); assert.equal(dom.window.location.hash, '#keepsakes');
  assert.equal(doc.body.style.position, ''); assert.equal(doc.activeElement, trigger);
  assert.ok(!$(doc, '#viewer').open); dom.window.close();
});

test('direct montage and original photo links coexist without opening both viewers', async () => {
  const dom = await setup({ location: '#keepsake-spring' }); const doc = dom.window.document;
  assert.ok($(doc, '#keepsake-viewer').open); assert.ok(!$(doc, '#viewer').open);
  $(doc, '#keepsake-close').click(); assert.ok(!$(doc, '#keepsake-viewer').open);
  assert.equal(dom.window.location.hash, '#keepsakes'); dom.window.close();
  const photo = await setup({ location: '#photo-d008fa9dc488' });
  assert.ok($(photo.window.document, '#viewer').open); assert.ok(!$(photo.window.document, '#keepsake-viewer').open);
  assert.ok($(photo.window.document, '#top').hidden); photo.window.close();
});

test('feature film needs a play gesture, selection stays silent, and previous positions resume', async () => {
  const dom = await setup({ location: '#feature' }); const doc = dom.window.document;
  const video = $(doc, '#feature-video');
  assert.ok(video.controls && video.playsInline); assert.ok(!video.autoplay); assert.equal(video.preload, 'none');
  assert.equal(video.dataset.played, undefined); $(doc, '#feature-play').click(); await tick();
  assert.equal(video.dataset.played, '1'); assert.ok($(doc, '#feature-play').hidden);
  video.currentTime = 75;
  $(doc, '[data-feature="our-days"]').click();
  assert.match(video.src, /our-days\.mp4$/); assert.equal(video.dataset.paused, 'true');
  assert.equal(video.dataset.played, '1'); assert.equal($(doc, '#feature-duration').textContent, '8:30');
  $(doc, '[data-feature="promise-174"]').click();
  Object.defineProperty(video, 'duration', { value: 174 });
  video.dispatchEvent(new dom.window.Event('loadedmetadata'));
  assert.equal(video.currentTime, 75); assert.equal(video.dataset.played, '1');
  video.dispatchEvent(new dom.window.Event('ended'));
  assert.ok(!$(doc, '#film-ending').hidden); assert.ok(!$(doc, '#feature-play').hidden);
  dom.window.close();
});

test('film audio pauses for either viewer, another video, backgrounding, and closing the book', async () => {
  const dom = await setup({ location: '#album' }); const doc = dom.window.document;
  const feature = $(doc, '#feature-video');
  $(doc, '#story-grid button').click(); await tick(); assert.equal(feature.dataset.paused, 'true');
  $(doc, '#viewer-close').click(); await tick();
  delete feature.dataset.paused;
  $(doc, '[data-keepsake="seaside"]').click(); assert.equal(feature.dataset.paused, 'true');
  $(doc, '#keepsake-close').click(); await tick();
  delete feature.dataset.paused;
  const other = doc.createElement('video'); doc.body.append(other); await other.play();
  assert.equal(feature.dataset.paused, 'true'); delete feature.dataset.paused;
  Object.defineProperty(doc, 'hidden', { value: true }); doc.dispatchEvent(new dom.window.Event('visibilitychange'));
  assert.equal(feature.dataset.paused, 'true'); delete feature.dataset.paused;
  $(doc, '.site-footer a').click(); assert.equal(feature.dataset.paused, 'true');
  dom.window.close();
});

test('archive network failure does not block the cover, montages, or finished films', async () => {
  const dom = await setup({ fail: true }); const doc = dom.window.document;
  $(doc, '#open-album').click(); assert.ok($(doc, '#top').hidden);
  $(doc, '[data-keepsake="together"]').click(); assert.ok($(doc, '#keepsake-viewer').open);
  $(doc, '#keepsake-close').click(); await tick();
  const video = $(doc, '#feature-video');
  video.play = async () => { throw new Error('network'); };
  $(doc, '#feature-play').click(); await tick();
  assert.ok(!$(doc, '#feature-message').hidden); assert.match($(doc, '#feature-direct').href, /promise-174\.mp4$/);
  $(doc, '[data-feature="our-days"]').click(); assert.ok($(doc, '#feature-message').hidden);
  assert.match($(doc, '#feature-direct').href, /our-days\.mp4$/); dom.window.close();
});

test('recipient copy has no production notes, placeholder language, invented dates, or technical labels', async () => {
  const dom = await setup(); const doc = dom.window.document;
  const copy = doc.body.textContent + $$(doc, '[aria-label], img[alt]').map(x => x.getAttribute('aria-label') || x.alt).join(' ');
  assert.doesNotMatch(copy, /제작|프롬프트|생성형|AI|EXIF|촬영일 미확인|임시 페이지|준비 중|준비중|개발|분류표|메타데이터|몇 개월|3개월|4개월/i);
  assert.equal($(doc, '#year-filter option[value="undated"]').textContent, '언젠가의 우리');
  assert.ok(!doc.querySelector('video[autoplay]')); assert.equal($(doc, 'link[rel="license"]').getAttribute('href'), 'assets/keepsakes/music-credits.txt');
  dom.window.close();
});

test('Back from the skip link restores the initial cover', async () => {
  const dom = await setup(); const doc = dom.window.document;
  $(doc, '.skip-link').click(); await tick(); assert.ok($(doc, '#top').hidden);
  dom.window.history.back(); await tick();
  assert.equal(dom.window.location.hash, ''); assert.ok(!$(doc, '#top').hidden);
  dom.window.close();
});

test('history transitions between both viewers restore the outgoing lock before opening the next', async () => {
  const dom = await setup({ location: '#keepsakes' }); const doc = dom.window.document;
  let currentScroll = 430;
  Object.defineProperty(dom.window, 'scrollY', { get: () => doc.body.style.position === 'fixed' ? 0 : currentScroll });
  dom.window.scrollTo = ({ top }) => { currentScroll = top; };
  dom.window.history.pushState(null, '', '#keepsake-seaside');
  dom.window.history.pushState(null, '', '#album');
  $(doc, '#story-grid button').click();
  dom.window.history.go(-2); await tick();
  assert.ok(!$(doc, '#viewer').open); assert.ok($(doc, '#keepsake-viewer').open);
  assert.equal(doc.body.style.position, 'fixed'); assert.equal(doc.body.style.top, '-430px');
  $(doc, '#keepsake-close').click(); assert.equal(currentScroll, 430); assert.equal(doc.body.style.position, '');
  dom.window.close();
});

test('canceled playback and rejected promises from a previous film do not show false errors', async () => {
  const dom = await setup({ location: '#feature' }); const doc = dom.window.document;
  const video = $(doc, '#feature-video'); let rejectPlay;
  video.play = () => new Promise((resolve, reject) => { rejectPlay = reject; });
  $(doc, '#feature-play').click(); $(doc, '[data-feature="our-days"]').click();
  rejectPlay(new Error('outdated source')); await tick();
  assert.ok($(doc, '#feature-message').hidden); assert.ok(!$(doc, '#feature-play').hidden);
  video.play = async () => { const error = new Error('interrupted'); error.name = 'AbortError'; throw error; };
  $(doc, '#feature-play').click(); await tick();
  assert.ok($(doc, '#feature-message').hidden); assert.ok(!$(doc, '#feature-play').hidden);
  dom.window.close();
});

test('the latest 174-second film is the default everywhere, without the earlier summary option', async () => {
  const dom = await setup(); const doc = dom.window.document;
  assert.match($(doc, '#feature-video').src, /promise-174\.mp4$/);
  assert.match($(doc, '#feature-video').poster, /promise-174-poster\.webp$/);
  assert.equal($(doc, '#feature-title').textContent, '너의 행복을 약속할게.');
  assert.equal($(doc, '#feature-duration').textContent, '2:54');
  assert.equal($(doc, '[data-feature][aria-current="true"]').dataset.feature, 'promise-174');
  assert.deepEqual(keepsakes.films.map(film => film.duration), [174, 510]);
  assert.ok(!$(doc, '[data-feature="promise"]')); assert.doesNotMatch(doc.body.textContent, /3:12/);
  dom.window.close();
});
