(() => {
  const $ = selector => document.querySelector(selector);
  const grid = $('#homes-grid');
  let homes = [], setting = 'all';
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  function external(label, url, className) {
    const link = el('a', className, label);
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') throw new Error('Source links must use HTTPS');
    link.href = parsed.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
    return link;
  }
  function card(home) {
    const article = el('article', `home-card${home.watchOnly ? ' is-watch' : ''}`);
    article.id = `home-${home.id}`;
    const top = el('div', 'home-topline');
    top.append(el('span', '', home.areaLabel));
    if (home.watchOnly) top.append(el('span', 'home-watch', '예산에 맞는 매물이 나오면'));
    article.append(top, el('h3', '', home.name), el('p', 'home-facts', `${home.year}년 · ${home.households.toLocaleString('ko-KR')}세대 · ${home.setting}`), el('p', 'home-summary', home.summary));
    const priceSummary = el('p', 'home-price-summary');
    priceSummary.append(el('small', '', '조사 기록 속 가격'), document.createTextNode(home.priceSummary));
    article.append(priceSummary);
    const naver = external('', home.naverUrl, 'home-nav-link');
    naver.setAttribute('aria-label', `${home.name} · ${home.naverLinkLabel} · 새 창`);
    naver.append(el('span', '', home.naverLinkLabel), el('span', '', '↗'));
    article.append(naver);
    const detail = el('details', 'home-details');
    detail.append(el('summary', '', '가격 근거와 함께 살펴볼 점'));
    const prices = el('div', 'home-prices');
    for (const item of home.prices) {
      const row = el('div', 'home-price');
      const line = el('div', 'home-price-top');
      line.append(el('span', '', item.label), el('span', '', item.area));
      row.append(line, el('strong', 'home-price-value', item.amount), el('small', '', item.date ? `${item.date} · ` : '원문에 시점 미기재 · '), external('출처 ↗', item.sourceUrl));
      if (item.note) row.append(el('p', '', item.note));
      prices.append(row);
    }
    detail.append(prices, el('h4', '', '같이 가서 살펴볼 것'));
    const checks = el('ul');
    home.lookFor.forEach(text => checks.append(el('li', '', text)));
    detail.append(checks, el('h4', '', '조사에 참고한 자료'));
    const sources = el('div', 'home-sources');
    home.sources.forEach(source => sources.append(external(source.label, source.url)));
    detail.append(sources); article.append(detail);
    return article;
  }
  function render() {
    const selection = homes.filter(home => setting === 'all' || home.tags.includes(setting));
    grid.replaceChildren(...selection.map(card));
    const regular = selection.filter(home => !home.watchOnly).length;
    const watch = selection.length - regular;
    $('#homes-count').textContent = `${regular}곳${watch ? ` + 더 지켜볼 ${watch}곳` : ''}`;
    $('#homes-empty').hidden = selection.length > 0;
    document.querySelectorAll('[data-setting]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.setting === setting)));
  }
  const settings = ['all', '호수', '강', '바다', '산'];
  function readSetting() {
    const requested = new URL(location.href).searchParams.get('setting');
    setting = settings.includes(requested) ? requested : 'all';
  }
  document.querySelectorAll('[data-setting]').forEach(button => button.addEventListener('click', () => {
    setting = button.dataset.setting; render();
    const url = new URL(location.href);
    if (setting === 'all') url.searchParams.delete('setting'); else url.searchParams.set('setting', setting);
    history.replaceState(history.state, '', url);
  }));
  window.addEventListener('popstate', () => { readSetting(); if (homes.length) render(); });
  async function load() {
    grid.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch('data/homes.json?v=1');
      if (!response.ok) throw new Error(`Homes ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.homes) || !data.homes.length) throw new Error('Missing homes');
      homes = data.homes;
      if (data.notice) $('#homes-note').textContent = data.notice;
      readSetting(); render(); $('#homes-message').replaceChildren();
    } catch (error) {
      const message = el('p', '', '후보를 불러오지 못했어요.');
      const retry = el('button', '', '다시 펼치기'); retry.type = 'button';
      retry.addEventListener('click', load, { once: true });
      message.append(retry); $('#homes-message').replaceChildren(message);
      console.error(error);
    } finally { grid.setAttribute('aria-busy', 'false'); }
  }
  load();
})();
