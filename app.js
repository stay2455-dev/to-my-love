const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const timeline = $('#timeline');
const viewer = $('#viewer');
const mediaHost = $('#viewer-media');
const monthNames = new Map();
let items = [];
let dated = [];
let groups = new Map();
let currentYear = 'all';
let activeGroup = [];
let activeIndex = 0;
let activeTitle = '';
let previousFocus = null;
let openedWithHistory = false;
let frozenScrollY = 0;
let touchStart = null;

const shortDate = date => date ? date.replaceAll('-', '. ') : '';
const spokenDate = date => date ? `${Number(date.slice(0, 4))}년 ${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일` : '';
const durationText = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function previewsFor(list) {
  if (list.length <= 4) return list;
  // Select across capture days without changing the underlying chronological order.
  const dayRepresentatives = list.filter((item, index) => !index || item.date !== list[index - 1].date);
  let selected;
  if (dayRepresentatives.length >= 4) {
    selected = [0, 1, 2, 3].map(index => dayRepresentatives[Math.round(index * (dayRepresentatives.length - 1) / 3)]);
  } else {
    selected = [...dayRepresentatives];
    for (const fraction of [.4, .7, 1, .2, .5]) {
      const item = list[Math.round(fraction * (list.length - 1))];
      if (!selected.includes(item)) selected.push(item);
      if (selected.length === 4) break;
    }
  }
  return selected.sort((a, b) => list.indexOf(a) - list.indexOf(b));
}

function photoCard(item, list, title, index) {
  const figure = node('figure', 'photo-card');
  const button = node('button', 'photo-open');
  button.type = 'button';
  button.dataset.memory = item.id;
  button.setAttribute('aria-label', `${item.date ? spokenDate(item.date) + ', ' : ''}${title} ${index + 1}번째 사진 크게 보기`);
  const media = node('span', 'photo-media');
  const image = node('img');
  image.src = item.thumb;
  image.width = item.width;
  image.height = item.height;
  image.alt = `${item.date ? spokenDate(item.date) : title}의 사진 ${index + 1}`;
  image.loading = 'lazy';
  image.decoding = 'async';
  media.append(image);
  button.append(media);
  button.addEventListener('click', () => openViewer(list, list.indexOf(item), title, button));
  figure.append(button);
  const caption = node('figcaption');
  if (item.date) {
    const time = node('time', '', shortDate(item.date));
    time.dateTime = item.date;
    caption.append(time);
  }
  caption.append(node('span', 'photo-number', String(index + 1).padStart(2, '0')));
  figure.append(caption);
  return figure;
}

