const cal = selector => document.querySelector(selector);
const weekdays = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
let dayItems = new Map(), itemById = new Map(), storyById = new Map(), categoryById = new Map();
let recordedMonths = [], selectedDate = '', currentMonth = '';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function spokenDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

function countMedia(items) {
  const photos = items.filter(item => item.kind === 'image').length;
  const videos = items.filter(item => item.kind === 'video').length;
  return [photos ? `사진 ${photos}장` : '', videos ? `영상 ${videos}편` : ''].filter(Boolean).join(' · ');
}

function makeImage(item, eager = false) {
  if (!item?.thumb) return null;
  const image = element('img');
  image.src = item.thumb;
  image.alt = item.alt || '함께 남긴 장면';
  image.loading = eager ? 'eager' : 'lazy';
  image.decoding = 'async';
  image.width = item.width || 680;
  image.height = item.height || 510;
  return image;
}

function coverFor(items) {
  return items.find(item => storyById.get(item.storyId)?.coverId === item.id) || items[0];
}

function firstDate(month) {
  return [...dayItems.keys()].find(date => date.startsWith(month));
}

function readLocation() {
  const date = new URL(location.href).searchParams.get('date');
  if (validDate(date) && recordedMonths.includes(date.slice(0, 7))) selectedDate = date;
  else selectedDate = firstDate(recordedMonths[0]);
  currentMonth = selectedDate.slice(0, 7);
}

function saveLocation(replace = false) {
  const url = new URL(location.href);
  url.searchParams.set('date', selectedDate);
  if (url.href !== location.href) history[replace ? 'replaceState' : 'pushState'](null, '', url);
}

function populateSelects() {
  const years = [...new Set(recordedMonths.map(month => month.slice(0, 4)))];
  cal('#cal-year').replaceChildren(...years.map(year => {
    const option = element('option', '', `${year}년`); option.value = year; return option;
  }));
  cal('#cal-year').value = currentMonth.slice(0, 4);
  cal('#cal-month').replaceChildren(...recordedMonths.filter(month => month.startsWith(currentMonth.slice(0, 4))).map(month => {
    const option = element('option', '', `${Number(month.slice(5))}월`); option.value = month; return option;
  }));
  cal('#cal-month').value = currentMonth;
  const index = recordedMonths.indexOf(currentMonth);
  cal('#cal-prev').disabled = index === 0;
  cal('#cal-next').disabled = index === recordedMonths.length - 1;
  cal('#cal-prev').title = index > 0 ? `${recordedMonths[index - 1].replace('-', '년 ')}월` : '첫 번째 기록 월';
  cal('#cal-next').title = index < recordedMonths.length - 1 ? `${recordedMonths[index + 1].replace('-', '년 ')}월` : '마지막 기록 월';
}

function renderCalendar() {
  const [year, month] = currentMonth.split('-').map(Number);
  const firstWeekday = new Date(`${currentMonth}-01T12:00:00Z`).getUTCDay();
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const daysWithRecords = [...dayItems.keys()].filter(date => date.startsWith(currentMonth));
  cal('#cal-month-title').textContent = `${year}년 ${month}월`;
  cal('#cal-month-count').textContent = `${daysWithRecords.length}일의 기록`;
  populateSelects();
  const rows = [];
  let row;
  for (let cellIndex = 0; cellIndex < Math.ceil((firstWeekday + lastDay) / 7) * 7; cellIndex++) {
    if (cellIndex % 7 === 0) { row = element('tr'); rows.push(row); }
    const cell = element('td'); row.append(cell);
    const day = cellIndex - firstWeekday + 1;
    if (day < 1 || day > lastDay) continue;
    const date = `${currentMonth}-${String(day).padStart(2, '0')}`;
    const items = dayItems.get(date) || [];
    const button = element('button', `cal-day${items.length ? ' has-memory' : ''}`);
    button.type = 'button'; button.dataset.date = date;
    button.setAttribute('aria-pressed', String(date === selectedDate));
    button.setAttribute('aria-controls', 'cal-stories');
    button.setAttribute('aria-label', `${spokenDate(date)}, ${items.length ? countMedia(items) : '기록 없음'}`);
    button.append(element('span', 'cal-day-number', String(day)));
    if (items.length) {
      const image = makeImage(coverFor(items));
      if (image) {
        image.className = 'cal-day-image'; image.alt = ''; image.setAttribute('aria-hidden', 'true');
        image.addEventListener('error', () => {
          const dot = element('span', 'cal-day-dot'); dot.setAttribute('aria-hidden', 'true'); image.replaceWith(dot);
        }, { once: true });
        button.append(image);
      } else {
        const dot = element('span', 'cal-day-dot'); dot.setAttribute('aria-hidden', 'true'); button.append(dot);
      }
    }
    cell.append(button);
  }
  cal('#cal-days').replaceChildren(...rows);
}

