/* A separate table of contents; the album and its viewers keep their own state. */
(() => {
  if (document.querySelector('#chapters-menu')) return;
  const pages = [
    { file: 'index.html', title: '우리 사진첩', detail: '함께한 날들', icon: 'book' },
    { file: 'calendar.html', title: '그날의 우리', detail: '날짜로 꺼내 보는 추억', icon: 'calendar' },
    { file: 'future.html', title: '우리의 미래', detail: '앞으로 함께할 일들', icon: 'home' },
  ];
  const paths = {
    book: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 3v18M2 8h4M2 15h4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h2M12 14h2M7 18h2"/>',
    home: '<path d="m3 11 9-8 9 8M5 9v12h14V9M10 21v-7h4v7"/>',
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">${paths[name]}</svg>`;
  const current = location.pathname.split('/').pop() || 'index.html';
  const trigger = document.createElement('button');
  trigger.type = 'button'; trigger.className = 'chapters-toggle';
  trigger.setAttribute('aria-label', '목차 열기'); trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-controls', 'chapters-menu');
  trigger.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h10"/></svg><span>목차</span>';
  const menu = document.createElement('dialog');
  menu.id = 'chapters-menu'; menu.className = 'chapters-menu';
  menu.setAttribute('aria-labelledby', 'chapters-title');
  menu.innerHTML = `<div class="chapters-menu-top"><span class="chapters-eyebrow">너와 나의 추억저장소</span><button type="button" class="chapters-close" aria-label="목차 닫기">×</button></div>
    <h2 id="chapters-title">우리의 페이지</h2>
    <nav aria-label="사이드메뉴">${pages.map(page => `<a href="${page.file}"${current === page.file ? ' aria-current="page"' : ''}>${icon(page.icon)}<span><strong>${page.title}</strong><small>${page.detail}</small></span><span class="chapters-link-arrow" aria-hidden="true">↗</span></a>`).join('')}</nav>
    <p class="chapters-menu-foot">지나온 날들, 그리고 다음 장.</p>`;
  document.body.append(trigger, menu);
  const close = () => menu.close();
  trigger.addEventListener('click', () => {
    for (const media of document.querySelectorAll('video, audio')) media.pause();
    menu.showModal(); trigger.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('chapters-menu-open');
    menu.querySelector('.chapters-close').focus();
  });
  menu.querySelector('.chapters-close').addEventListener('click', close);
  menu.addEventListener('click', event => {
    if (event.target !== menu) return;
    const box = menu.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
  });
  menu.addEventListener('close', () => {
    trigger.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('chapters-menu-open');
    trigger.focus({ preventScroll: true });
  });
  menu.querySelectorAll('a').forEach(link => link.addEventListener('click', event => {
    if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) close();
  }));
  window.addEventListener('pagehide', () => { if (menu.open) close(); });
})();