function renderMonth(month, list) {
  const [year, number] = month.split('-');
  const title = `${year}년 ${Number(number)}월`;
  monthNames.set(month, title);
  const section = node('section', 'memory-month');
  section.id = `month-${month}`;
  section.dataset.year = year;
  section.setAttribute('aria-labelledby', `heading-${month}`);
  const heading = node('div', 'month-heading');
  heading.append(node('p', 'month-year', year));
  const h3 = node('h3', 'month-number', number);
  h3.id = `heading-${month}`;
  h3.setAttribute('aria-label', title);
  h3.append(node('span', '', '월'));
  heading.append(h3, node('p', 'month-count', `${list.length}장의 사진`));
  const content = node('div', 'month-content');
  const grid = node('div', `photo-grid${list.length === 1 ? ' single-photo' : ''}`);
  grid.id = `grid-${month}`;
  const preview = previewsFor(list);
  const renderCards = selection => grid.replaceChildren(...selection.map(item => photoCard(item, list, title, list.indexOf(item))));
  renderCards(preview);
  content.append(grid);
  if (list.length > preview.length) {
    const actions = node('div', 'month-actions');
    const toggle = node('button', 'expand-button');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', grid.id);
    toggle.append(document.createTextNode(`${list.length}장 펼쳐보기`), node('span', '', '+'));
    toggle.addEventListener('click', () => {
      const expand = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(expand));
      grid.classList.toggle('is-expanded', expand);
      toggle.replaceChildren(document.createTextNode(expand ? '접어두기' : `${list.length}장 펼쳐보기`), node('span', '', expand ? '−' : '+'));
      renderCards(expand ? list : preview);
      if (!expand) section.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
    actions.append(toggle);
    content.append(actions);
  }
  section.append(heading, content);
  return section;
}

function setYear(year, scroll = false) {
  currentYear = year;
  for (const button of $$('.year-tabs [data-year]')) button.setAttribute('aria-pressed', String(button.dataset.year === year));
  for (const section of $$('.memory-month')) section.hidden = year !== 'all' && section.dataset.year !== year;
  const count = dated.filter(item => year === 'all' || item.date.startsWith(year)).length;
  $('#album-count').textContent = `${year === 'all' ? '전체 ' : ''}${count}장`;
  if (scroll) $('#album').scrollIntoView({ block: 'start' });
}

function renderCollected() {
  const collection = items.filter(item => item.kind === 'image' && !item.date);
  $('#collected-count').textContent = `${collection.length}장`;
  $('#collected-grid').replaceChildren(...collection.map((item, index) => photoCard(item, collection, '모아둔 사진', index)));
  $('#collected').hidden = !collection.length;
}

function renderFilms() {
  const films = items.filter(item => item.kind === 'video');
  $('#films-count').textContent = `${films.length}편`;
  $('#film-grid').replaceChildren(...films.map((item, index) => {
    const figure = node('figure', 'film-card');
    const button = node('button');
    button.type = 'button';
    button.setAttribute('aria-label', `영상 ${index + 1}, ${durationText(item.duration)}, 열기`);
    const image = node('img');
    image.src = item.thumb;
    image.alt = `영상 ${index + 1}의 한 장면`;
    image.width = item.width;
    image.height = item.height;
    image.loading = 'lazy';
    image.decoding = 'async';
    const play = node('span', 'play-mark');
    play.setAttribute('aria-hidden', 'true');
    play.innerHTML = '<svg viewBox="0 0 20 20"><path d="M4 2v16l13-8Z"/></svg>';
    button.append(image, play);
    button.addEventListener('click', () => openViewer(films, index, '움직이는 순간', button));
    const caption = node('figcaption');
    caption.append(node('span', '', String(index + 1).padStart(2, '0')), node('span', 'film-duration', durationText(item.duration)));
    figure.append(button, caption);
    return figure;
  }));
  $('#films').hidden = !films.length;
}

function stopMedia() {
  const video = $('video', mediaHost);
  if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
}

function showItem(index) {
  if (index < 0 || index >= activeGroup.length) return;
  stopMedia();
  activeIndex = index;
  const item = activeGroup[index];
  const media = node(item.kind === 'video' ? 'video' : 'img');
  if (item.kind === 'video') {
    media.controls = true;
    media.playsInline = true;
    media.preload = 'metadata';
    media.poster = item.thumb;
    media.setAttribute('aria-label', `영상 ${index + 1}`);
    // Playback is always the viewer's choice, never autoplay or background audio.
  } else {
    media.alt = `${item.date ? spokenDate(item.date) : activeTitle}의 사진 ${index + 1}`;
    media.decoding = 'async';
  }
  media.addEventListener('error', () => {
    if (mediaHost.firstElementChild !== media) return;
    const message = node('p', 'viewer-error', '파일을 불러오지 못했어요. ');
    const link = node('a', '', '새 창에서 보기');
    link.href = item.src; link.target = '_blank'; link.rel = 'noopener';
    message.append(link);
    mediaHost.replaceChildren(message);
  });
  media.src = item.src;
  mediaHost.replaceChildren(media);
  $('#viewer-title').textContent = activeTitle;
  $('#viewer-date').textContent = item.date ? shortDate(item.date) : '';
  $('#viewer-position').textContent = `${index + 1} / ${activeGroup.length}`;
  $('#viewer-prev').disabled = index === 0;
  $('#viewer-next').disabled = index === activeGroup.length - 1;
  const type = item.kind === 'video' ? '영상' : '사진';
  $('#viewer-prev').setAttribute('aria-label', `이전 ${type}`);
  $('#viewer-next').setAttribute('aria-label', `다음 ${type}`);
  $('#viewer-original').href = item.src;
  $('#viewer-original').textContent = item.kind === 'video' ? '새 창에서 보기 ↗' : '크게 보기 ↗';
  const strip = $('#viewer-strip');
  $$('button', strip).forEach((button, i) => button.setAttribute('aria-current', String(i === index)));
  const thumbnail = strip.children[index];
  if (thumbnail) strip.scrollTo({ left: Math.max(0, thumbnail.offsetLeft - strip.offsetLeft - strip.clientWidth / 2 + thumbnail.clientWidth / 2), behavior: 'instant' });
  if (openedWithHistory) history.replaceState({ ...history.state, albumViewer: true }, '', `#photo-${item.id}`);
}

function openViewer(list, index, title, trigger = document.activeElement, fromLink = false) {
  if (!list.length || index < 0) return;
  activeGroup = list;
  activeTitle = title;
  previousFocus = trigger;
  const strip = $('#viewer-strip');
  strip.replaceChildren(...list.map((item, i) => {
    const button = node('button');
    button.type = 'button';
    button.setAttribute('aria-label', `${i + 1}번째 ${item.kind === 'video' ? '영상' : '사진'}`);
    const img = node('img');
    img.src = item.thumb; img.alt = ''; img.loading = 'lazy'; img.width = 65; img.height = 60;
    button.append(img);
    button.addEventListener('click', () => showItem(i));
    return button;
  }));
  frozenScrollY = window.scrollY;
  document.body.classList.add('viewer-open');
  document.body.style.position = 'fixed';
  document.body.style.top = `-${frozenScrollY}px`;
  document.body.style.width = '100%';
  if (!fromLink) {
    history.pushState({ ...history.state, albumViewer: true }, '', `#photo-${list[index].id}`);
    openedWithHistory = true;
  } else openedWithHistory = false;
  showItem(index);
  viewer.showModal();
  $('#viewer-close').focus({ preventScroll: true });
}

function finishClose() {
  if (!viewer.open) return;
  stopMedia();
  viewer.close();
  mediaHost.replaceChildren();
  $('#viewer-strip').replaceChildren();
  document.body.classList.remove('viewer-open');
  document.body.style.position = ''; document.body.style.top = ''; document.body.style.width = '';
  window.scrollTo({ top: frozenScrollY, behavior: 'instant' });
  previousFocus?.focus?.({ preventScroll: true });
  openedWithHistory = false;
}

function closeViewer() {
  if (openedWithHistory) history.back();
  else { history.replaceState(null, '', '#album'); finishClose(); }
}

function groupFor(item) {
  if (item.kind === 'video') return [items.filter(x => x.kind === 'video'), '움직이는 순간'];
  if (!item.date) return [items.filter(x => x.kind === 'image' && !x.date), '모아둔 사진'];
  const month = item.date.slice(0, 7);
  return [groups.get(month), monthNames.get(month)];
}

function followPhotoHash() {
  const id = location.hash.match(/^#photo-([a-f0-9]{12})$/)?.[1];
  const item = items.find(x => x.id === id);
  if (!item) return false;
  const [list, title] = groupFor(item);
  if (!viewer.open) openViewer(list, list.indexOf(item), title, $('[data-year="all"]'), true);
  return true;
}

$$('.year-tabs button').forEach(button => button.addEventListener('click', () => setYear(button.dataset.year, true)));
$('#viewer-close').addEventListener('click', closeViewer);
$('#viewer-prev').addEventListener('click', () => showItem(activeIndex - 1));
$('#viewer-next').addEventListener('click', () => showItem(activeIndex + 1));
viewer.addEventListener('cancel', event => { event.preventDefault(); closeViewer(); });
viewer.addEventListener('keydown', event => {
  if (event.target.tagName === 'VIDEO') return;
  if (event.key === 'ArrowLeft') { event.preventDefault(); showItem(activeIndex - 1); }
  if (event.key === 'ArrowRight') { event.preventDefault(); showItem(activeIndex + 1); }
});
mediaHost.addEventListener('touchstart', event => {
  if (activeGroup[activeIndex]?.kind === 'video' || event.touches.length !== 1) { touchStart = null; return; }
  touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
}, { passive: true });
mediaHost.addEventListener('touchend', event => {
  if (!touchStart || event.changedTouches.length !== 1) return;
  const dx = event.changedTouches[0].clientX - touchStart.x;
  const dy = event.changedTouches[0].clientY - touchStart.y;
  if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.6) showItem(activeIndex + (dx < 0 ? 1 : -1));
  touchStart = null;
}, { passive: true });
mediaHost.addEventListener('touchcancel', () => { touchStart = null; }, { passive: true });
window.addEventListener('popstate', () => { if (viewer.open) finishClose(); followPhotoHash(); });

async function loadAlbum() {
  timeline.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch('data/memories.json?v=album-1');
    if (!response.ok) throw new Error(`Album ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.items) || !data.items.length) throw new Error('Empty album');
    items = data.items;
    dated = items.filter(item => item.kind === 'image' && item.date);
    // Stable day sorting preserves the builder's capture-time order within each day.
    dated.sort((a, b) => a.date.localeCompare(b.date));
    groups = new Map();
    dated.forEach(item => {
      const month = item.date.slice(0, 7);
      if (!groups.has(month)) groups.set(month, []);
      groups.get(month).push(item);
    });
    timeline.replaceChildren(...[...groups].map(([month, list]) => renderMonth(month, list)));
    setYear(currentYear);
    renderCollected(); renderFilms();
    for (const link of $$('.hero [data-memory]')) {
      link.addEventListener('click', event => {
        const item = items.find(x => x.id === link.dataset.memory);
        if (!item) return;
        event.preventDefault();
        const [list, title] = groupFor(item);
        openViewer(list, list.indexOf(item), title, link);
      });
    }
    followPhotoHash();
  } catch (error) {
    const message = node('div', 'load-message', '사진을 불러오지 못했어요. 잠시 후 다시 펼쳐주세요.');
    message.setAttribute('role', 'alert');
    const retry = node('button', 'retry-button', '다시 펼치기');
    retry.type = 'button';
    retry.addEventListener('click', loadAlbum, { once: true });
    message.append(retry); timeline.replaceChildren(message);
    console.error(error);
  } finally { timeline.setAttribute('aria-busy', 'false'); }
}

loadAlbum();
