const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const viewer = $('#viewer');
const mediaHost = $('#viewer-media');
const PAGE_SIZE = 12;
let items = [], stories = [], categories = [];
let itemById = new Map(), storyById = new Map();
let currentCategory = 'all', currentYear = 'all', currentView = 'stories', searchQuery = '';
let storyLimit = PAGE_SIZE;
let activeGroup = [], activeIndex = 0, activeTitle = '', activeStoryId = '', journey = [];
let previousFocus = null, openedWithHistory = false, frozenScrollY = 0, touchStart = null;

const shortDate = date => date ? date.replaceAll('-', '. ') : '';
const spokenDate = date => date ? `${Number(date.slice(0, 4))}년 ${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일` : '';
const durationText = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const normalize = text => text.normalize('NFKC').toLocaleLowerCase('ko');
const categoryName = id => categories.find(category => category.id === id)?.title || '';
const mediaCount = story => [story.photoCount ? `사진 ${story.photoCount}장` : '', story.videoCount ? `영상 ${story.videoCount}편` : ''].filter(Boolean).join(' · ');

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function makeImage(item, { eager = false } = {}) {
  const image = node('img');
  image.src = item.thumb;
  image.width = item.width; image.height = item.height;
  image.alt = item.alt || '함께 남긴 사진';
  image.loading = eager ? 'eager' : 'lazy'; image.decoding = 'async';
  return image;
}

function playMark() {
  const mark = node('span', 'play-mark');
  mark.setAttribute('aria-hidden', 'true');
  mark.innerHTML = '<svg viewBox="0 0 20 20"><path d="M4 2v16l13-8Z"/></svg>';
  return mark;
}

function filteredStories() {
  const terms = normalize(searchQuery.trim()).split(/\s+/).filter(Boolean);
  return stories.filter(story => {
    if (currentCategory !== 'all' && story.category !== currentCategory) return false;
    if (currentYear === 'undated' && story.date) return false;
    if (!['all', 'undated'].includes(currentYear) && !story.date?.startsWith(currentYear)) return false;
    const haystack = normalize([story.title, story.alt, story.date || '', ...story.keywords].join(' '));
    const categoryPhrase = normalize(searchQuery.replace(/\s/g, '')) === normalize(categoryName(story.category).replace(/\s/g, ''));
    return categoryPhrase || terms.every(term => haystack.includes(term));
  });
}

function readFilters() {
  const params = new URL(location.href).searchParams;
  currentCategory = categories.some(category => category.id === params.get('topic')) ? params.get('topic') : 'all';
  currentYear = ['2024', '2025', '2026', 'undated'].includes(params.get('year')) ? params.get('year') : 'all';
  currentView = params.get('view') === 'photos' ? 'photos' : 'stories';
  searchQuery = (params.get('q') || '').slice(0, 60);
  $('#year-filter').value = currentYear;
  $('#memory-search').value = searchQuery;
}

function saveFilters(scroll = false) {
  const url = new URL(location.href);
  for (const [key, value, fallback] of [['topic', currentCategory, 'all'], ['year', currentYear, 'all'], ['view', currentView, 'stories'], ['q', searchQuery.trim(), '']]) {
    if (value === fallback) url.searchParams.delete(key); else url.searchParams.set(key, value);
  }
  if (scroll) url.hash = 'album';
  history.replaceState(null, '', url);
}

function changeFilters({ category, year, view, query } = {}, scroll = false) {
  if (category !== undefined) currentCategory = category;
  if (year !== undefined) currentYear = year;
  if (view !== undefined) currentView = view;
  if (query !== undefined) searchQuery = query;
  storyLimit = PAGE_SIZE;
  $('#year-filter').value = currentYear; $('#memory-search').value = searchQuery;
  if (!items.length) return;
  renderArchive(); saveFilters(scroll);
  if (scroll) $('#album').scrollIntoView({ block: 'start' });
}

function resetFilters() {
  changeFilters({ category: 'all', year: 'all', query: '' });
  $('#topic-tabs [data-category="all"]').focus({ preventScroll: true });
}

