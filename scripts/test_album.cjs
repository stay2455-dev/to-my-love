/* DOM-only integration checks, not a rendered-browser/device test.
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
const tick = () => new Promise(resolve => setTimeout(resolve, 30));
const $ = (doc, selector) => doc.querySelector(selector);
const $$ = (doc, selector) => [...doc.querySelectorAll(selector)];
const renderedStories = doc => $$(doc, '#story-grid [data-story]').map(button => data.stories.find(story => story.id === button.dataset.story));

async function setup({ location = '', fail = false } = {}) {
  const dom = new JSDOM(html, { url: `https://example.test/to-my-love/${location}`, runScripts: 'outside-only', pretendToBeVisual: true });
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
  window.eval(source); await tick(); return dom;
}

function selectYear(dom, value) {
  const select = $(dom.window.document, '#year-filter'); select.value = value;
  select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
}

function search(dom, value) {
  const input = $(dom.window.document, '#memory-search'); input.value = value;
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}

async function close(dom) {
  $(dom.window.document, '#viewer-close').click();
  for (let i = 0; i < 20 && $(dom.window.document, '#viewer').open; i++) await tick();
  assert.ok(!$(dom.window.document, '#viewer').open);
}

test('201 unique media are each assigned to one of 94 scenes and six reviewed categories', () => {
  assert.equal(data.items.length, 201); assert.equal(data.stories.length, 94); assert.equal(data.categories.length, 6);
  const mapped = data.stories.flatMap(story => story.itemIds);
  assert.equal(mapped.length, 201); assert.equal(new Set(mapped).size, 201);
  assert.deepEqual([...mapped].sort(), data.items.map(item => item.id).sort());
  assert.equal(data.items.filter(x => x.kind === 'image').length, 192);
  assert.equal(data.items.filter(x => x.kind === 'image' && x.date).length, 177);
  assert.equal(data.items.filter(x => x.kind === 'image' && !x.date).length, 15);
  assert.equal(data.items.filter(x => x.kind === 'video').length, 9);
  const dates = data.items.filter(x => x.date).map(x => x.date);
  assert.deepEqual(dates, [...dates].sort());
  assert.deepEqual(data.range, ['2024-04-08', '2026-05-24']);
  for (const story of data.stories) {
    assert.ok(story.itemIds.includes(story.coverId));
    assert.ok(data.categories.some(category => category.id === story.category));
    const members = story.itemIds.map(id => data.items.find(item => item.id === id));
    assert.ok(members.every(item => item.storyId === story.id && item.category === story.category && item.alt.length > 5));
    assert.equal(story.photoCount, members.filter(item => item.kind === 'image').length);
    assert.equal(story.videoCount, members.filter(item => item.kind === 'video').length);
    assert.ok(members.every(item => item.date === story.date), 'No dates borrowed by undated media');
  }
  for (const item of data.items) {
    for (const key of ['src', 'thumb']) {
      assert.match(item[key], /^assets\/album\/[a-z]+\/[a-f0-9]{12}\.(webp|mp4)$/);
      assert.ok(fs.statSync(path.join(root, item[key])).size > 100);
    }
    assert.ok(item.width > 0 && item.height > 0);
    assert.equal(item.source, undefined); assert.equal(item.hasGps, undefined);
    if (item.date) assert.match(item.date, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('the home shelf has six real covers, pagination preserves chronological scenes', async () => {
  const dom = await setup(); const doc = dom.window.document;
  assert.equal($$(doc, '.theme-card').length, 6);
  assert.equal($(doc, '#album-count').textContent, '94개의 기록');
  assert.equal(renderedStories(doc).length, 12);
  while (!$(doc, '#load-more').hidden) $(doc, '#load-more').click();
  assert.deepEqual(renderedStories(doc).map(x => x.id), data.stories.map(x => x.id));
  assert.equal($$(doc, '#film-grid .film-card').length, 9);
  assert.ok($(doc, '#timeline').hidden && $(doc, '#collected').hidden);
  dom.window.close();
});

test('every subject can be opened and category counts are not cosmetic', async () => {
  const dom = await setup(); const doc = dom.window.document;
  for (const category of data.categories) {
    $(doc, `.theme-card[data-category="${category.id}"]`).click();
    const expected = data.stories.filter(story => story.category === category.id);
    assert.equal($(doc, '#album-count').textContent, `${expected.length}개의 기록`);
    assert.ok(renderedStories(doc).every(story => story.category === category.id));
    assert.equal($$(doc, '#topic-tabs [aria-pressed="true"]').length, 1);
    assert.equal(new URL(dom.window.location).searchParams.get('topic'), category.id);
  }
  dom.window.close();
});

test('category, year and specific words intersect correctly, including empty results and reset', async () => {
  const dom = await setup(); const doc = dom.window.document;
  $(doc, '.theme-card[data-category="walk"]').click(); selectYear(dom, '2025'); search(dom, '벚꽃');
  assert.equal(renderedStories(doc).length, 1);
  assert.equal(renderedStories(doc)[0].title, '벚꽃 아래서');
  assert.equal($(doc, '#album-count').textContent, '1개의 기록');
  search(dom, '없는검색어'); assert.ok(!$(doc, '#empty-state').hidden);
  $(doc, '#empty-reset').click(); assert.equal($(doc, '#album-count').textContent, '94개의 기록');
  assert.equal($(doc, '#year-filter').value, 'all'); assert.equal($(doc, '#memory-search').value, '');
  search(dom, '커피');
  assert.ok(renderedStories(doc).length > 0 && renderedStories(doc).length < 10, 'Coffee search must not select every meal');
  assert.ok(renderedStories(doc).every(story => [story.title, story.alt, ...story.keywords].join(' ').includes('커피')));
  dom.window.close();
});

test('undated scenes can be browsed without inventing capture dates', async () => {
  const dom = await setup(); const doc = dom.window.document; selectYear(dom, 'undated');
  assert.ok(renderedStories(doc).length > 0);
  assert.ok(renderedStories(doc).every(story => story.date === null));
  $(doc, '#story-grid button').click(); assert.equal($(doc, '#viewer-date').textContent, '');
  await close(dom); dom.window.close();
});

test('photo mode preserves 17 months, all 192 photos, chronological order and collapse controls', async () => {
  const dom = await setup(); const doc = dom.window.document;
  $(doc, '[data-view="photos"]').click();
  assert.ok($(doc, '#story-grid').hidden); assert.ok(!$(doc, '#timeline').hidden);
  assert.equal($$(doc, '.memory-month').length, 17);
  $$(doc, '.expand-button[aria-expanded="false"]').forEach(button => button.click());
  assert.deepEqual($$(doc, '#timeline [data-memory]').map(button => button.dataset.memory), data.items.filter(item => item.kind === 'image' && item.date).map(item => item.id));
  assert.equal($$(doc, '#collected-grid .photo-card').length, 15);
  const may = $(doc, '#month-2024-05'); assert.equal($$(may, '.photo-card').length, 28);
  $(may, '.expand-button').click(); assert.equal($$(may, '.photo-card').length, 4);
  selectYear(dom, '2026'); assert.equal($$(doc, '.memory-month').length, 2); assert.ok($(doc, '#collected').hidden);
  $(doc, '#topic-tabs [data-category="table"]').click(); assert.equal($$(doc, '.memory-month').length, 0); assert.ok(!$(doc, '#empty-state').hidden);
  dom.window.close();
});

test('photo mode and story mode expose the same media for each category', async () => {
  const dom = await setup(); const doc = dom.window.document;
  for (const category of data.categories) {
    $(doc, '.theme-card[data-category="' + category.id + '"]').click(); $(doc, '[data-view="photos"]').click();
    $$(doc, '.expand-button[aria-expanded="false"]').forEach(button => button.click());
    const actual = $$(doc, '#timeline [data-memory], #collected-grid [data-memory]').map(button => button.dataset.memory).sort();
    const expected = data.items.filter(item => item.kind === 'image' && item.category === category.id).map(item => item.id).sort();
    assert.deepEqual(actual, expected);
    assert.equal($$(doc, '#film-grid button').length, data.items.filter(item => item.kind === 'video' && item.category === category.id).length);
  }
  dom.window.close();
});

test('viewer navigates within a scene and between filtered scenes, then restores focus and history', async () => {
  const dom = await setup(); const doc = dom.window.document;
  $(doc, '.theme-card[data-category="play"]').click();
  const selection = data.stories.filter(story => story.category === 'play');
  const trigger = $(doc, '#story-grid button'); trigger.focus(); trigger.click();
  assert.ok($(doc, '#viewer').open);
  assert.equal($(doc, '#viewer-title').textContent, selection[0].title);
  assert.ok($(doc, '#viewer-prev').disabled && $(doc, '#previous-story').disabled);
  $(doc, '#viewer-next').click(); assert.match($(doc, '#viewer-position').textContent, /^2 \/ /);
  $(doc, '#viewer').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.match($(doc, '#viewer-position').textContent, /^3 \/ /);
  $(doc, '#viewer-strip button:last-child').click(); assert.ok($(doc, '#viewer-next').disabled);
  $(doc, '#next-story').click(); assert.equal($(doc, '#viewer-title').textContent, selection[1].title);
  $(doc, '#previous-story').click(); assert.equal($(doc, '#viewer-title').textContent, selection[0].title);
  await close(dom);
  assert.equal(doc.activeElement, trigger); assert.ok(!doc.body.classList.contains('viewer-open'));
  assert.equal(new URL(dom.window.location).searchParams.get('topic'), 'play');
  dom.window.close();
});

test('mixed photo/video scenes preserve controls, manual playback and stop on navigation', async () => {
  const dom = await setup(); const doc = dom.window.document;
  const mixed = data.stories.find(story => story.photoCount && story.videoCount);
  const videoId = mixed.itemIds.find(id => data.items.find(item => item.id === id).kind === 'video');
  const videoIndex = mixed.itemIds.indexOf(videoId);
  while (!$(doc, '#load-more').hidden) $(doc, '#load-more').click();
  $(doc, `[data-story="${mixed.id}"]`).click();
  $$(doc, '#viewer-strip button')[videoIndex].click();
  const video = $(doc, '#viewer-media video');
  assert.ok(video.controls && video.playsInline); assert.equal(video.autoplay, false); assert.equal(video.preload, 'metadata');
  const photoIndex = mixed.itemIds.findIndex(id => id !== videoId);
  $$(doc, '#viewer-strip button')[photoIndex].click();
  assert.equal(video.dataset.paused, 'true'); assert.ok(!video.hasAttribute('src'));
  await close(dom); dom.window.close();
});

test('saved filter links and direct photo links restore without guessed dates or extra back steps', async () => {
  const dom = await setup({ location: '?topic=walk&year=2025&q=' + encodeURIComponent('벚꽃') + '#photo-d008fa9dc488' });
  const doc = dom.window.document;
  assert.equal(renderedStories(doc).length, 1); assert.ok($(doc, '#viewer').open);
  assert.equal($(doc, '#viewer-title').textContent, '벚꽃 아래서');
  $(doc, '#viewer-next').click(); assert.ok(!dom.window.location.hash.endsWith('d008fa9dc488'));
  $(doc, '#viewer').dispatchEvent(new dom.window.Event('cancel', { cancelable: true }));
  assert.ok(!$(doc, '#viewer').open); assert.equal(dom.window.location.hash, '#album');
  assert.equal(new URL(dom.window.location).searchParams.get('topic'), 'walk');
  dom.window.close();
});

test('unknown filter values fall back safely and literal search text cannot inject HTML', async () => {
  const dom = await setup({ location: '?topic=unknown&year=1900&view=invalid&q=%3Cimg%20src%3Dx%3E' });
  const doc = dom.window.document;
  assert.equal($(doc, '#year-filter').value, 'all'); assert.ok(!$(doc, '#empty-state').hidden);
  assert.equal($$(doc, 'img[src="x"]').length, 0);
  $(doc, '#empty-reset').click(); assert.equal($(doc, '#album-count').textContent, '94개의 기록');
  dom.window.close();
});

test('video navigation clears filters so a hidden section never becomes a dead destination', async () => {
  const dom = await setup(); const doc = dom.window.document;
  $(doc, '.theme-card[data-category="everyday"]').click(); assert.ok($(doc, '#films').hidden);
  $(doc, '.site-header a[href="#films"]').click();
  assert.ok(!$(doc, '#films').hidden); assert.equal($$(doc, '#film-grid button').length, 9);
  assert.equal(dom.window.location.hash, '#films'); dom.window.close();
});

test('load failure has an accessible retry and successful recovery does not duplicate listeners', async () => {
  const dom = await setup({ fail: true }); const doc = dom.window.document;
  assert.ok($(doc, '[role="alert"] .retry-button'));
  assert.equal($(doc, '#story-grid').getAttribute('aria-busy'), 'false');
  dom.window.fetch = async () => ({ ok: true, json: async () => structuredClone(data) });
  $(doc, '.retry-button').click(); await tick();
  assert.equal($$(doc, '.theme-card').length, 6); assert.equal(renderedStories(doc).length, 12);
  $(doc, '.hero [data-memory]').click(); await close(dom);
  assert.equal(dom.window.location.hash, ''); dom.window.close();
});