function renderDetails() {
  const list = dayItems.get(selectedDate) || [];
  const weekday = weekdays[new Date(`${selectedDate}T12:00:00Z`).getUTCDay()];
  cal('#cal-selected-title').textContent = `${Number(selectedDate.slice(5, 7))}월 ${Number(selectedDate.slice(8))}일, ${weekday}`;
  cal('#cal-selected-count').textContent = `${selectedDate.slice(0, 4)}년${list.length ? ` · ${countMedia(list)}` : ''}`;
  const host = cal('#cal-stories');
  if (!list.length) {
    host.replaceChildren(element('p', 'cal-empty-day', '이 날짜에 기록된 사진과 영상이 없어요. 작은 사진이 놓인 다른 날을 눌러봐.'));
    return;
  }
  const groups = new Map();
  list.forEach(item => {
    const key = item.storyId || item.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  host.replaceChildren(...[...groups].map(([storyId, items], index) => {
    const story = storyById.get(storyId);
    // A multi-day story must not give a date to an undated photo or show another day's cover.
    const cover = items.find(item => item.id === story?.coverId) || items[0];
    const article = element('article', 'cal-story'); article.dataset.story = storyId;
    const link = element('a', 'cal-story-link'); link.href = `index.html#photo-${encodeURIComponent(cover.id)}`;
    const title = story?.title || '함께 남긴 장면';
    link.setAttribute('aria-label', `${title}, ${countMedia(items)}, 사진첩에서 펼쳐보기`);
    const photo = element('span', 'cal-story-photo');
    const image = makeImage(cover, index === 0);
    if (image) photo.append(image);
    if (cover.kind === 'video') photo.append(element('span', 'cal-video-label', '영상'));
    const copy = element('span', 'cal-story-copy');
    const category = categoryById.get(story?.category)?.title;
    if (category) copy.append(element('span', 'cal-story-category', category));
    copy.append(element('span', 'cal-story-title', title));
    const bottom = element('span', 'cal-story-bottom');
    bottom.append(element('span', '', countMedia(items)), element('span', 'cal-story-open', '추억 펼쳐보기 ↗'));
    copy.append(bottom); link.append(photo, copy); article.append(link); return article;
  }));
}

function selectDate(date, { historyMode = 'push', focus = false } = {}) {
  if (!validDate(date) || !recordedMonths.includes(date.slice(0, 7))) return;
  const changedMonth = currentMonth !== date.slice(0, 7);
  selectedDate = date; currentMonth = date.slice(0, 7);
  if (changedMonth) renderCalendar();
  else document.querySelectorAll('.cal-day').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.date === date)));
  renderDetails();
  if (historyMode !== 'none') saveLocation(historyMode === 'replace');
  if (focus) cal(`.cal-day[data-date="${date}"]`)?.focus();
}

function selectMonth(month) {
  if (recordedMonths.includes(month)) selectDate(firstDate(month));
}

cal('#cal-year').addEventListener('change', event => selectMonth(recordedMonths.find(month => month.startsWith(event.target.value))));
cal('#cal-month').addEventListener('change', event => selectMonth(event.target.value));
cal('#cal-prev').addEventListener('click', () => selectMonth(recordedMonths[recordedMonths.indexOf(currentMonth) - 1]));
cal('#cal-next').addEventListener('click', () => selectMonth(recordedMonths[recordedMonths.indexOf(currentMonth) + 1]));
cal('#cal-days').addEventListener('click', event => {
  const button = event.target.closest('.cal-day');
  if (button) selectDate(button.dataset.date);
});
cal('#cal-days').addEventListener('keydown', event => {
  const button = event.target.closest('.cal-day');
  if (!button) return;
  const date = new Date(`${button.dataset.date}T12:00:00Z`);
  const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -date.getUTCDay(), End: 6 - date.getUTCDay() };
  if (!(event.key in offsets)) return;
  event.preventDefault();
  date.setUTCDate(date.getUTCDate() + offsets[event.key]);
  const target = date.toISOString().slice(0, 10);
  cal(`.cal-day[data-date="${target}"]`)?.focus();
});
window.addEventListener('popstate', () => {
  if (!recordedMonths.length) return;
  readLocation(); renderCalendar(); renderDetails();
});

async function loadCalendar() {
  const status = cal('#cal-status');
  status.hidden = false;
  status.replaceChildren(element('p', '', '달력을 펼치고 있어요.'));
  cal('#cal-content').hidden = true;
  try {
    const response = await fetch('data/memories.json');
    if (!response.ok) throw new Error(`Calendar data returned ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.items) || !Array.isArray(data.stories)) throw new Error('Invalid calendar data');
    itemById = new Map(data.items.map(item => [item.id, item]));
    storyById = new Map(data.stories.map(story => [story.id, story]));
    categoryById = new Map((data.categories || []).map(category => [category.id, category]));
    dayItems = new Map();
    [...itemById.values()].filter(item => validDate(item.date)).sort((a, b) => a.date.localeCompare(b.date)).forEach(item => {
      if (!dayItems.has(item.date)) dayItems.set(item.date, []);
      dayItems.get(item.date).push(item);
    });
    recordedMonths = [...new Set([...dayItems.keys()].map(date => date.slice(0, 7)))];
    if (!recordedMonths.length) {
      status.replaceChildren(element('p', '', '날짜가 기록된 사진과 영상이 없어요. 모아둔 사진에서 함께 남긴 장면을 볼 수 있어요.'));
      return;
    }
    readLocation(); renderCalendar(); renderDetails(); saveLocation(true);
    status.hidden = true; cal('#cal-content').hidden = false;
  } catch (error) {
    console.error('Unable to load calendar:', error);
    status.replaceChildren(element('p', '', '달력을 불러오지 못했어요. 다시 한 번 펼쳐볼까요?'));
    const retry = element('button', 'cal-retry', '다시 불러오기'); retry.type = 'button';
    retry.addEventListener('click', loadCalendar, { once: true }); status.append(retry);
  }
}

loadCalendar();