function renderThemes() {
  $('#theme-grid').replaceChildren(...categories.map(category => {
    const button = node('button', 'theme-card');
    button.type = 'button'; button.dataset.category = category.id;
    const count = stories.filter(story => story.category === category.id).length;
    button.setAttribute('aria-label', `${category.title}, ${count}개의 추억 보기`);
    button.setAttribute('aria-pressed', String(currentCategory === category.id));
    const cover = node('span', 'theme-photo');
    cover.append(makeImage(itemById.get(category.coverId)));
    const title = node('span', 'theme-title', category.title);
    const tally = node('span', 'theme-count', `${count}개의 추억`);
    button.append(cover, title, tally);
    button.addEventListener('click', () => changeFilters({ category: category.id, year: 'all', query: '', view: 'stories' }, true));
    return button;
  }));
  $('#topic-tabs').replaceChildren(...[{ id: 'all', title: '전체' }, ...categories].map(category => {
    const button = node('button', '', category.title);
    button.type = 'button'; button.dataset.category = category.id;
    button.setAttribute('aria-pressed', String(category.id === currentCategory));
    button.addEventListener('click', () => changeFilters({ category: category.id }));
    return button;
  }));
}

function storyCard(story) {
  const article = node('article', 'story-card');
  const button = node('button', 'story-open');
  button.type = 'button'; button.dataset.story = story.id;
  button.setAttribute('aria-label', `${story.title}${story.date ? ', ' + spokenDate(story.date) : ''}, ${mediaCount(story)}, 펼쳐보기`);
  const image = node('span', 'story-photo');
  image.append(makeImage(itemById.get(story.coverId)));
  if (!story.photoCount) image.append(playMark());
  const copy = node('span', 'story-copy');
  copy.append(node('span', 'story-category', categoryName(story.category)));
  copy.append(node('span', 'story-title', story.title));
  const footer = node('span', 'story-meta');
  if (story.date) {
    const time = node('time', '', shortDate(story.date)); time.dateTime = story.date; footer.append(time);
  }
  footer.append(node('span', '', mediaCount(story)));
  copy.append(footer); button.append(image, copy);
  button.addEventListener('click', () => openStory(story.id, button));
  article.append(button);
  return article;
}

function renderStories(selection) {
  $('#story-grid').replaceChildren(...selection.slice(0, storyLimit).map(storyCard));
  const remaining = Math.max(0, selection.length - storyLimit);
  $('#load-more').hidden = !remaining || currentView !== 'stories';
  $('#load-more').textContent = `추억 더 보기 · ${remaining}`;
}

function previewsFor(list) {
  if (list.length <= 4) return list;
  // Use reviewed covers from different scenes; retain chronological order.
  const covers = list.filter(item => storyById.get(item.storyId)?.coverId === item.id);
  let chosen = covers.length >= 4 ? [0, 1, 2, 3].map(i => covers[Math.round(i * (covers.length - 1) / 3)]) : [...covers];
  for (const fraction of [0, .35, .7, 1, .2, .5]) {
    if (chosen.length >= 4) break;
    const candidate = list[Math.round(fraction * (list.length - 1))];
    if (!chosen.includes(candidate)) chosen.push(candidate);
  }
  return chosen.sort((a, b) => list.indexOf(a) - list.indexOf(b));
}

function photoCard(item, index) {
  const figure = node('figure', 'photo-card');
  const button = node('button', 'photo-open');
  button.type = 'button'; button.dataset.memory = item.id;
  button.setAttribute('aria-label', `${item.alt}${item.date ? ', ' + spokenDate(item.date) : ''}, 크게 보기`);
  const media = node('span', 'photo-media'); media.append(makeImage(item)); button.append(media);
  button.addEventListener('click', () => openStory(item.storyId, button, item.id));
  const caption = node('figcaption');
  if (item.date) { const time = node('time', '', shortDate(item.date)); time.dateTime = item.date; caption.append(time); }
  caption.append(node('span', 'photo-number', String(index + 1).padStart(2, '0')));
  figure.append(button, caption); return figure;
}

