// App shell, router and the member-facing pages.
import { api, get, post, put, local, eventLog, ApiError } from './api.js';
import { esc, $, $$, icon, toast, dialog, copyText, benefitCard, emptyState, bizAvatar, catTone, stone, discountBig, formatDate } from './ui.js';
import { legalPage } from './legal.js';

export const state = { boot: null, user: null, favs: new Set(local.get('favs', [])), viewed: new Set() };
const view = () => $('#view');

// ---------- accessibility preferences ----------
function applyA11y() {
  const a = local.get('a11y', {});
  const root = document.documentElement;
  root.dataset.fontScale = a.scale || '1';
  root.toggleAttribute('data-contrast', !!a.contrast);
  root.toggleAttribute('data-links', !!a.links);
  root.toggleAttribute('data-calm', !!a.calm);
}
applyA11y();

async function openA11y() {
  const a = local.get('a11y', {});
  const opt = (k, label) => `<label class="switch"><input type="checkbox" name="${k}" ${a[k] ? 'checked' : ''}><span>${label}</span></label>`;
  await dialog({
    title: 'הגדרות נגישות',
    body: `<div class="stack">
      <div><div class="label">גודל טקסט</div>
        <div class="seg" role="radiogroup" aria-label="גודל טקסט">${[['1', 'רגיל'], ['1.15', 'גדול'], ['1.3', 'גדול מאוד']].map(([v, l]) => `<label><input type="radio" name="scale" value="${v}" ${String(a.scale || '1') === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
      </div>
      ${opt('contrast', 'ניגודיות גבוהה')}
      ${opt('links', 'הדגשת קישורים')}
      ${opt('calm', 'ביטול אנימציות')}
      <a href="#/accessibility" data-close>להצהרת הנגישות</a>
    </div>`,
    actions: [{ label: 'סגירה', value: null }],
    onMount: (w) => w.addEventListener('change', () => {
      const v = { scale: $('input[name=scale]:checked', w).value, contrast: $('input[name=contrast]', w).checked, links: $('input[name=links]', w).checked, calm: $('input[name=calm]', w).checked };
      local.set('a11y', v);
      applyA11y();
    }),
  });
}

// ---------- favorites ----------
export function toggleFav(id) {
  if (state.favs.has(id)) state.favs.delete(id);
  else { state.favs.add(id); eventLog('favorite', id); }
  local.set('favs', [...state.favs]);
  if (state.user) put('/api/me/favorites', { ids: [...state.favs] }).catch(() => {});
  $$(`[data-fav="${CSS.escape(id)}"]`).forEach(b => {
    const on = state.favs.has(id);
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
    b.setAttribute('aria-label', on ? 'הסרה מהמועדפים' : 'שמירה במועדפים');
  });
  toast(state.favs.has(id) ? 'נשמר במועדפים' : 'הוסר מהמועדפים');
}

document.addEventListener('click', (e) => {
  const fav = e.target.closest('[data-fav]');
  if (fav) { e.preventDefault(); toggleFav(fav.dataset.fav); return; }
  if (e.target.closest('[data-a11y]')) { e.preventDefault(); openA11y(); }
  const card = e.target.closest('.bcard');
  if (card && !e.target.closest('a, button')) location.hash = `#/benefit/${card.dataset.id}`;
});

// ---------- router ----------
export function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [p, q = ''] = h.split('?');
  return { path: p || '/', query: Object.fromEntries(new URLSearchParams(q)) };
}
export function go(path) { location.hash = '#' + path; }

const publicRoutes = [
  [/^\/$/, homePage],
  [/^\/search$/, searchPage],
  [/^\/benefit\/([^/]+)$/, benefitPage],
  [/^\/favorites$/, favoritesPage],
  [/^\/login$/, loginPage],
  [/^\/(privacy|terms|accessibility)$/, (q, kind) => legalPage(view(), kind, state.boot)],
];

let adminModule = null;
async function route() {
  const { path, query } = parseHash();
  document.body.classList.toggle('is-admin', path.startsWith('/admin'));
  window.scrollTo(0, 0);
  updateNav(path);
  try {
    if (path.startsWith('/admin')) {
      if (!state.user || state.user.role === 'member') return go('/login?next=' + encodeURIComponent(path));
      adminModule = adminModule || await import('./admin.js');
      return await adminModule.render(path, query);
    }
    for (const [re, fn] of publicRoutes) {
      const m = path.match(re);
      if (m) return await fn(query, ...m.slice(1));
    }
    view().innerHTML = emptyState('העמוד לא נמצא', 'אולי הקישור השתנה.', '<a class="btn primary" href="#/">לעמוד הבית</a>');
  } catch (e) {
    console.error(e);
    view().innerHTML = emptyState(e instanceof ApiError && e.status === 404 ? 'לא מצאנו את מה שחיפשת' : 'משהו השתבש', e.message, '<a class="btn primary" href="#/">לעמוד הבית</a>');
  }
  const h1 = view().querySelector('h1');
  document.title = h1 ? `${h1.textContent.trim()} · ${state.boot.siteName}` : state.boot.siteName;
}

function updateNav(path) {
  $$('[data-nav]').forEach(a => {
    const t = a.dataset.nav;
    const on = t === '/' ? path === '/' : path.startsWith(t);
    a.classList.toggle('active', on);
    on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  });
  const acct = $('#acct-link');
  if (acct) {
    const staff = state.user && state.user.role !== 'member';
    acct.href = staff ? '#/admin' : '#/login';
    acct.dataset.nav = staff ? '/admin' : '/login';
    acct.querySelector('span').textContent = staff ? 'ניהול' : state.user ? 'החשבון' : 'כניסה';
  }
}

function renderShell() {
  const b = state.boot;
  document.body.insertAdjacentHTML('afterbegin', `
    <a class="skip" href="#view">דילוג לתוכן</a>
    ${b.demo ? `<div class="demo-ribbon" role="note">${icon('info')}<span>גרסת הדגמה: הנתונים נשמרים רק בדפדפן הזה. <a href="#/login">כניסה לניהול</a></span></div>` : ''}
    <header class="site-head">
      <div class="wrap head-row">
        <a class="brand" href="#/" aria-label="${esc(b.siteName)} – לעמוד הבית">
          <img src="${esc(b.logo || window.__YR_LOGO__ || 'img/logo.jpg')}" alt="" class="brand-logo">
          <span class="brand-text"><strong>${esc(b.siteName)}</strong><small>${esc(b.tagline)}</small></span>
        </a>
        <nav class="top-nav" aria-label="ניווט ראשי">
          <a href="#/" data-nav="/">${icon('home')}<span>בית</span></a>
          <a href="#/search" data-nav="/search">${icon('search')}<span>כל ההטבות</span></a>
          <a href="#/favorites" data-nav="/favorites">${icon('heart')}<span>המועדפים שלי</span></a>
          <a href="#/login" id="acct-link" data-nav="/login">${icon('user')}<span>כניסה</span></a>
        </nav>
        <button class="icon-btn a11y-btn" data-a11y aria-label="הגדרות נגישות">${icon('textSize')}</button>
      </div>
    </header>
    <main id="view" tabindex="-1"></main>
    <footer class="site-foot">
      <div class="wrap foot-row">
        <div>${esc(b.siteName)} · מועדון ההטבות של רעות – שיקום ושילוב בקהילה</div>
        <nav aria-label="מידע">
          <a href="#/privacy">מדיניות פרטיות</a><a href="#/terms">תנאי שימוש</a><a href="#/accessibility">הצהרת נגישות</a>
        </nav>
      </div>
    </footer>
    <nav class="bottom-nav" aria-label="ניווט מהיר">
      <a href="#/" data-nav="/">${icon('home')}<span>בית</span></a>
      <a href="#/search" data-nav="/search">${icon('search')}<span>חיפוש</span></a>
      <a href="#/favorites" data-nav="/favorites">${icon('heart')}<span>מועדפים</span></a>
      <button data-a11y>${icon('textSize')}<span>נגישות</span></button>
    </nav>`);
}

// ---------- pages ----------
const CAT_ICONS = { food: 'coffee', health: 'heart', fashion: 'shirt', kids: 'family', beauty: 'sparkle', leisure: 'ticket', services: 'briefcase', online: 'globe' };

function searchBox(q = '', big = false) {
  return `<form class="search ${big ? 'big' : ''}" role="search" data-search>
    <label for="q" class="sr">חיפוש הטבה</label>
    ${icon('search')}
    <input id="q" name="q" type="search" value="${esc(q)}" placeholder="שם עסק, סוג הטבה או מילה…" autocomplete="off" enterkeyhint="search">
    <button class="btn primary" type="submit">חיפוש</button>
  </form>`;
}
function bindSearch(root) {
  $$('[data-search]', root).forEach(f => f.addEventListener('submit', e => {
    e.preventDefault();
    const q = new FormData(f).get('q').trim();
    const cur = parseHash();
    const params = new URLSearchParams(cur.path === '/search' ? cur.query : {});
    q ? params.set('q', q) : params.delete('q');
    go('/search?' + params);
  }));
}

function row(title, items, more, emptyText) {
  return `<section class="row-sec">
    <div class="sec-head"><h2>${esc(title)}</h2>${more ? `<a href="${more}" class="more">לכל ההטבות ${icon('chevL')}</a>` : ''}</div>
    ${items.length ? `<div class="hscroll">${items.map((b, i) => benefitCard(b, { fav: state.favs.has(b.id), idx: i })).join('')}</div>` : `<p class="muted pad">${esc(emptyText)}</p>`}
  </section>`;
}

async function homePage() {
  const b = state.boot;
  const home = await get('/api/public/home');
  const myCity = local.get('myCity', '');
  view().innerHTML = `
    <section class="hero">
      <div class="wrap hero-in">
        <div class="hero-stones" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <h1><span class="h-brand">${esc(b.siteName)}</span><span class="h-tag">${esc(b.tagline)}</span></h1>
        <p class="lead">${b.total} הטבות, הנחות וקופונים מעסקים שתומכים בקהילה שלנו.</p>
        ${searchBox('', true)}
      </div>
    </section>
    <div class="wrap">
      <section aria-labelledby="cats-h">
        <h2 id="cats-h" class="sr">קטגוריות</h2>
        <div class="cats">
          ${b.categories.map((c, i) => `<a class="cat tone-${catTone(c.id)}" href="#/search?category=${c.id}">
            <span class="cat-ic" style="border-radius:${stone(i)}">${icon(CAT_ICONS[c.id] || 'tag')}</span>
            <span class="cat-name">${esc(c.name)}</span><span class="cat-count">${c.count ? c.count + ' הטבות' : 'בקרוב'}</span></a>`).join('')}
          <a class="cat tone-teal" href="#/search?near=1">
            <span class="cat-ic" style="border-radius:${stone(3)}">${icon('pin')}</span>
            <span class="cat-name">הטבות באזור שלי</span><span class="cat-count">${myCity ? esc(myCity) : 'בחירת עיר'}</span></a>
        </div>
      </section>
      ${home.featured.length ? row('מומלצות', home.featured, '#/search?sort=recommended', '') : ''}
      ${row('הטבות חדשות', home.newest, '#/search?sort=new', 'עוד אין הטבות חדשות.')}
      ${row('ההטבות הפופולריות', home.popular, '#/search?sort=popular', 'עוד אין מספיק נתונים.')}
      ${row('הטבות שמסתיימות בקרוב', home.ending, '#/search?sort=ending', 'אין כרגע הטבות שמסתיימות בשלושת השבועות הקרובים.')}
    </div>`;
  bindSearch(view());
}

async function searchPage(query) {
  const b = state.boot;
  if (query.near) {
    const myCity = local.get('myCity', '');
    if (!myCity || query.pick) {
      view().innerHTML = `<div class="wrap narrow page">
        <h1>הטבות באזור שלי</h1>
        <p class="lead">באיזו עיר את גרה? נשמור את הבחירה רק במכשיר הזה.</p>
        <div class="city-pick">${b.cities.map(c => `<button class="chip big" data-city="${esc(c)}">${icon('pin')}${esc(c)}</button>`).join('') || '<p class="muted">עוד אין הטבות עם עיר מוגדרת.</p>'}</div>
        <p class="muted">רוב ההטבות זמינות גם אונליין, מכל מקום. <a href="#/search?mode=online">להטבות אונליין</a></p>
      </div>`;
      $$('[data-city]').forEach(btn => btn.addEventListener('click', () => { local.set('myCity', btn.dataset.city); go(`/search?city=${encodeURIComponent(btn.dataset.city)}&near=1`); }));
      return;
    }
    if (!query.city) return go(`/search?near=1&city=${encodeURIComponent(myCity)}`);
  }
  const { items } = await get('/api/public/benefits', { ...query, near: undefined, pick: undefined });
  const cat = b.categories.find(c => c.id === query.category);
  const title = query.near ? `הטבות ב${query.city}` : cat ? cat.name : query.q ? `תוצאות עבור „${query.q}”` : 'כל ההטבות';
  const active = ['category', 'city', 'mode', 'minDiscount'].filter(k => query[k]).length;
  const sel = (name, opts, cur, label) => `<label class="field compact"><span>${label}</span><select name="${name}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(cur || '') === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  view().innerHTML = `<div class="wrap page">
    <div class="page-head">
      <h1>${esc(title)}</h1>
      ${query.near ? `<a href="#/search?near=1&pick=1" class="more">${icon('pin')}החלפת עיר</a>` : ''}
    </div>
    ${searchBox(query.q || '')}
    <details class="filters" ${active ? 'open' : ''}>
      <summary>${icon('filter')}סינון ומיון${active ? ` <span class="count">${active}</span>` : ''}</summary>
      <form class="filter-grid" id="filters">
        ${sel('category', [['', 'כל הקטגוריות'], ...b.categories.map(c => [c.id, c.name])], query.category, 'קטגוריה')}
        ${sel('city', [['', 'כל הערים'], ...b.cities.map(c => [c, c])], query.city, 'עיר')}
        ${sel('mode', [['', 'אונליין ובבית העסק'], ['online', 'מימוש אונליין'], ['in_store', 'מימוש בבית העסק']], query.mode, 'אופן מימוש')}
        ${sel('minDiscount', [['', 'כל גובה הנחה'], ['10', '10% ומעלה'], ['20', '20% ומעלה'], ['30', '30% ומעלה'], ['50', '50% ומעלה']], query.minDiscount, 'גובה ההנחה')}
        ${sel('sort', [['recommended', 'מומלצות'], ['popular', 'הכי פופולריות'], ['new', 'הכי חדשות'], ['ending', 'מסתיימות בקרוב'], ['discount', 'הנחה גבוהה']], query.sort || 'recommended', 'מיון')}
        ${active ? '<button type="button" class="btn ghost" id="clear-f">ניקוי הסינון</button>' : ''}
      </form>
    </details>
    <p class="result-count" role="status">${items.length ? `נמצאו ${items.length} הטבות` : ''}</p>
    ${items.length ? `<div class="grid">${items.map((x, i) => benefitCard(x, { fav: state.favs.has(x.id), idx: i })).join('')}</div>`
      : emptyState(query.q ? `לא מצאנו הטבה עבור „${query.q}”` : 'אין הטבות שמתאימות לסינון', query.q ? 'רשמנו את החיפוש כדי לחפש עסקים מתאימים. בינתיים אפשר לנסות מילה אחרת או לבחור קטגוריה.' : 'אפשר לנקות חלק מהסינון ולנסות שוב.', `<div class="chips">${b.categories.filter(c => c.count).map(c => `<a class="chip" href="#/search?category=${c.id}">${esc(c.name)}</a>`).join('')}</div>`)}
  </div>`;
  bindSearch(view());
  const f = $('#filters');
  f.addEventListener('change', () => {
    const params = new URLSearchParams();
    if (query.q) params.set('q', query.q);
    if (query.near) params.set('near', '1');
    for (const [k, v] of new FormData(f)) if (v) params.set(k, v);
    if (params.get('sort') === 'recommended') params.delete('sort');
    params.set('log', '0');
    go('/search?' + params);
  });
  const clear = $('#clear-f');
  if (clear) clear.addEventListener('click', () => go('/search' + (query.q ? `?q=${encodeURIComponent(query.q)}&log=0` : '')));
}

async function benefitPage(query, id) {
  const { benefit: b, related, preview } = await get(`/api/public/benefits/${encodeURIComponent(id)}`);
  if (!preview && !state.viewed.has(id)) { state.viewed.add(id); eventLog('view', id); }
  const wa = b.whatsapp ? (b.whatsapp.startsWith('http') ? b.whatsapp : `https://wa.me/${b.whatsapp.replace(/\D/g, '').replace(/^0/, '972')}`) : '';
  const redeem = b.redeemUrl ? { href: b.redeemUrl, label: 'למימוש ההטבה באתר', ic: 'external' }
    : wa ? { href: wa, label: 'למימוש בוואטסאפ', ic: 'whatsapp' }
    : b.phone ? { href: `tel:${b.phone.replace(/[^\d+]/g, '')}`, label: `להתקשר: ${b.phone}`, ic: 'phone' } : null;
  const shareText = `${b.business.name}: ${b.title} – הטבה לחברות ${state.boot.siteName}\n${location.href.split('#')[0]}#/benefit/${b.id}`;
  const modeText = { online: 'מימוש אונליין', in_store: 'מימוש בבית העסק', both: 'מימוש אונליין או בבית העסק' }[b.redeemMode] || '';
  const validity = b.isPermanent ? 'הטבה קבועה, ללא תאריך סיום' : b.endDate ? `בתוקף עד ${formatDate(b.endDate)}${b.daysLeft !== null && b.daysLeft <= 14 ? ` (עוד ${b.daysLeft === 0 ? 'היום בלבד' : b.daysLeft + ' ימים'})` : ''}` : 'התוקף לא צוין. כדאי לוודא מול העסק.';
  const info = (ic, label, val) => val ? `<div class="info-row">${icon(ic)}<div><div class="info-label">${label}</div><div>${val}</div></div></div>` : '';
  view().innerHTML = `<div class="wrap page benefit-page">
    ${preview ? `<div class="notice warn">${icon('eye')}תצוגה מקדימה: ההטבה עדיין לא מפורסמת באתר.</div>` : ''}
    <a href="javascript:history.back()" class="back">${icon('chevR')}חזרה</a>
    <div class="bp-grid">
      <div class="bp-main">
        <div class="bp-head">
          ${bizAvatar(b.business.name, b.image, catTone(b.categoryId), 1, 'lg')}
          <div>
            <div class="bp-biz">${esc(b.business.name)}</div>
            <a class="bp-cat" href="#/search?category=${b.categoryId}">${esc(b.categoryName)}${b.subcategory ? ' · ' + esc(b.subcategory) : ''}</a>
          </div>
        </div>
        ${b.tags.length ? `<div class="tags">${b.tags.map(t => `<span class="tag tag-${t}">${{ new: 'חדש', exclusive: 'בלעדי', featured: 'מומלץ', ending: 'מסתיים בקרוב' }[t]}</span>`).join('')}</div>` : ''}
        <div class="bp-discount tone-${catTone(b.categoryId)}">${discountBig(b)}</div>
        <h1 class="bp-title">${esc(b.title)}</h1>
        ${b.fullDescription || b.shortDescription ? `<p class="bp-desc">${esc(b.fullDescription || b.shortDescription)}</p>` : ''}
      </div>
      <aside class="bp-side">
        ${b.couponCode ? `<div class="coupon"><div class="coupon-label">קוד קופון</div><div class="coupon-code" dir="ltr">${esc(b.couponCode)}</div><button class="btn secondary block" id="copy">${icon('copy')}העתקת הקוד</button></div>` : ''}
        ${redeem ? `<a class="btn primary block xl" id="redeem" href="${esc(redeem.href)}" target="_blank" rel="noopener">${icon(redeem.ic)}${esc(redeem.label)}</a>` : `<div class="notice">${icon('info')}למימוש: ${esc(modeText || 'פנו לבית העסק')} והציגו את ההטבה.</div>`}
        <div class="side-actions">
          <a class="btn ghost" id="share" href="https://wa.me/?text=${encodeURIComponent(shareText)}" target="_blank" rel="noopener">${icon('whatsapp')}שיתוף</a>
          <button class="btn ghost ${state.favs.has(b.id) ? 'on' : ''}" data-fav="${esc(b.id)}" aria-pressed="${state.favs.has(b.id)}">${icon('heart')}שמירה</button>
        </div>
      </aside>
    </div>
    <section class="bp-details">
      <h2>פרטים ותנאים</h2>
      <div class="info-list">
        ${info('store', 'אופן המימוש', esc(modeText))}
        ${info('calendar', 'תוקף', esc(validity))}
        ${info('pin', 'כתובת', b.address || b.city ? `${esc([b.address, b.city].filter(Boolean).join(', '))} <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([b.business.name, b.address, b.city].filter(Boolean).join(' '))}" target="_blank" rel="noopener">בניווט</a>` : '')}
        ${info('phone', 'טלפון', b.phone ? `<a href="tel:${esc(b.phone.replace(/[^\d+]/g, ''))}" dir="ltr">${esc(b.phone)}</a>` : '')}
        ${info('clock', 'ימים ושעות פעילות', esc(b.openingHours))}
        ${info('globe', 'אתר העסק', b.business.website ? `<a href="${esc(b.business.website)}" target="_blank" rel="noopener" dir="ltr">${esc(b.business.website.replace(/^https?:\/\/(www\.)?/, ''))}</a>` : '')}
        ${info('info', 'תנאי מימוש והחרגות', esc(b.terms))}
      </div>
      <button class="link-btn" id="report">${icon('flag')}משהו לא עובד בהטבה? דווחו לנו</button>
    </section>
    ${related.length ? row('עוד הטבות ב' + b.categoryName, related, `#/search?category=${b.categoryId}`, '') : ''}
  </div>`;
  const copy = $('#copy');
  if (copy) copy.addEventListener('click', async () => {
    const ok = await copyText(b.couponCode);
    toast(ok ? `הקוד ${b.couponCode} הועתק` : 'לא הצלחנו להעתיק. אפשר לסמן את הקוד ולהעתיק ידנית.', ok ? 'ok' : 'error');
    if (ok) eventLog('coupon_copy', b.id);
  });
  const red = $('#redeem');
  if (red) red.addEventListener('click', () => eventLog('redeem_click', b.id));
  $('#share').addEventListener('click', () => eventLog('share', b.id));
  $('#report').addEventListener('click', () => reportDialog(b));
}

async function reportDialog(b) {
  const reasons = ['הקופון לא עבד', 'העסק לא הכיר את ההטבה', 'הקישור לא עובד', 'הפרטים לא נכונים', 'ההטבה הסתיימה', 'אחר'];
  const res = await dialog({
    title: 'דיווח על הטבה',
    body: `<p class="muted">${esc(b.business.name)} – ${esc(b.title)}</p>
      <fieldset class="radios"><legend>מה קרה?</legend>${reasons.map((r, i) => `<label class="radio"><input type="radio" name="reason" value="${esc(r)}" ${i === 0 ? 'checked' : ''}><span>${esc(r)}</span></label>`).join('')}</fieldset>
      <label class="field"><span>פרטים נוספים (לא חובה)</span><textarea name="note" rows="3" maxlength="500"></textarea></label>
      <p class="muted small">הדיווח אנונימי. אין צורך לכתוב פרטים אישיים.</p>`,
    actions: [{ label: 'שליחת הדיווח', value: w => ({ reason: $('input[name=reason]:checked', w).value, note: $('textarea', w).value }) }, { label: 'ביטול', value: null }],
  });
  if (!res) return;
  try { await post('/api/public/reports', { benefitId: b.id, ...res }); toast('תודה! הדיווח נשלח לצוות'); }
  catch (e) { toast(e.message, 'error'); }
}

async function favoritesPage() {
  const ids = [...state.favs];
  const { items } = ids.length ? await post('/api/public/benefits/by-ids', { ids }) : { items: [] };
  view().innerHTML = `<div class="wrap page">
    <h1>המועדפים שלי</h1>
    ${items.length ? `<p class="muted">${items.length} הטבות שמורות${state.user ? '' : ' במכשיר הזה'}.</p><div class="grid">${items.map((b, i) => benefitCard(b, { fav: true, idx: i })).join('')}</div>`
      : emptyState('עוד לא שמרת הטבות', 'לחצי על הלב בכרטיס הטבה כדי לשמור אותה כאן.', '<a class="btn primary" href="#/search">לכל ההטבות</a>')}
    ${ids.length > items.length ? `<p class="muted small">${ids.length - items.length} הטבות שמורות כבר לא פעילות.</p>` : ''}
  </div>`;
}

async function loginPage(query) {
  if (state.user) {
    view().innerHTML = `<div class="wrap narrow page"><h1>שלום, ${esc(state.user.name)}</h1>
      <p>מחוברת בתור ${esc(state.user.roleLabel)}.</p>
      <div class="stack">${state.user.role !== 'member' ? '<a class="btn primary xl" href="#/admin">לדשבורד הניהול</a>' : ''}
      <button class="btn ghost" id="logout">${icon('logout')}התנתקות</button></div></div>`;
    $('#logout').addEventListener('click', logout);
    return;
  }
  view().innerHTML = `<div class="wrap narrow page">
    <h1>כניסה</h1>
    <p class="muted">אין צורך להתחבר כדי לצפות בהטבות ולממש אותן. הכניסה מיועדת לצוות ולחברות שרוצות לשמור מועדפים בכל המכשירים.</p>
    <form id="login" class="stack card pad">
      <label class="field"><span>מייל</span><input name="email" type="email" autocomplete="username" required dir="ltr"></label>
      <label class="field"><span>סיסמה</span><input name="password" type="password" autocomplete="current-password" required dir="ltr"></label>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn primary xl" type="submit">${icon('lock')}כניסה</button>
    </form>
    ${state.boot.demo ? `<div class="card pad demo-logins"><h2>חשבונות הדגמה</h2><p class="muted small">לחיצה ממלאת את הפרטים.</p>
      ${[['admin@yoter-reut.org.il', 'Reut2026!', 'מנהלת – גישה מלאה'], ['editor@yoter-reut.org.il', 'Edit2026!', 'עורכת תוכן – הטבות ועסקים'], ['member@yoter-reut.org.il', 'Member2026!', 'חברת קהילה']].map(([e, p, l]) => `<button class="btn ghost block" data-demo="${e}|${p}">${esc(l)}</button>`).join('')}</div>` : ''}
  </div>`;
  const f = $('#login');
  $$('[data-demo]').forEach(b => b.addEventListener('click', () => { const [e, p] = b.dataset.demo.split('|'); f.email.value = e; f.password.value = p; f.requestSubmit(); }));
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('.form-error', f);
    try {
      const { user } = await post('/api/auth/login', { email: f.email.value, password: f.password.value });
      state.user = user;
      if (window.__YR_SET_SESSION__) window.__YR_SET_SESSION__(user.id);
      if (user.role === 'member') {
        const server = await get('/api/me/favorites');
        server.ids.forEach(id => state.favs.add(id));
        local.set('favs', [...state.favs]);
        put('/api/me/favorites', { ids: [...state.favs] }).catch(() => {});
      }
      toast(`שלום ${user.name}`);
      go(query.next && user.role !== 'member' ? query.next : user.role === 'member' ? '/favorites' : '/admin');
    } catch (ex) { err.hidden = false; err.textContent = ex.message; }
  });
}

export async function logout() {
  await post('/api/auth/logout', {});
  if (window.__YR_SET_SESSION__) window.__YR_SET_SESSION__(null);
  state.user = null;
  toast('התנתקת בהצלחה');
  go('/');
}

// ---------- boot ----------
async function boot() {
  try {
    [state.boot, { user: state.user }] = await Promise.all([get('/api/public/bootstrap'), get('/api/auth/me')]);
  } catch (e) {
    document.body.innerHTML = `<div class="wrap page">${emptyState('לא הצלחנו לטעון את האתר', 'בדקו את החיבור לאינטרנט ונסו שוב.', '<button class="btn primary" onclick="location.reload()">ניסיון נוסף</button>')}</div>`;
    return;
  }
  renderShell();
  window.addEventListener('hashchange', route);
  await route();
  if ('serviceWorker' in navigator && !state.boot.demo && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

export async function refreshBoot() { state.boot = await get('/api/public/bootstrap'); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
