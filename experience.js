/* The opening and completed keepsakes work independently of the archive load. */
(() => {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const cover = $('#top');
  const book = $('#open-album');
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let openingTimer = null;

  function pauseAll(except = null) {
    for (const video of $$('video')) if (video !== except) video.pause();
  }

  function enterAlbum() {
    clearTimeout(openingTimer); openingTimer = null;
    cover.hidden = true; book.classList.remove('is-opening');
    book.removeAttribute('aria-busy');
    history.replaceState(null, '', '#keepsakes');
    $('#inside').scrollIntoView({ block: 'start', behavior: 'instant' });
    $('#keepsakes-title').focus({ preventScroll: true });
  }

  book.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (openingTimer !== null) return;
    if (reducedMotion()) { enterAlbum(); return; }
    book.setAttribute('aria-busy', 'true'); book.classList.add('is-opening');
    openingTimer = setTimeout(enterAlbum, 850);
  });

  for (const link of $$('a[href^="#"]:not(#open-album)')) {
    link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const hash = link.getAttribute('href');
      if (hash === '#top') {
        event.preventDefault(); clearTimeout(openingTimer); openingTimer = null;
        pauseAll(); cover.hidden = false; book.classList.remove('is-opening'); book.removeAttribute('aria-busy');
        history.replaceState(null, '', '#top');
        cover.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'instant' : 'smooth' });
        book.focus({ preventScroll: true });
      } else {
        clearTimeout(openingTimer); openingTimer = null; cover.hidden = true;
        book.classList.remove('is-opening'); book.removeAttribute('aria-busy');
      }
    });
  }
  function syncCover() {
    cover.hidden = Boolean((location.hash && location.hash !== '#top') || (!location.hash && location.search));
  }
  syncCover();

  const film = $('#feature-video');
  const play = $('#feature-play');
  const message = $('#feature-message');
  let filmId = 'promise-174-v2';
  let playRequest = 0;
  let pendingTime = 0;
  const filmPositions = new Map();
  const choices = $$('[data-feature]');
  play.hidden = false;

  play.addEventListener('click', async () => {
    const request = ++playRequest, requestedFilm = filmId;
    play.hidden = true; message.hidden = true;
    try { await film.play(); }
    catch (error) {
      if (request !== playRequest || requestedFilm !== filmId) return;
      play.hidden = false;
      if (error?.name !== 'AbortError') message.hidden = false;
    }
  });
  for (const choice of choices) {
    choice.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (choice.dataset.feature === filmId) return;
      playRequest++;
      filmPositions.set(filmId, film.ended ? 0 : film.currentTime);
      film.pause(); filmId = choice.dataset.feature;
      const title = choice.firstElementChild.textContent;
      pendingTime = filmPositions.get(filmId) || 0;
      film.poster = `assets/keepsakes/${filmId}-poster.webp`;
      film.src = choice.getAttribute('href'); film.load();
      $('#feature-title').textContent = title;
      $('#feature-duration').textContent = choice.lastElementChild.textContent;
      film.setAttribute('aria-label', title); play.setAttribute('aria-label', `${title} 재생`);
      $('#feature-direct').href = choice.href;
      for (const link of choices) link.setAttribute('aria-current', String(link === choice));
      play.hidden = false; message.hidden = true; $('#film-ending').hidden = true;
    });
  }
  film.addEventListener('loadedmetadata', () => {
    if (pendingTime > 0 && Number.isFinite(film.duration)) film.currentTime = Math.min(pendingTime, Math.max(0, film.duration - .1));
    pendingTime = 0;
  });
  film.addEventListener('play', () => { play.hidden = true; message.hidden = true; $('#film-ending').hidden = true; });
  film.addEventListener('ended', () => { $('#film-ending').hidden = false; play.hidden = false; });
  film.addEventListener('error', () => { message.hidden = false; play.hidden = true; });
  document.addEventListener('play', event => {
    if (event.target.tagName === 'VIDEO') pauseAll(event.target);
  }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseAll(); });
  window.addEventListener('pagehide', () => pauseAll());
  new MutationObserver(() => { if ($('#viewer').open) film.pause(); }).observe($('#viewer'), { attributes: true, attributeFilter: ['open'] });

  const gallery = $('#keepsake-viewer');
  const galleryImage = $('#keepsake-image');
  const cards = $$('[data-keepsake]');
  const keepsakes = cards.map(card => ({ id: card.dataset.keepsake, src: card.getAttribute('href'),
    title: card.querySelector('span')?.textContent || '우리, 함께', alt: card.querySelector('img').alt, card }));
  let current = 0, returnFocus = null, galleryHasHistory = false, scrollY = 0;

  function showKeepsake(index) {
    if (index < 0 || index >= keepsakes.length) return;
    current = index;
    const item = keepsakes[index];
    galleryImage.src = item.src; galleryImage.alt = item.alt;
    $('#keepsake-title').textContent = item.title;
    $('#keepsake-position').textContent = `${index + 1} / ${keepsakes.length}`;
    $('#keepsake-prev').disabled = index === 0;
    $('#keepsake-next').disabled = index === keepsakes.length - 1;
    history.replaceState({ keepsake: true }, '', `#keepsake-${item.id}`);
  }

  function openKeepsake(index, direct = false) {
    pauseAll(); returnFocus = keepsakes[index].card; scrollY = window.scrollY;
    galleryHasHistory = !direct;
    if (!direct) history.pushState({ keepsake: true }, '', `#keepsake-${keepsakes[index].id}`);
    document.body.classList.add('keepsake-open');
    document.body.style.position = 'fixed'; document.body.style.top = `-${scrollY}px`; document.body.style.width = '100%';
    showKeepsake(index); gallery.showModal(); $('#keepsake-close').focus({ preventScroll: true });
  }

  function finishGallery() {
    if (!gallery.open) return;
    gallery.close(); galleryImage.removeAttribute('src');
    document.body.classList.remove('keepsake-open');
    document.body.style.position = ''; document.body.style.top = ''; document.body.style.width = '';
    window.scrollTo({ top: scrollY, behavior: 'instant' });
    returnFocus?.focus({ preventScroll: true }); galleryHasHistory = false;
  }

  function closeGallery() {
    if (galleryHasHistory) history.back();
    else { history.replaceState(null, '', '#keepsakes'); finishGallery(); }
  }

  function followKeepsakeHash() {
    const id = location.hash.replace(/^#keepsake-/, '');
    const index = keepsakes.findIndex(item => item.id === id);
    if (index !== -1 && location.hash.startsWith('#keepsake-')) { cover.hidden = true; openKeepsake(index, true); }
  }
  cards.forEach((card, index) => card.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); cover.hidden = true; openKeepsake(index);
  }));
  $('#keepsake-close').addEventListener('click', closeGallery);
  $('#keepsake-prev').addEventListener('click', () => showKeepsake(current - 1));
  $('#keepsake-next').addEventListener('click', () => showKeepsake(current + 1));
  gallery.addEventListener('cancel', event => { event.preventDefault(); closeGallery(); });
  gallery.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); showKeepsake(current - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); showKeepsake(current + 1); }
  });
  window.addEventListener('popstate', () => {
    finishGallery();
    // app.js closes its outgoing photo dialog in the same event dispatch.
    // Open the next dialog only after both have restored their scroll locks.
    queueMicrotask(() => { syncCover(); followKeepsakeHash(); });
  });
  followKeepsakeHash();
})();