function renderMonth(month, list) {
  const [year, number] = month.split('-');
  const title = `${year}년 ${Number(number)}월`;
  const section = node('section', 'memory-month');
  section.id = `month-${month}`; section.dataset.year = year; section.setAttribute('aria-labelledby', `heading-${month}`);
  const heading = node('div', 'month-heading'); heading.append(node('p', 'month-year', year));
  const h3 = node('h3', 'month-number', number); h3.id = `heading-${month}`; h3.setAttribute('aria-label', title);
  h3.append(node('span', '', '월')); heading.append(h3, node('p', 'month-count', `${list.length}장의 사진`));
  const content = node('div', 'month-content');
  const grid = node('div', `photo-grid${list.length === 1 ? ' single-photo' : ''}`); grid.id = `grid-${month}`;
  const preview = previewsFor(list);
  const renderCards = selection => grid.replaceChildren(...selection.map(item => photoCard(item, list.indexOf(item))));
  renderCards(preview); content.append(grid);
  if (list.length > preview.length) {
    const actions = node('div', 'month-actions');
    const toggle = node('button', 'expand-button'); toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', grid.id);
    toggle.append(document.createTextNode(`${list.length}장 펼쳐보기`), node('span', '', '+'));
    toggle.addEventListener('click', () => {
      const expand = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(expand)); grid.classList.toggle('is-expanded', expand);
      toggle.replaceChildren(document.createTextNode(expand ? '접어두기' : `${list.length}장 펼쳐보기`), node('span', '', expand ? '−' : '+'));
      renderCards(expand ? list : preview);
      if (!expand) section.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
    actions.append(toggle); content.append(actions);
  }
  section.append(heading, content); return section;
}

function renderPhotos(selection) {
  const photos = selection.filter(item => item.kind === 'image');
  const dated = photos.filter(item => item.date);
  const groups = new Map();
  for (const item of dated) { const month = item.date.slice(0, 7); if (!groups.has(month)) groups.set(month, []); groups.get(month).push(item); }
  $('#timeline').replaceChildren(...[...groups].map(([month, list]) => renderMonth(month, list)));
  const collected = photos.filter(item => !item.date);
  $('#collected-grid').replaceChildren(...collected.map(photoCard));
  $('#collected-count').textContent = `${collected.length}장`;
  $('#collected').hidden = !collected.length || currentView !== 'photos';
}

function renderFilms(films) {
  $('#films-count').textContent = `${films.length}편`;
  $('#film-grid').replaceChildren(...films.map(item => {
    const figure = node('figure', 'film-card'); const button = node('button');
    button.type = 'button';
    const title = storyById.get(item.storyId).title;
    button.setAttribute('aria-label', `${title}, ${durationText(item.duration)}, 영상 열기`);
    button.append(makeImage(item), playMark());
    button.addEventListener('click', () => openStory(item.storyId, button, item.id));
    const caption = node('figcaption'); caption.append(node('span', '', title), node('span', 'film-duration', durationText(item.duration)));
    figure.append(button, caption); return figure;
  }));
  $('#films').hidden = !films.length;
}

function renderArchive() {
  const selection = filteredStories();
  const ids = new Set(selection.flatMap(story => story.itemIds));
  const selectedItems = items.filter(item => ids.has(item.id));
  const photoCount = selectedItems.filter(item => item.kind === 'image').length;
  const videoCount = selectedItems.length - photoCount;
  $('#album-count').textContent = currentView === 'stories' ? `${selection.length}개의 추억` : mediaCount({ photoCount, videoCount }) || '0장의 사진';
  $$('[data-category]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.category === currentCategory)));
  $$('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === currentView)));
  $('#story-grid').hidden = currentView !== 'stories'; $('#timeline').hidden = currentView !== 'photos';
  $('#empty-state').hidden = selection.length > 0;
  $('#reset-filters').hidden = currentCategory === 'all' && currentYear === 'all' && !searchQuery;
  renderStories(selection);
  if (currentView === 'photos') renderPhotos(selectedItems);
  else { $('#timeline').replaceChildren(); $('#collected-grid').replaceChildren(); $('#collected').hidden = true; }
  renderFilms(selectedItems.filter(item => item.kind === 'video'));
}

function stopMedia() {
  const video = $('video', mediaHost);
  if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
}

function updateJourney() {
  const position = journey.indexOf(activeStoryId);
  for (const [selector, step, label] of [['#previous-story', -1, '이전 추억'], ['#next-story', 1, '다음 추억']]) {
    const adjacent = storyById.get(journey[position + step]);
    const button = $(selector); button.disabled = !adjacent;
    button.textContent = adjacent ? `${step < 0 ? '← ' : ''}${label} · ${adjacent.title}${step > 0 ? ' →' : ''}` : label;
  }
}

function showItem(index) {
  if (index < 0 || index >= activeGroup.length) return;
  stopMedia(); activeIndex = index;
  const item = activeGroup[index];
  const media = node(item.kind === 'video' ? 'video' : 'img');
  if (item.kind === 'video') {
    media.controls = true; media.playsInline = true; media.preload = 'metadata'; media.poster = item.thumb;
    media.setAttribute('aria-label', item.alt);
  } else { media.alt = item.alt; media.decoding = 'async'; }
  media.addEventListener('error', () => {
    if (mediaHost.firstElementChild !== media) return;
    const message = node('p', 'viewer-error', `${item.kind === 'video' ? '영상을' : '사진을'} 열지 못했어요. `);
    const link = node('a', '', '새 창에서 보기'); link.href = item.src; link.target = '_blank'; link.rel = 'noopener';
    message.append(link); mediaHost.replaceChildren(message);
  });
  media.src = item.src; mediaHost.replaceChildren(media);
  $('#viewer-title').textContent = activeTitle; $('#viewer-date').textContent = shortDate(item.date);
  $('#viewer-position').textContent = `${index + 1} / ${activeGroup.length}`;
  $('#viewer-prev').disabled = index === 0; $('#viewer-next').disabled = index === activeGroup.length - 1;
  $('#viewer-prev').setAttribute('aria-label', '이전 장면'); $('#viewer-next').setAttribute('aria-label', '다음 장면');
  $('#viewer-original').href = item.src;
  $('#viewer-original').textContent = item.kind === 'video' ? '새 창에서 보기 ↗' : '크게 보기 ↗';
  const strip = $('#viewer-strip');
  $$('button', strip).forEach((button, i) => button.setAttribute('aria-current', String(i === index)));
  const thumbnail = strip.children[index];
  if (thumbnail) strip.scrollTo({ left: Math.max(0, thumbnail.offsetLeft - strip.offsetLeft - strip.clientWidth / 2 + thumbnail.clientWidth / 2), behavior: 'instant' });
  if (openedWithHistory || viewer.open) history.replaceState({ ...history.state, albumViewer: true }, '', `#photo-${item.id}`);
}

function openStory(id, trigger = document.activeElement, requestedId = null, fromLink = false, keepJourney = false) {
  const story = storyById.get(id); if (!story) return;
  const wasOpen = viewer.open;
  if (!keepJourney) { const selection = filteredStories(); journey = (selection.some(x => x.id === id) ? selection : stories).map(x => x.id); }
  activeStoryId = id; activeTitle = story.title; activeGroup = story.itemIds.map(id => itemById.get(id));
  const index = Math.max(0, activeGroup.findIndex(item => item.id === requestedId));
  $('#viewer-strip').replaceChildren(...activeGroup.map((item, i) => {
    const button = node('button'); button.type = 'button';
    button.setAttribute('aria-label', `${i + 1}번째 ${item.kind === 'video' ? '영상' : '사진'}`);
    const img = makeImage(item); img.alt = ''; img.width = 65; img.height = 60; button.append(img);
    if (item.kind === 'video') { const mark = node('span', 'strip-play', '▶'); mark.setAttribute('aria-hidden', 'true'); button.append(mark); }
    button.addEventListener('click', () => showItem(i)); return button;
  }));
  if (!wasOpen) {
    previousFocus = trigger; frozenScrollY = window.scrollY;
    document.body.classList.add('viewer-open');
    document.body.style.position = 'fixed'; document.body.style.top = `-${frozenScrollY}px`; document.body.style.width = '100%';
    openedWithHistory = !fromLink;
    if (!fromLink) history.pushState({ ...history.state, albumViewer: true }, '', `#photo-${activeGroup[index].id}`);
  }
  showItem(index); updateJourney();
  if (!wasOpen) { viewer.showModal(); $('#viewer-close').focus({ preventScroll: true }); }
}

function finishClose() {
  if (!viewer.open) return;
  stopMedia(); viewer.close(); mediaHost.replaceChildren(); $('#viewer-strip').replaceChildren();
  document.body.classList.remove('viewer-open');
  document.body.style.position = ''; document.body.style.top = ''; document.body.style.width = '';
  window.scrollTo({ top: frozenScrollY, behavior: 'instant' });
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  else $('#album-title').focus({ preventScroll: true });
  openedWithHistory = false;
}

function closeViewer() {
  if (openedWithHistory) history.back();
  else { history.replaceState(null, '', '#album'); finishClose(); }
}

function followPhotoHash() {
  const item = itemById.get(location.hash.match(/^#photo-([a-f0-9]{12})$/)?.[1]);
  if (!item) return;
  openStory(item.storyId, $('#topic-tabs [data-category="all"]'), item.id, true);
}

$$('[data-view]').forEach(button => button.addEventListener('click', () => changeFilters({ view: button.dataset.view })));
$('#year-filter').addEventListener('change', event => changeFilters({ year: event.target.value }));
$('#memory-search').addEventListener('input', event => changeFilters({ query: event.target.value }));
$('#reset-filters').addEventListener('click', resetFilters); $('#empty-reset').addEventListener('click', resetFilters);
$('#load-more').addEventListener('click', () => {
  const oldLimit = storyLimit; storyLimit += PAGE_SIZE; renderStories(filteredStories());
  const firstNew = $('#story-grid').children[oldLimit]?.querySelector('button');
  firstNew?.focus({ preventScroll: true });
});
$('.site-header a[href="#films"]').addEventListener('click', event => {
  if (!items.length) return;
  event.preventDefault(); changeFilters({ category: 'all', year: 'all', query: '' });
  const url = new URL(location.href); url.hash = 'films'; history.replaceState(null, '', url);
  $('#films').scrollIntoView({ block: 'start' });
});
$('#viewer-close').addEventListener('click', closeViewer);
$('#viewer-prev').addEventListener('click', () => showItem(activeIndex - 1));
$('#viewer-next').addEventListener('click', () => showItem(activeIndex + 1));
for (const [selector, step] of [['#previous-story', -1], ['#next-story', 1]]) {
  $(selector).addEventListener('click', () => { const id = journey[journey.indexOf(activeStoryId) + step]; if (id) openStory(id, previousFocus, null, false, true); });
}
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
  const dx = event.changedTouches[0].clientX - touchStart.x, dy = event.changedTouches[0].clientY - touchStart.y;
  if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.6) showItem(activeIndex + (dx < 0 ? 1 : -1));
  touchStart = null;
}, { passive: true });
mediaHost.addEventListener('touchcancel', () => { touchStart = null; }, { passive: true });
window.addEventListener('popstate', () => { if (viewer.open) finishClose(); followPhotoHash(); });

async function loadAlbum() {
  $('#story-grid').setAttribute('aria-busy', 'true');
  try {
    const response = await fetch('data/memories.json?v=album-4');
    if (!response.ok) throw new Error(`Album ${response.status}`);
    const data = await response.json();
    if (!data.items?.length || !data.stories?.length || !data.categories?.length) throw new Error('Missing curated album');
    items = data.items; stories = data.stories; categories = data.categories;
    itemById = new Map(items.map(item => [item.id, item])); storyById = new Map(stories.map(story => [story.id, story]));
    readFilters(); renderThemes(); renderArchive(); $('#archive-message').replaceChildren(); followPhotoHash();
  } catch (error) {
    const message = node('div', 'load-message', '사진을 불러오지 못했어요. 잠시 후 다시 펼쳐주세요.'); message.setAttribute('role', 'alert');
    const retry = node('button', 'retry-button', '다시 펼치기'); retry.type = 'button';
    retry.addEventListener('click', loadAlbum, { once: true }); message.append(retry); $('#archive-message').replaceChildren(message);
    console.error(error);
  } finally { $('#story-grid').setAttribute('aria-busy', 'false'); }
}

loadAlbum();
