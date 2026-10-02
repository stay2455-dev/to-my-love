/* DOM integration checks. Rendered layout is checked separately in a browser.
   TEST_JSDOM_PATH may point to an existing jsdom installation. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require(process.env.TEST_JSDOM_PATH || '../planning/test-runtime/node_modules/jsdom');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'calendar.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'calendar.js'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data/memories.json'), 'utf8'));
const tick = () => new Promise(resolve => setTimeout(resolve, 30));
const $ = (doc, selector) => doc.querySelector(selector);
const $$ = (doc, selector) => [...doc.querySelectorAll(selector)];
const dates = [...new Set(data.items.filter(item => item.date).map(item => item.date))].sort();
const months = [...new Set(dates.map(date => date.slice(0, 7)))];

async function setup({ query = '', fail = false, fixture = data } = {}) {
  const dom = new JSDOM(html, { url: `https://example.test/to-my-love/calendar.html${query}`, runScripts: 'outside-only', pretendToBeVisual: true });
  dom.window.fetch = async () => fail ? { ok: false, status: 503 } : { ok: true, json: async () => structuredClone(fixture) };
  dom.window.console.error = () => {};
  dom.window.eval(source);
  await tick(); return dom;
}

function change(dom, selector, value) {
  const select = $(dom.window.document, selector); select.value = value;
  select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
}

test('initial calendar opens a recorded month and exposes only actual dates', async () => {
  const dom = await setup(); const doc = dom.window.document;
  assert.equal($(doc, '#cal-content').hidden, false);
  assert.equal($(doc, '#cal-status').hidden, true);
  assert.equal($(doc, '#cal-month').value, months[0]);
  assert.equal(new URL(dom.window.location).searchParams.get('date'), dates[0]);
  assert.equal($(doc, '.cal-day[aria-pressed=true]').dataset.date, dates[0]);
  assert.deepEqual($$(doc, '.cal-day.has-memory').map(button => button.dataset.date), dates.filter(date => date.startsWith(months[0])));
  assert.equal($(doc, '.cal-undated').getAttribute('href'), 'index.html?year=undated#album');
  assert.ok($(doc, '#cal-prev').disabled);
  dom.window.close();
});

test('year and month controls cover all recorded months, and every day opens exact media groups', async () => {
  const dom = await setup(); const doc = dom.window.document;
  const seenDates = [];
  for (const month of months) {
    change(dom, '#cal-year', month.slice(0, 4)); change(dom, '#cal-month', month);
    assert.equal($(doc, '#cal-month').value, month);
    assert.deepEqual($$(doc, '#cal-month option').map(option => option.value), months.filter(value => value.startsWith(month.slice(0, 4))));
    const days = $$(doc, '.cal-day.has-memory');
    for (const day of days) {
      day.click(); const date = day.dataset.date; seenDates.push(date);
      const items = data.items.filter(item => item.date === date);
      const storyIds = [...new Set(items.map(item => item.storyId))];
      assert.deepEqual($$(doc, '.cal-story').map(article => article.dataset.story), storyIds);
      assert.deepEqual($$(doc, '.cal-story-title').map(title => title.textContent), storyIds.map(id => data.stories.find(story => story.id === id).title));
      assert.deepEqual($$(doc, '.cal-story-link').map(link => link.getAttribute('href')), storyIds.map(id => `index.html#photo-${data.stories.find(story => story.id === id).coverId}`));
      const photos = items.filter(item => item.kind === 'image').length, videos = items.filter(item => item.kind === 'video').length;
      const expected = [photos ? `사진 ${photos}장` : '', videos ? `영상 ${videos}편` : ''].filter(Boolean).join(' · ');
      assert.equal($(doc, '#cal-selected-count').textContent, `${date.slice(0, 4)}년 · ${expected}`);
      assert.equal(new URL(dom.window.location).searchParams.get('date'), date);
    }
  }
  assert.deepEqual(seenDates, dates);
  assert.ok($(doc, '#cal-next').disabled);
  dom.window.close();
});

test('month arrows skip months with no records and restore through browser history', async () => {
  const dom = await setup(); const doc = dom.window.document;
  const original = new URL(dom.window.location).searchParams.get('date');
  $(doc, '#cal-next').click();
  assert.equal($(doc, '#cal-month').value, months[1]);
  assert.equal(new URL(dom.window.location).searchParams.get('date'), dates.find(date => date.startsWith(months[1])));
  dom.window.history.back(); await tick(); await tick();
  assert.equal($(doc, '#cal-month').value, months[0]);
  assert.equal($(doc, '.cal-day[aria-pressed=true]').dataset.date, original);
  dom.window.close();
});

test('a shared date URL selects the right day; empty days do not invent a memory', async () => {
  const target = dates.at(-1);
  const dom = await setup({ query: `?date=${target}` }); const doc = dom.window.document;
  assert.equal($(doc, '.cal-day[aria-pressed=true]').dataset.date, target);
  assert.equal($(doc, '#cal-month').value, target.slice(0, 7));
  const empty = $(doc, '.cal-day:not(.has-memory)');
  empty.click();
  assert.equal($$(doc, '.cal-story').length, 0);
  assert.ok($(doc, '.cal-empty-day').textContent.includes('기록된 사진과 영상이 없어요'));
  assert.equal(new URL(dom.window.location).searchParams.get('date'), empty.dataset.date);
  dom.window.close();
});

test('unrecorded months and impossible dates fall back without inferring dates from stories', async () => {
  for (const query of ['?date=2024-02-30', '?date=1990-01-01', '?date=garbage']) {
    const dom = await setup({ query });
    assert.equal($(dom.window.document, '.cal-day[aria-pressed=true]').dataset.date, dates[0]);
    dom.window.close();
  }
  const fixture = structuredClone(data);
  fixture.items = fixture.items.map(item => ({ ...item, date: null }));
  const dom = await setup({ fixture }); const doc = dom.window.document;
  assert.ok($(doc, '#cal-content').hidden);
  assert.equal($$(doc, '.cal-day').length, 0);
  assert.ok($(doc, '#cal-status').textContent.includes('날짜가 기록된 사진과 영상이 없어요'));
  dom.window.close();
});

test('fetch errors expose retry and recover the calendar without a reload', async () => {
  const dom = await setup({ fail: true }); const doc = dom.window.document;
  assert.ok($(doc, '#cal-content').hidden);
  assert.ok($(doc, '.cal-retry'));
  dom.window.fetch = async () => ({ ok: true, json: async () => structuredClone(data) });
  $(doc, '.cal-retry').click(); await tick();
  assert.equal($(doc, '#cal-content').hidden, false);
  assert.equal($(doc, '#cal-status').hidden, true);
  assert.ok($(doc, '.cal-day.has-memory'));
  dom.window.close();
});

test('arrow keys move native day-button focus while selection stays explicit', async () => {
  const dom = await setup(); const doc = dom.window.document;
  const day = $(doc, '.cal-day[aria-pressed=true]'); day.focus();
  day.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  const next = doc.activeElement;
  assert.equal(Number(next.dataset.date.slice(-2)), Number(day.dataset.date.slice(-2)) + 1);
  assert.equal($(doc, '.cal-day[aria-pressed=true]').dataset.date, day.dataset.date);
  next.click(); assert.equal($(doc, '.cal-day[aria-pressed=true]').dataset.date, next.dataset.date);
  dom.window.close();
});
