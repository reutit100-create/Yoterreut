// Admin dashboard: overview, benefits, approval queue, demo mode, businesses, alerts, stats, settings.
import { get, post, put, local } from './api.js';
import { state, go, logout, refreshBoot } from './main.js';
import { esc, $, $$, icon, toast, dialog, confirmDialog, copyText, benefitCard, emptyState, bizAvatar, catTone, formatDate, formatDateTime, timeAgo, readImage, downloadFile, formData } from './ui.js';

const STATUS = { draft: 'טיוטה', pending: 'ממתינה לאישור', active: 'פעילה', ended: 'הסתיימה', archived: 'בארכיון' };
const SOURCE = { manual: 'ידני', email: 'מייל', import: 'ייבוא' };
const isAdmin = () => state.user && state.user.role === 'admin';
let cats = null;
const catsList = () => cats || state.boot.categories;

const NAV = [
  ['/admin', 'סקירה', 'grid'],
  ['/admin/benefits', 'הטבות', 'tag'],
  ['/admin/inbox', 'תור אישור', 'inbox', 'pending'],
  ['/admin/demo', 'הדגמת קליטה ממייל', 'play'],
  ['/admin/businesses', 'עסקים', 'building'],
  ['/admin/alerts', 'התראות ודיווחים', 'bell', 'alerts'],
  ['/admin/stats', 'נתונים', 'chart'],
  ['/admin/settings', 'הגדרות', 'settings', null, true],
];

let badges = { pending: 0, alerts: 0 };
async function refreshBadges() {
  try {
    const o = await get('/api/admin/overview');
    badges = { pending: o.pendingEmails, alerts: o.unreadAlerts };
    $$('[data-badge]').forEach(b => { const n = badges[b.dataset.badge]; b.textContent = n; b.hidden = !n; });
    return o;
  } catch { return null; }
}

function layout(path) {
  const view = $('#view');
  if (!$('.admin', view)) {
    view.innerHTML = `<div class="admin">
      <aside class="admin-nav" aria-label="ניווט ניהול">
        <div class="admin-who">${icon('user')}<div><strong>${esc(state.user.name)}</strong><small>${esc(state.user.roleLabel)}</small></div></div>
        <nav>${NAV.filter(n => !n[4] || isAdmin()).map(([p, l, ic, badge]) => `<a href="#${p}" data-anav="${p}">${icon(ic)}<span>${l}</span>${badge ? `<b class="badge" data-badge="${badge}" hidden></b>` : ''}</a>`).join('')}</nav>
        <div class="admin-nav-foot"><a href="#/">${icon('eye')}<span>לאתר</span></a><button id="admin-logout">${icon('logout')}<span>יציאה</span></button></div>
      </aside>
      <section class="admin-main" id="admin-view"></section>
    </div>`;
    $('#admin-logout').addEventListener('click', logout);
    refreshBadges();
  }
  $$('[data-anav]').forEach(a => {
    const p = a.dataset.anav;
    const on = p === '/admin' ? path === '/admin' : path.startsWith(p);
    a.classList.toggle('active', on);
    on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
    if (on) a.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  return $('#admin-view');
}

export async function render(path, query) {
  const el = layout(path);
  el.innerHTML = '<div class="loading" role="status">טוען…</div>';
  const routes = [
    [/^\/admin$/, overviewPage],
    [/^\/admin\/benefits$/, benefitsPage],
    [/^\/admin\/benefits\/new$/, (el, q) => benefitEditor(el, null, q)],
    [/^\/admin\/benefits\/([^/]+)$/, (el, q, id) => benefitEditor(el, id, q)],
    [/^\/admin\/inbox$/, inboxPage],
    [/^\/admin\/inbox\/([^/]+)$/, reviewPage],
    [/^\/admin\/demo$/, demoPage],
    [/^\/admin\/businesses$/, businessesPage],
    [/^\/admin\/businesses\/new$/, (el, q) => businessEditor(el, null, q)],
    [/^\/admin\/businesses\/([^/]+)$/, (el, q, id) => businessEditor(el, id, q)],
    [/^\/admin\/alerts$/, alertsPage],
    [/^\/admin\/stats$/, statsPage],
    [/^\/admin\/settings$/, settingsPage],
  ];
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) {
      try { await fn(el, query, ...m.slice(1)); }
      catch (e) { el.innerHTML = emptyState('לא הצלחנו לטעון את המסך', e.message, '<a class="btn primary" href="#/admin">לסקירה</a>'); }
      const h1 = $('h1', el);
      document.title = `${h1 ? h1.textContent.trim() + ' · ' : ''}ניהול ${state.boot.siteName}`;
      return;
    }
  }
  el.innerHTML = emptyState('המסך לא נמצא');
}

const pill = (status) => `<span class="pill st-${status}">${STATUS[status] || status}</span>`;
const head = (title, actions = '', sub = '') => `<div class="a-head"><div><h1>${esc(title)}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}</div><div class="a-actions">${actions}</div></div>`;

// ================= overview =================
async function overviewPage(el) {
  const o = await get('/api/admin/overview');
  badges = { pending: o.pendingEmails, alerts: o.unreadAlerts };
  $$('[data-badge]').forEach(b => { const n = badges[b.dataset.badge]; b.textContent = n; b.hidden = !n; });
  const pct = Math.min(100, Math.round((o.businesses / o.businessGoal) * 100));
  const maxCat = Math.max(1, ...o.categories.map(c => c.views));
  const tile = (n, label, href, tone = '', sub = '') => `<a class="kpi ${tone}" href="${href}"><span class="kpi-n">${n}</span><span class="kpi-l">${label}</span>${sub ? `<span class="kpi-s">${sub}</span>` : ''}</a>`;
  el.innerHTML = `
    ${head(`שלום, ${state.user.name.split(' ')[0]}`, `<a class="btn primary" href="#/admin/benefits/new">${icon('plus')}הטבה חדשה</a>`, 'מה קורה במועדון היום')}
    ${o.gmailMode !== 'live' ? `<div class="notice">${icon('mail')}<div>תיבת ה־Gmail עוד לא מחוברת, ולכן קליטת המיילים פועלת במצב הדגמה. <a href="#/admin/demo">לנסות את הקליטה עם מייל לדוגמה</a>${isAdmin() ? ' · <a href="#/admin/settings?tab=gmail">לחיבור Gmail</a>' : ''}</div></div>` : ''}
    <div class="kpis">
      ${tile(o.activeBenefits, 'הטבות פעילות', '#/admin/benefits?status=active')}
      ${tile(o.pendingEmails, 'ממתינות לבדיקה מהמייל', '#/admin/inbox', o.pendingEmails ? 'attn' : '')}
      ${tile(o.needsCompletion.length, 'דורשות השלמת פרטים', '#/admin/benefits?status=pending', o.needsCompletion.length ? 'warn' : '')}
      ${tile(o.expiring.length, 'מסתיימות ב־14 הימים הקרובים', '#/admin/benefits?status=expiring', o.expiring.length ? 'warn' : '')}
      ${tile(o.expired.length, 'הטבות שפג תוקפן', '#/admin/benefits?status=ended')}
      ${tile(o.openReports, 'דיווחים פתוחים', '#/admin/alerts?tab=reports', o.openReports ? 'attn' : '')}
    </div>
    <div class="goal card">
      <div class="goal-top"><div><div class="goal-n"><strong>${o.businesses}</strong> מתוך ${o.businessGoal} עסקים</div><div class="muted">היעד: ${o.businessGoal} עסקים במאגר</div></div><a href="#/admin/businesses/new" class="btn ghost">${icon('plus')}עסק חדש</a></div>
      <div class="progress" role="progressbar" aria-valuenow="${o.businesses}" aria-valuemin="0" aria-valuemax="${o.businessGoal}" aria-label="התקדמות ליעד העסקים"><span style="width:${pct}%"></span></div>
      <div class="muted small">${pct}% מהיעד · נשארו ${Math.max(0, o.businessGoal - o.businesses)} עסקים</div>
    </div>
    <div class="panels">
      <section class="card panel">
        <h2>${icon('alert')}דורש טיפול</h2>
        ${o.needsCompletion.length || o.pendingEmails ? `<ul class="todo">
          ${o.pendingEmails ? `<li><a href="#/admin/inbox">${icon('inbox')}<span><strong>${o.pendingEmails} הטבות מהמייל</strong> ממתינות לאישור</span></a></li>` : ''}
          ${o.needsCompletion.map(b => `<li><a href="#/admin/benefits/${b.id}">${icon('edit')}<span><strong>${esc(b.businessName)}</strong> – ${esc(b.needsCompletion)}</span></a></li>`).join('')}
        </ul>` : '<p class="muted">אין משימות פתוחות.</p>'}
      </section>
      <section class="card panel">
        <h2>${icon('calendar')}מסתיימות בקרוב</h2>
        ${o.expiring.length ? `<ul class="list">${o.expiring.map(b => `<li><a href="#/admin/benefits/${b.id}">${esc(b.businessName)} – ${esc(b.title)}</a><span class="pill ${b.daysLeft <= 2 ? 'st-crit' : 'st-warn'}">עוד ${b.daysLeft} ימים</span></li>`).join('')}</ul>` : '<p class="muted">אין הטבות שמסתיימות בשבועיים הקרובים. לרוב ההטבות עדיין לא הוגדר תאריך סיום.</p>'}
        ${o.expired.length ? `<h3>פג תוקפן</h3><ul class="list">${o.expired.slice(0, 5).map(b => `<li><a href="#/admin/benefits/${b.id}">${esc(b.businessName)} – ${esc(b.title)}</a><button class="btn small ghost" data-renew="${b.id}">חידוש</button></li>`).join('')}</ul>` : ''}
      </section>
      <section class="card panel wide">
        <h2>${icon('eye')}צפיות ומימושים ב־30 הימים האחרונים</h2>
        ${o.hasSampleStats ? '<p class="notice small">הנתונים כאן הם נתוני דוגמה עד שהאתר יעלה לאוויר. אפשר למחוק אותם בהגדרות.</p>' : ''}
        <div class="table-wrap"><table class="tbl"><thead><tr><th>הטבה</th><th class="num">צפיות</th><th class="num">לחיצות למימוש</th><th class="num">העתקות קופון</th></tr></thead>
        <tbody>${o.topBenefits.map(b => `<tr><td><a href="#/admin/benefits/${b.id}">${esc(b.businessName)}</a><div class="muted small">${esc(b.title)}</div></td><td class="num">${b.views}</td><td class="num">${b.redeems}</td><td class="num">${b.copies}</td></tr>`).join('')}</tbody></table></div>
        <a class="more" href="#/admin/stats">לכל הנתונים ${icon('chevL')}</a>
      </section>
      <section class="card panel">
        <h2>${icon('grid')}קטגוריות פופולריות</h2>
        <div class="bars">${o.categories.map(c => `<div class="bar-row" title="${esc(c.name)}: ${c.views} צפיות, ${c.benefits} הטבות"><span class="bar-label">${esc(c.name)}</span><span class="bar-track"><span class="bar" style="width:${(c.views / maxCat) * 100}%"></span></span><span class="bar-val">${c.views}</span></div>`).join('')}</div>
      </section>
      <section class="card panel">
        <h2>${icon('search')}חיפושים שלא נמצאה להם הטבה</h2>
        ${o.zeroSearches.length ? `<ul class="list">${o.zeroSearches.map(s => `<li><span>„${esc(s.q)}”</span><span class="muted">${s.n} חיפושים</span></li>`).join('')}</ul><p class="muted small">רעיונות לעסקים שכדאי לגייס.</p>` : '<p class="muted">אין עדיין.</p>'}
      </section>
      <section class="card panel">
        <h2>${icon('mail')}סיכום שבועי</h2>
        <dl class="summary">
          <div><dt>הטבות חדשות</dt><dd>${o.weekly.newBenefits}</dd></div>
          <div><dt>הסתיימו</dt><dd>${o.weekly.expired}</dd></div>
          <div><dt>צפיות</dt><dd>${o.weekly.views}</dd></div>
          <div><dt>לחיצות למימוש</dt><dd>${o.weekly.redeems}</dd></div>
        </dl>
        <p class="muted small">מקור ההטבות: ${o.sources.manual} ידני · ${o.sources.email} מהמייל · ${o.sources.import} מייבוא</p>
      </section>
    </div>`;
  $$('[data-renew]', el).forEach(b => b.addEventListener('click', () => renewDialog(b.dataset.renew, () => overviewPage(el))));
}

// ================= benefits list =================
async function benefitsPage(el, query) {
  const { items } = await get('/api/admin/benefits', query);
  const selected = new Set();
  const canReorder = !query.q && !query.status && !query.category && !query.source;
  const opts = (list, cur) => list.map(([v, l]) => `<option value="${v}" ${String(cur || '') === v ? 'selected' : ''}>${l}</option>`).join('');
  el.innerHTML = `
    ${head('הטבות', `<a class="btn primary" href="#/admin/benefits/new">${icon('plus')}הטבה חדשה</a>
      <button class="btn ghost" id="imp">${icon('upload')}ייבוא מ־Excel</button>
      <button class="btn ghost" id="exp">${icon('download')}ייצוא</button>`)}
    <form class="toolbar" id="bf">
      <label class="field compact grow"><span class="sr">חיפוש</span><input name="q" type="search" placeholder="חיפוש לפי עסק, כותרת, קופון…" value="${esc(query.q || '')}"></label>
      <label class="field compact"><span class="sr">סטטוס</span><select name="status">${opts([['', 'כל ההטבות (ללא ארכיון)'], ['active', 'פעילות'], ['pending', 'ממתינות לאישור'], ['draft', 'טיוטות'], ['expiring', 'מסתיימות בקרוב'], ['ended', 'הסתיימו'], ['needs', 'עם פרטים חסרים'], ['archived', 'בארכיון']], query.status)}</select></label>
      <label class="field compact"><span class="sr">קטגוריה</span><select name="category">${opts([['', 'כל הקטגוריות'], ...catsList().map(c => [c.id, c.name])], query.category)}</select></label>
      <label class="field compact"><span class="sr">מקור</span><select name="source">${opts([['', 'כל המקורות'], ['manual', 'ידני'], ['email', 'מייל'], ['import', 'ייבוא']], query.source)}</select></label>
    </form>
    <div class="bulk" id="bulk" hidden>
      <strong id="bulk-n"></strong>
      <button class="btn small" data-bulk="publish">פרסום</button>
      <button class="btn small" data-bulk="unpublish">הסרה מהאתר</button>
      <button class="btn small" data-bulk="archive">לארכיון</button>
      <button class="btn small" data-bulk="feature">סימון כמומלצת</button>
      <button class="btn small" data-bulk="exclusive">סימון כבלעדית</button>
      <button class="btn small" data-bulk="category">שינוי קטגוריה</button>
      <button class="btn small" data-bulk="endDate">תאריך סיום</button>
      <button class="btn small" data-bulk="permanent">הטבה קבועה</button>
    </div>
    <p class="muted small">${items.length} הטבות${canReorder ? ' · אפשר לשנות את סדר ההצגה באתר עם החיצים' : ''}</p>
    ${items.length ? `<div class="blist" role="list">${items.map((b, i) => `
      <div class="brow" role="listitem" data-id="${b.id}">
        <label class="chk"><input type="checkbox" data-sel="${b.id}" aria-label="בחירת ${esc(b.title)}"></label>
        ${bizAvatar(b.businessName, b.image, catTone(b.categoryId), i, 'sm')}
        <div class="brow-main">
          <a href="#/admin/benefits/${b.id}" class="brow-title">${esc(b.businessName)} – ${esc(b.title)}</a>
          <div class="brow-meta">${pill(b.status)}${b.featured ? '<span class="pill st-feat">מומלצת</span>' : ''}${b.exclusive ? '<span class="pill st-feat">בלעדית</span>' : ''}
            <span>${esc(b.categoryName)}</span><span>${b.isPermanent ? 'קבועה' : b.endDate ? `עד ${formatDate(b.endDate)}` : 'ללא תוקף מוגדר'}</span>
            <span>${SOURCE[b.source] || ''}</span><span>${icon('eye')}${b.stats.views} · ${b.stats.redeems} מימושים</span></div>
          ${b.issues.length ? `<div class="brow-issues">${icon('alert')}${esc(b.issues.join(' · '))}</div>` : ''}
        </div>
        <div class="brow-actions">
          ${canReorder ? `<button class="icon-btn" data-move="-1" aria-label="להזיז למעלה" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button><button class="icon-btn" data-move="1" aria-label="להזיז למטה" ${i === items.length - 1 ? 'disabled' : ''}>${icon('down')}</button>` : ''}
          <a class="icon-btn" href="#/admin/benefits/${b.id}" aria-label="עריכה">${icon('edit')}</a>
          <button class="icon-btn" data-more="${b.id}" aria-label="פעולות נוספות">${icon('menu')}</button>
        </div>
      </div>`).join('')}</div>` : emptyState('לא נמצאו הטבות', 'נסי לשנות את הסינון.')}`;

  const f = $('#bf', el);
  let t;
  const apply = () => { const p = new URLSearchParams(); for (const [k, v] of new FormData(f)) if (v) p.set(k, v); go('/admin/benefits' + (p.toString() ? '?' + p : '')); };
  f.addEventListener('change', apply);
  f.q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(apply, 500); });
  f.addEventListener('submit', e => { e.preventDefault(); apply(); });
  if (query.q) { f.q.focus(); f.q.setSelectionRange(f.q.value.length, f.q.value.length); }

  const bulkBar = $('#bulk', el);
  el.addEventListener('change', e => {
    const c = e.target.closest('[data-sel]');
    if (!c) return;
    c.checked ? selected.add(c.dataset.sel) : selected.delete(c.dataset.sel);
    bulkBar.hidden = !selected.size;
    $('#bulk-n', el).textContent = `${selected.size} נבחרו`;
  });
  $$('[data-bulk]', el).forEach(btn => btn.addEventListener('click', async () => {
    const action = btn.dataset.bulk;
    let value = true;
    if (action === 'category') {
      value = await dialog({ title: 'שינוי קטגוריה', body: `<label class="field"><span>קטגוריה</span><select id="bc">${catsList().map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>`, actions: [{ label: 'עדכון', value: w => $('#bc', w).value }, { label: 'ביטול', value: null }] });
      if (!value) return;
    }
    if (action === 'endDate') {
      value = await dialog({ title: 'תאריך סיום להטבות שנבחרו', body: '<label class="field"><span>תאריך סיום</span><input type="date" id="bd"></label>', actions: [{ label: 'עדכון', value: w => $('#bd', w).value }, { label: 'ביטול', value: null }] });
      if (!value) return;
    }
    try {
      const r = await post('/api/admin/benefits/bulk', { ids: [...selected], action, value });
      toast(`עודכנו ${r.updated} הטבות`);
      if (r.errors.length) await dialog({ title: 'חלק מההטבות לא עודכנו', body: `<ul>${r.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul>` });
      benefitsPage(el, query);
    } catch (e) { toast(e.message, 'error'); }
  }));

  $$('[data-move]', el).forEach(btn => btn.addEventListener('click', async () => {
    const ids = items.map(b => b.id);
    const id = btn.closest('[data-id]').dataset.id;
    const i = ids.indexOf(id), j = i + Number(btn.dataset.move);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await post('/api/admin/benefits/reorder', { ids });
    benefitsPage(el, query);
  }));
  $$('[data-more]', el).forEach(btn => btn.addEventListener('click', () => benefitActions(items.find(b => b.id === btn.dataset.more))));
  $('#exp', el).addEventListener('click', () => exportDialog('benefits'));
  $('#imp', el).addEventListener('click', () => importDialog(() => benefitsPage(el, query)));
}

async function benefitActions(b) {
  const acts = [
    ['edit', 'עריכה', 'edit'], ['preview', 'תצוגה מקדימה באתר', 'eye'], ['duplicate', 'שכפול', 'copy'],
    b.status === 'active' ? ['unpublish', 'הסרה מהאתר (לטיוטה)', 'eye'] : ['publish', 'פרסום באתר', 'check'],
    ['renew', b.status === 'ended' ? 'חידוש הטבה שפג תוקפה' : 'הארכת תוקף', 'refresh'],
    ['renewal', 'הודעת חידוש לעסק', 'whatsapp'],
    b.status !== 'archived' ? ['archive', 'העברה לארכיון', 'archive'] : ['unarchive', 'החזרה מהארכיון (לטיוטה)', 'archive'],
    ...(isAdmin() ? [['delete', 'מחיקה לצמיתות', 'trash']] : []),
  ];
  let choice = null;
  await dialog({
    title: `${b.businessName} – ${b.title}`,
    body: `<div class="action-list">${acts.map(([k, l, ic]) => `<button class="btn ${k === 'delete' ? 'danger-ghost' : 'ghost'} block" data-act="${k}">${icon(ic)}${l}</button>`).join('')}</div>`,
    actions: [{ label: 'סגירה', value: null, kind: 'ghost' }],
    onMount: w => $$('[data-act]', w).forEach(x => x.addEventListener('click', () => { choice = x.dataset.act; $('[data-close]', w).click(); })),
  });
  if (choice) runAction(choice, b.id);
}

async function runAction(act, id) {
  const reload = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
  try {
    if (act === 'edit') return go(`/admin/benefits/${id}`);
    if (act === 'preview') return go(`/benefit/${id}`);
    if (act === 'duplicate') { const r = await post(`/api/admin/benefits/${id}/duplicate`); toast('ההטבה שוכפלה כטיוטה'); return go(`/admin/benefits/${r.benefit.id}`); }
    if (act === 'publish') { await post(`/api/admin/benefits/${id}/status`, { status: 'active' }); toast('ההטבה פורסמה'); return reload(); }
    if (act === 'unpublish') { await post(`/api/admin/benefits/${id}/status`, { status: 'draft' }); toast('ההטבה הוסרה מהאתר'); return reload(); }
    if (act === 'archive') { await post(`/api/admin/benefits/${id}/status`, { status: 'archived' }); toast('ההטבה הועברה לארכיון'); return reload(); }
    if (act === 'unarchive') { await post(`/api/admin/benefits/${id}/status`, { status: 'draft' }); toast('ההטבה הוחזרה כטיוטה'); return reload(); }
    if (act === 'renew') return renewDialog(id, reload);
    if (act === 'renewal') return renewalMessage(id);
    if (act === 'delete') {
      const v = await dialog({
        title: 'מחיקה לצמיתות',
        body: '<p>מחיקה לצמיתות אי אפשר לבטל. אם רוצים רק להסתיר את ההטבה, עדיף להעביר אותה לארכיון.</p><label class="field"><span>להקליד „מחיקה” לאישור</span><input id="cf" autocomplete="off"></label>',
        actions: [{ label: 'מחיקה לצמיתות', kind: 'danger', value: w => $('#cf', w).value }, { label: 'ביטול', value: null }],
      });
      if (v === null) return;
      await post(`/api/admin/benefits/${id}/delete`, { confirm: v.trim() });
      toast('ההטבה נמחקה');
      return go('/admin/benefits');
    }
  } catch (e) { toast(e.message, 'error'); }
}

async function renewDialog(id, done) {
  const v = await dialog({
    title: 'חידוש או הארכת הטבה',
    body: `<div class="stack"><label class="field"><span>תאריך סיום חדש</span><input type="date" id="rd"></label>
      <label class="switch"><input type="checkbox" id="rp"><span>הטבה קבועה ללא תאריך סיום</span></label>
      <p class="muted small">ההטבה תפורסם שוב באתר.</p></div>`,
    actions: [{ label: 'חידוש ופרסום', value: w => ({ endDate: $('#rd', w).value, isPermanent: $('#rp', w).checked }) }, { label: 'ביטול', value: null }],
  });
  if (!v) return;
  try { await post(`/api/admin/benefits/${id}/renew`, v); toast('ההטבה חודשה ופורסמה'); done && done(); }
  catch (e) { toast(e.message, 'error'); }
}

async function renewalMessage(id) {
  const m = await get(`/api/admin/benefits/${id}/renewal-message`);
  await dialog({
    title: 'הודעת חידוש לעסק',
    body: `<p class="muted small">אפשר לערוך את הנוסח לפני השליחה.</p><textarea id="rm" rows="10" class="mono-ish">${esc(m.text)}</textarea>
      <div class="row-btns">
        <button class="btn ghost" id="rm-copy">${icon('copy')}העתקה</button>
        ${m.whatsappUrl ? `<a class="btn ghost" id="rm-wa" href="${esc(m.whatsappUrl)}" target="_blank" rel="noopener">${icon('whatsapp')}פתיחה בוואטסאפ</a>` : '<span class="muted small">לעסק אין מספר טלפון במאגר.</span>'}
        ${m.mailto ? `<a class="btn ghost" id="rm-mail" href="${esc(m.mailto)}">${icon('mail')}פתיחה במייל</a>` : ''}
      </div>
      ${m.email ? `<p class="muted small">מייל העסק: <span dir="ltr">${esc(m.email)}</span></p>` : ''}
      <p class="muted small">בעתיד: שליחה ישירה דרך WhatsApp Business API.</p>`,
    onMount: w => {
      const ta = $('#rm', w);
      const sync = () => {
        const wa = $('#rm-wa', w); if (wa) wa.href = wa.href.replace(/text=.*$/, 'text=' + encodeURIComponent(ta.value));
        const ml = $('#rm-mail', w); if (ml) ml.href = ml.href.replace(/body=.*$/, 'body=' + encodeURIComponent(ta.value));
      };
      ta.addEventListener('input', sync);
      $('#rm-copy', w).addEventListener('click', async () => toast(await copyText(ta.value) ? 'ההודעה הועתקה' : 'לא הצלחנו להעתיק', 'ok'));
    },
  });
}

// ================= benefit editor =================
async function benefitEditor(el, id, query) {
  const [{ items: businesses }, data] = await Promise.all([
    get('/api/admin/businesses'),
    id ? get(`/api/admin/benefits/${id}`) : Promise.resolve(null),
  ]);
  const b = data ? data.benefit : {
    businessId: query.businessId || '', title: '', shortDescription: '', fullDescription: '', categoryId: '', subcategory: '', discountType: 'percent',
    discountValue: '', discountLabel: '', couponCode: '', redeemUrl: '', whatsapp: '', phone: '', address: '', city: '', redeemMode: 'in_store',
    openingHours: '', terms: '', startDate: new Date().toISOString().slice(0, 10), endDate: '', isPermanent: false, image: '', featured: false,
    exclusive: false, status: 'draft', needsCompletion: '',
  };
  let image = b.image || '';
  const fld = (name, label, attrs = '', hint = '') => `<label class="field"><span>${label}</span><input name="${name}" value="${esc(b[name] ?? '')}" ${attrs}>${hint ? `<small>${hint}</small>` : ''}</label>`;
  const cat = catsList().find(c => c.id === b.categoryId);
  el.innerHTML = `
    ${head(id ? 'עריכת הטבה' : 'הטבה חדשה', id ? `${pill(b.status)}<button class="btn ghost" data-more-editor>${icon('menu')}פעולות</button>` : '', id ? `${esc(b.businessName)} · נוצרה ${formatDateTime(b.createdAt)} · מקור: ${SOURCE[b.source] || ''}` : '')}
    ${b.issues && b.issues.length ? `<div class="notice warn">${icon('alert')}<div><strong>לבדיקה:</strong> ${esc(b.issues.join(' · '))}</div></div>` : ''}
    ${data && data.sourceEmail ? `<div class="notice">${icon('mail')}<div>ההטבה התקבלה במייל מ־${esc(data.sourceEmail.fromName || data.sourceEmail.from)}. <a href="#/admin/inbox/${data.sourceEmail.id}">למייל המקורי</a></div></div>` : ''}
    <div class="editor" data-editor-id="${id || ''}">
      <form id="bform" class="editor-form" novalidate>
        <fieldset class="card pad"><legend>העסק</legend>
          <div class="row2">
            <label class="field"><span>שם העסק *</span><select name="businessId" required><option value="">בחירת עסק…</option>${businesses.map(z => `<option value="${z.id}" ${z.id === b.businessId ? 'selected' : ''}>${esc(z.name)}</option>`).join('')}</select></label>
            <div class="field"><span>&nbsp;</span><a class="btn ghost" href="#/admin/businesses/new?return=benefit">${icon('plus')}עסק חדש</a></div>
          </div>
        </fieldset>
        <fieldset class="card pad"><legend>ההטבה</legend>
          ${fld('title', 'כותרת ההטבה *', 'required maxlength="80"', 'קצרה וברורה, למשל „20% הנחה על כל האתר”')}
          <label class="field"><span>תיאור קצר</span><input name="shortDescription" value="${esc(b.shortDescription)}" maxlength="140"><small>מופיע בכרטיס. עד 140 תווים.</small></label>
          <label class="field"><span>תיאור מלא</span><textarea name="fullDescription" rows="4">${esc(b.fullDescription)}</textarea></label>
          <button type="button" class="btn ghost small" id="rewrite">${icon('wand')}ניסוח שיווקי וקצר</button>
          <div class="row2">
            <label class="field"><span>קטגוריה *</span><select name="categoryId" required><option value="">בחירה…</option>${catsList().map(c => `<option value="${c.id}" ${c.id === b.categoryId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
            <label class="field"><span>תת־קטגוריה</span><input name="subcategory" list="subcats" value="${esc(b.subcategory)}"><datalist id="subcats">${(cat ? cat.subcategories || [] : []).map(s => `<option value="${esc(s)}">`).join('')}</datalist></label>
          </div>
        </fieldset>
        <fieldset class="card pad"><legend>גובה ההטבה</legend>
          <div class="seg" role="radiogroup" aria-label="סוג ההטבה">${[['percent', 'אחוז הנחה'], ['amount', 'סכום / מחיר'], ['gift', 'מתנה / אחר']].map(([v, l]) => `<label><input type="radio" name="discountType" value="${v}" ${b.discountType === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
          <div class="row2">
            <label class="field"><span id="dv-label">${b.discountType === 'amount' ? 'סכום בשקלים' : 'אחוז הנחה'}</span><input name="discountValue" type="number" min="0" inputmode="decimal" value="${esc(b.discountValue)}"></label>
            ${fld('discountLabel', 'ניסוח מיוחד (לא חובה)', 'maxlength="40"', 'למשל „220 ₪ במקום 350 ₪”. מחליף את המספר בכרטיס.')}
          </div>
        </fieldset>
        <fieldset class="card pad"><legend>מימוש</legend>
          <div class="seg" role="radiogroup" aria-label="אופן מימוש">${[['in_store', 'בבית העסק'], ['online', 'אונליין'], ['both', 'גם וגם']].map(([v, l]) => `<label><input type="radio" name="redeemMode" value="${v}" ${b.redeemMode === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
          <div class="row2">
            <label class="field"><span>קוד קופון</span><div class="input-btn"><input name="couponCode" value="${esc(b.couponCode)}" dir="ltr" maxlength="30"><button type="button" class="btn ghost small" id="gen">יצירת קוד</button></div></label>
            ${fld('redeemUrl', 'קישור למימוש', 'type="url" dir="ltr" placeholder="https://"')}
          </div>
          <div class="row2">
            ${fld('whatsapp', 'וואטסאפ (מספר או קישור)', 'dir="ltr" inputmode="tel"')}
            ${fld('phone', 'טלפון', 'type="tel" dir="ltr"')}
          </div>
          <div class="row2">
            ${fld('address', 'כתובת')}
            ${fld('city', 'עיר', 'list="cities"')}<datalist id="cities">${state.boot.cities.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
          </div>
          ${fld('openingHours', 'ימים ושעות פעילות', '', 'למשל „א׳–ה׳ 9:00–19:00”')}
          <label class="field"><span>תנאי מימוש והחרגות</span><textarea name="terms" rows="3">${esc(b.terms)}</textarea></label>
        </fieldset>
        <fieldset class="card pad"><legend>תוקף</legend>
          <div class="row2">
            ${fld('startDate', 'תאריך התחלה', 'type="date"')}
            <label class="field"><span>תאריך סיום</span><input name="endDate" type="date" value="${esc(b.endDate)}" ${b.isPermanent ? 'disabled' : ''}></label>
          </div>
          <label class="switch"><input type="checkbox" name="isPermanent" ${b.isPermanent ? 'checked' : ''}><span>הטבה קבועה ללא תאריך סיום</span></label>
        </fieldset>
        <fieldset class="card pad"><legend>תמונה ותצוגה</legend>
          <div class="img-pick">
            <div id="img-prev">${bizAvatar(businesses.find(z => z.id === b.businessId)?.name || '', image, catTone(b.categoryId), 0, 'lg')}</div>
            <div class="stack"><label class="btn ghost small file">${icon('upload')}העלאת לוגו או תמונה<input type="file" accept="image/*" id="img" hidden></label>
            <button type="button" class="link-btn" id="img-clear" ${image ? '' : 'hidden'}>הסרת התמונה</button><small class="muted">בלי תמונה יוצג הלוגו של העסק או האות הראשונה.</small></div>
          </div>
          <label class="switch"><input type="checkbox" name="featured" ${b.featured ? 'checked' : ''}><span>הטבה מומלצת</span></label>
          <label class="switch"><input type="checkbox" name="exclusive" ${b.exclusive ? 'checked' : ''}><span>הטבה בלעדית לחברות יותר רעות</span></label>
        </fieldset>
        <fieldset class="card pad internal"><legend>${icon('lock')}פנימי (לא מוצג באתר)</legend>
          <label class="field"><span>מה חסר להשלמה</span><input name="needsCompletion" value="${esc(b.needsCompletion || '')}" placeholder="למשל: לאמת את התוקף מול העסק"><small>כל עוד השדה מלא, ההטבה מופיעה ברשימת „דורשות השלמה”.</small></label>
        </fieldset>
        <p class="form-error" role="alert" hidden></p>
        <div class="sticky-actions">
          <button type="submit" class="btn primary" data-status="active">${icon('check')}${b.status === 'active' ? 'שמירה' : 'שמירה ופרסום'}</button>
          <button type="submit" class="btn ghost" data-status="draft">שמירה כטיוטה</button>
          ${b.status !== 'active' ? '<button type="submit" class="btn ghost" data-status="pending">שמירה לאישור</button>' : ''}
          <button type="button" class="btn ghost" id="pv">${icon('eye')}תצוגה מקדימה</button>
        </div>
      </form>
      <aside class="editor-side">
        <div class="sticky"><h2 class="small-h">כך זה ייראה באתר</h2><div id="live"></div>
        ${data && data.history.length ? `<h2 class="small-h">היסטוריה</h2><ul class="history">${data.history.map(h => `<li><span>${esc(h.summary)}</span><small>${esc(h.userName)} · ${formatDateTime(h.at)}</small></li>`).join('')}</ul>` : ''}</div>
      </aside>
    </div>`;

  const form = $('#bform', el);
  const toPublic = () => {
    const v = formData(form);
    const biz = businesses.find(z => z.id === v.businessId) || { name: 'שם העסק' };
    const n = Number(v.discountValue) || 0;
    const text = v.discountLabel || (v.discountType === 'percent' && n ? `${n}% הנחה` : v.discountType === 'amount' && n ? `${n} ₪ הנחה` : 'הטבה');
    return {
      id: id || 'preview', title: v.title || 'כותרת ההטבה', shortDescription: v.shortDescription, fullDescription: v.fullDescription, categoryId: v.categoryId,
      categoryName: catsList().find(c => c.id === v.categoryId)?.name || 'קטגוריה', discountType: v.discountType, discountValue: n, discountText: text,
      couponCode: v.couponCode, city: v.city || biz.city, redeemMode: v.redeemMode, endDate: v.isPermanent ? '' : v.endDate, isPermanent: v.isPermanent,
      image: image || biz.logo || '', tags: [v.exclusive && 'exclusive', v.featured && 'featured'].filter(Boolean), business: { name: biz.name },
    };
  };
  const live = () => { $('#live', el).innerHTML = benefitCard(toPublic()); };
  live();
  form.addEventListener('input', live);
  form.addEventListener('change', e => {
    if (e.target.name === 'isPermanent') form.endDate.disabled = e.target.checked;
    if (e.target.name === 'discountType') $('#dv-label', el).textContent = e.target.value === 'amount' ? 'סכום בשקלים' : 'אחוז הנחה';
    if (e.target.name === 'categoryId') {
      const c = catsList().find(x => x.id === e.target.value);
      $('#subcats', el).innerHTML = (c ? c.subcategories || [] : []).map(s => `<option value="${esc(s)}">`).join('');
    }
    live();
  });
  $('#gen', el).addEventListener('click', async () => {
    const biz = businesses.find(z => z.id === form.businessId.value);
    const prefix = biz && /^[A-Za-z]/.test(biz.name) ? biz.name.replace(/[^A-Za-z]/g, '').slice(0, 5) : 'REUT';
    const { code } = await post('/api/admin/coupon', { prefix });
    form.couponCode.value = code; live();
  });
  $('#img', el).addEventListener('change', async (e) => {
    try { image = await readImage(e.target.files[0]); $('#img-prev', el).innerHTML = bizAvatar('', image, 'teal', 0, 'lg'); $('#img-clear', el).hidden = false; live(); }
    catch (ex) { toast(ex.message, 'error'); }
  });
  $('#img-clear', el).addEventListener('click', () => { image = ''; $('#img-prev', el).innerHTML = bizAvatar('', '', 'teal', 0, 'lg'); $('#img-clear', el).hidden = true; live(); });
  $('#rewrite', el).addEventListener('click', async () => {
    const v = formData(form);
    const biz = businesses.find(z => z.id === v.businessId);
    const r = await post('/api/admin/rewrite', { ...v, businessName: biz ? biz.name : '' });
    const ok = await dialog({ title: 'הצעת ניסוח', body: `<p class="muted small">${r.engine === 'ai' ? 'נוסח בעזרת AI.' : 'ניסוח אוטומטי בסיסי (ה־AI לא מחובר בגרסה הזו).'}</p><div class="card pad"><strong>${esc(r.title)}</strong><p>${esc(r.shortDescription)}</p></div>`, actions: [{ label: 'שימוש בניסוח', value: true }, { label: 'ביטול', value: false }] });
    if (ok) { form.title.value = r.title; form.shortDescription.value = r.shortDescription; live(); }
  });
  $('#pv', el).addEventListener('click', () => previewDialog(toPublic(), formData(form)));
  const more = $('[data-more-editor]', el);
  if (more) more.addEventListener('click', () => benefitActions(b));

  let submitStatus = 'draft';
  $$('[type=submit]', form).forEach(btn => btn.addEventListener('click', () => { submitStatus = btn.dataset.status; }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = formData(form);
    const err = $('.form-error', form);
    err.hidden = true;
    if (!v.title.trim()) { err.hidden = false; err.textContent = 'יש למלא כותרת להטבה.'; form.title.focus(); return; }
    const payload = { ...v, image, status: submitStatus };
    try {
      const r = id ? await put(`/api/admin/benefits/${id}`, payload) : await post('/api/admin/benefits', payload);
      toast(r.benefit.status === 'active' ? 'נשמר ופורסם באתר' : `נשמר (${STATUS[r.benefit.status]})`);
      if (!id) go(`/admin/benefits/${r.benefit.id}`); else benefitEditor(el, id, query);
    } catch (ex) { err.hidden = false; err.textContent = ex.message; err.scrollIntoView({ block: 'center' }); }
  });
}

function previewDialog(pb, v) {
  const terms = v.terms ? `<p><strong>תנאים:</strong> ${esc(v.terms)}</p>` : '';
  dialog({
    title: 'תצוגה מקדימה',
    wide: true,
    body: `<div class="preview-grid"><div>${benefitCard(pb)}</div><div class="card pad"><h3>${esc(pb.title)}</h3><p>${esc(v.fullDescription || v.shortDescription || '')}</p>${pb.couponCode ? `<p>קוד קופון: <strong dir="ltr">${esc(pb.couponCode)}</strong></p>` : ''}${terms}${v.redeemUrl ? `<p>קישור: <span dir="ltr">${esc(v.redeemUrl)}</span></p>` : ''}</div></div>`,
  });
}

// ================= inbox / approval queue =================
async function inboxPage(el, query) {
  const status = query.status ?? 'pending_review';
  const { items, counts } = await get('/api/admin/emails', { status });
  const live = state.boot && (await get('/api/admin/overview')).gmailMode === 'live';
  el.innerHTML = `
    ${head('תור אישור', `${live ? `<button class="btn primary" id="check">${icon('refresh')}בדיקת מיילים חדשים</button>` : ''}<a class="btn ${live ? 'ghost' : 'primary'}" href="#/admin/demo">${icon('play')}הדגמת קליטה ממייל</a>`, 'הטבות שהתקבלו במייל וממתינות לבדיקה. שום הטבה ממייל לא מתפרסמת בלי אישור, אלא משולח שהוגדר במפורש לפרסום אוטומטי.')}
    <div class="tabs" role="tablist">${[['pending_review', `ממתינות (${counts.pending_review})`], ['approved', 'אושרו'], ['rejected', 'נדחו'], ['irrelevant', 'לא רלוונטיות'], ['', `הכל (${counts.all})`]].map(([v, l]) => `<a role="tab" href="#/admin/inbox?status=${v}" aria-selected="${status === v}" class="${status === v ? 'on' : ''}">${l}</a>`).join('')}</div>
    ${items.length ? `<div class="mail-list">${items.map(m => `<a class="mail-row" href="#/admin/inbox/${m.id}">
      <div class="mail-from"><strong>${esc(m.businessName || m.fromName || m.from)}</strong><small dir="ltr">${esc(m.from)}</small></div>
      <div class="mail-subj">${esc(m.title || m.subject)}<small>${esc(m.subject)}</small></div>
      <div class="mail-meta">${confidenceBadge(m.confidence)}${m.hasDuplicates ? `<span class="pill st-warn">${icon('alert')}כפילות אפשרית</span>` : ''}<small>${timeAgo(m.receivedAt)}</small></div>
    </a>`).join('')}</div>` : emptyState(status === 'pending_review' ? 'אין הטבות שממתינות לאישור' : 'אין מיילים כאן', status === 'pending_review' ? 'מיילים חדשים עם הצעות הטבה יופיעו כאן אוטומטית.' : '', status === 'pending_review' ? '<a class="btn primary" href="#/admin/demo">לנסות עם מייל לדוגמה</a>' : '')}`;
  const c = $('#check', el);
  if (c) c.addEventListener('click', async () => {
    c.disabled = true;
    try { const r = await post('/api/admin/gmail/check'); toast(`נבדקו ${r.checked} מיילים, ${r.relevant} עם הצעת הטבה`); inboxPage(el, query); refreshBadges(); }
    catch (e) { toast(e.message, 'error'); c.disabled = false; }
  });
}

const confidenceBadge = (n) => `<span class="conf ${n >= 75 ? 'hi' : n >= 50 ? 'mid' : 'lo'}" title="ציון ביטחון בזיהוי">${n}%</span>`;

async function reviewPage(el, query, id) {
  const { email: m, sender, fieldLabels, aiAvailable } = await get(`/api/admin/emails/${id}`);
  const x = m.extraction;
  const f = { ...x.fields };
  const strong = m.duplicates.businesses.filter(d => d.strong);
  const done = m.status !== 'pending_review';
  const confOf = (k) => x.confidence[k];
  const fieldCls = (k) => f[k] === undefined || f[k] === '' ? 'missing' : (confOf(k) ?? 1) < 0.7 ? 'unsure' : '';
  const confTag = (k) => f[k] === undefined || f[k] === '' ? '<em class="ft missing">חסר</em>' : (confOf(k) ?? 1) < 0.7 ? `<em class="ft unsure">לא בטוח · ${Math.round(confOf(k) * 100)}%</em>` : `<em class="ft ok">${Math.round((confOf(k) ?? 1) * 100)}%</em>`;
  const input = (k, type = 'text', attrs = '') => `<label class="field ${fieldCls(k)}"><span>${fieldLabels[k] || k} ${confTag(k)}</span><input name="${k}" type="${type}" value="${esc(f[k] ?? '')}" ${attrs} ${done ? 'disabled' : ''}></label>`;
  el.innerHTML = `
    <a href="#/admin/inbox" class="back">${icon('chevR')}לתור האישור</a>
    ${head(f.title || m.subject, done ? `<span class="pill st-${m.status === 'approved' ? 'active' : 'archived'}">${{ approved: 'אושר', rejected: 'נדחה', irrelevant: 'לא רלוונטי' }[m.status]}</span>` : '', `התקבל ${formatDateTime(m.receivedAt)} · ${x.engine === 'ai' ? 'חולץ בעזרת AI' : 'חולץ במנוע המקומי'}${m.handledBy ? ` · טופל ע״י ${esc(m.handledBy)}` : ''}`)}
    <div class="confidence card pad">
      <div><strong>ציון ביטחון בזיהוי: ${x.overall}%</strong><div class="progress ${x.overall >= 75 ? 'hi' : x.overall >= 50 ? 'mid' : 'lo'}"><span style="width:${x.overall}%"></span></div></div>
      <div class="small">${x.missing.length ? `<span class="ft missing">חסרים: ${x.missing.map(k => fieldLabels[k]).join(', ')}</span>` : '<span class="ft ok">כל השדות החשובים זוהו</span>'}
      ${x.uncertain.length ? ` · <span class="ft unsure">לבדיקה: ${x.uncertain.map(k => fieldLabels[k] || k).join(', ')}</span>` : ''}</div>
      ${x.notes ? `<p class="small muted">${esc(x.notes)}</p>` : ''}
    </div>
    ${m.duplicates.businesses.length || m.duplicates.benefits.length ? `<div class="notice warn">${icon('alert')}<div>
      ${m.duplicates.businesses.length ? `<div><strong>העסק אולי כבר במאגר:</strong> ${m.duplicates.businesses.map(d => `<a href="#/admin/businesses/${d.id}">${esc(d.name)}</a> (${esc(d.reasons.join(', '))})`).join(' · ')}</div>` : ''}
      ${m.duplicates.benefits.length ? `<div><strong>הטבה דומה קיימת:</strong> ${m.duplicates.benefits.map(d => `<a href="#/admin/benefits/${d.id}">${esc(d.title)}</a> (${STATUS[d.status]})`).join(' · ')}</div>` : ''}
    </div></div>` : ''}
    <div class="review">
      <section class="card mail-orig" aria-label="המייל המקורי">
        <h2 class="small-h">${icon('mail')}המייל המקורי</h2>
        <dl class="mail-hdr"><div><dt>מאת</dt><dd>${esc(m.fromName)} <span dir="ltr">&lt;${esc(m.from)}&gt;</span></dd></div><div><dt>נושא</dt><dd>${esc(m.subject)}</dd></div>
        ${m.attachments.length ? `<div><dt>קבצים</dt><dd>${m.attachments.map(a => esc(a.name)).join(', ')}</dd></div>` : ''}
        <div><dt>למה זוהה</dt><dd class="small">${esc(m.triage.reasons.join(' · '))}</dd></div></dl>
        <div class="mail-body">${m.body ? esc(m.body) : '<em class="muted">התוכן נמחק לאחר הטיפול.</em>'}</div>
      </section>
      <section class="card pad" aria-label="הנתונים שחולצו">
        <h2 class="small-h">${icon('sparkle')}הנתונים שחולצו</h2>
        <form id="rv" class="stack">
          ${input('businessName')}
          <div class="row2">${input('contactName')}${input('email', 'email', 'dir="ltr"')}</div>
          <div class="row2">${input('phone', 'tel', 'dir="ltr"')}${input('whatsapp', 'tel', 'dir="ltr"')}</div>
          ${input('title')}
          <label class="field ${fieldCls('description')}"><span>${fieldLabels.description} ${confTag('description')}</span><textarea name="description" rows="3" ${done ? 'disabled' : ''}>${esc(f.description || '')}</textarea></label>
          <div class="row2">
            <label class="field ${fieldCls('discountType')}"><span>${fieldLabels.discountType}</span><select name="discountType" ${done ? 'disabled' : ''}>${[['percent', 'אחוז'], ['amount', 'סכום'], ['gift', 'מתנה / אחר']].map(([v, l]) => `<option value="${v}" ${f.discountType === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            ${input('discountValue', 'number')}
          </div>
          ${input('discountLabel')}
          <div class="row2">${input('couponCode', 'text', 'dir="ltr"')}${input('endDate', 'date')}</div>
          <label class="field ${fieldCls('terms')}"><span>${fieldLabels.terms} ${confTag('terms')}</span><textarea name="terms" rows="2" ${done ? 'disabled' : ''}>${esc(f.terms || '')}</textarea></label>
          <div class="row2">${input('address')}${input('city')}</div>
          ${input('website', 'url', 'dir="ltr"')}
          <div class="row2">
            <label class="field ${fieldCls('categoryId')}"><span>${fieldLabels.categoryId} ${confTag('categoryId')}</span><select name="categoryId" ${done ? 'disabled' : ''}><option value="">בחירה…</option>${catsList().map(c => `<option value="${c.id}" ${f.categoryId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
            <label class="field"><span>${fieldLabels.redeemMode}</span><select name="redeemMode" ${done ? 'disabled' : ''}>${[['in_store', 'בבית העסק'], ['online', 'אונליין'], ['both', 'גם וגם']].map(([v, l]) => `<option value="${v}" ${f.redeemMode === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          </div>
          ${f.logoAttachment ? `<p class="small muted">${icon('upload')}לוגו מצורף: ${esc(f.logoAttachment)}</p>` : ''}
          ${done ? '' : `
          <fieldset class="biz-choice"><legend>שיוך לעסק</legend>
            ${m.duplicates.businesses.map((d, i) => `<label class="radio"><input type="radio" name="biz" value="${d.id}" ${i === 0 && d.strong ? 'checked' : ''}><span>לחבר לעסק הקיים: <strong>${esc(d.name)}</strong> <small class="muted">(${esc(d.reasons.join(', '))})</small></span></label>`).join('')}
            <label class="radio"><input type="radio" name="biz" value="__new" ${strong.length ? '' : 'checked'}><span>ליצור עסק חדש במאגר</span></label>
          </fieldset>
          <fieldset class="biz-choice"><legend>כלל לשולח <span dir="ltr" class="muted small">${esc(m.from)}</span></legend>
            <label class="switch"><input type="checkbox" name="trustSender" ${sender && sender.trusted ? 'checked' : ''}><span>שולח קבוע ומאושר</span></label>
            <label class="switch"><input type="checkbox" name="autoPublish" ${sender && sender.autoPublish ? 'checked' : ''}><span>לפרסם אוטומטית הטבות מהשולח הזה בהמשך</span></label>
            <small class="muted">פרסום אוטומטי חל רק על שולח מאושר, וכשהזיהוי מלא וללא כפילויות.</small>
          </fieldset>
          <p class="form-error" role="alert" hidden></p>
          <div class="sticky-actions">
            <button class="btn primary" type="button" data-go="publish">${icon('check')}אישור ופרסום</button>
            <button class="btn ghost" type="button" data-go="draft">${icon('edit')}עריכה לפני פרסום</button>
            <button class="btn ghost" type="button" id="rw">${icon('wand')}ניסוח שיווקי</button>
            <button class="btn ghost" type="button" data-go="reject">דחייה</button>
            <button class="btn ghost" type="button" data-go="irrelevant">לא רלוונטי</button>
          </div>`}
        </form>
      </section>
    </div>`;
  if (done) return;
  const form = $('#rv', el);
  $('#rw', el).addEventListener('click', async () => {
    const v = formData(form);
    const r = await post('/api/admin/rewrite', { title: v.title, shortDescription: v.description, discountType: v.discountType, discountValue: v.discountValue, discountLabel: v.discountLabel, couponCode: v.couponCode, terms: v.terms, businessName: v.businessName });
    form.title.value = r.title;
    form.description.value = r.shortDescription + (v.description ? `\n${v.description}` : '');
    toast(r.engine === 'ai' ? 'נוסח מחדש בעזרת AI' : 'נוסח מחדש (ניסוח בסיסי)');
  });
  $$('[data-go]', el).forEach(btn => btn.addEventListener('click', async () => {
    const act = btn.dataset.go;
    const err = $('.form-error', form);
    err.hidden = true;
    try {
      if (act === 'reject' || act === 'irrelevant') {
        if (!(await confirmDialog(act === 'reject' ? 'דחיית ההצעה' : 'סימון כלא רלוונטי', act === 'reject' ? 'ההטבה לא תפורסם. המייל יישמר ברשימת „נדחו”.' : 'תוכן המייל יימחק מהמערכת והוא לא יעובד שוב.', 'אישור'))) return;
        await post(`/api/admin/emails/${id}/reject`, { reason: act });
        toast(act === 'reject' ? 'ההצעה נדחתה' : 'סומן כלא רלוונטי');
        refreshBadges();
        return go('/admin/inbox');
      }
      const v = formData(form);
      const biz = v.biz;
      const fields = { ...v };
      ['biz', 'trustSender', 'autoPublish'].forEach(k => delete fields[k]);
      const r = await post(`/api/admin/emails/${id}/approve`, { fields, businessId: biz && biz !== '__new' ? biz : null, createBusiness: biz === '__new', publish: act === 'publish', trustSender: v.trustSender, autoPublish: v.autoPublish });
      toast(act === 'publish' ? 'ההטבה אושרה ופורסמה באתר' : 'נשמר כטיוטה, אפשר להמשיך לערוך');
      refreshBadges();
      go(act === 'publish' ? '/admin/inbox' : `/admin/benefits/${r.benefit.id}`);
    } catch (e) { err.hidden = false; err.textContent = e.message; }
  }));
}

// ================= demo mode =================
async function demoPage(el) {
  const { items } = await get('/api/admin/emails-samples');
  el.innerHTML = `
    ${head('הדגמת קליטה ממייל', '', 'כך המערכת תעבוד כשתיבת ה־Gmail תחובר: מייל נכנס, המערכת מזהה שזו הצעת הטבה, מחלצת את הפרטים, בודקת כפילויות ומעבירה לתור האישור.')}
    <ol class="flow" aria-label="שלבי הקליטה">
      ${['מייל נכנס', 'זיהוי הצעת הטבה', 'חילוץ הפרטים', 'בדיקת כפילויות', 'תור האישור'].map((s, i) => `<li style="--i:${i}"><span>${i + 1}</span>${s}</li>`).join('')}
    </ol>
    <h2>מיילים לדוגמה</h2>
    <div class="samples">${items.map(s => `<article class="card sample">
      <div class="sample-from"><strong>${esc(s.fromName)}</strong><small dir="ltr">${esc(s.from)}</small></div>
      <div class="sample-subj">${esc(s.subject)}</div>
      <p class="sample-body">${esc(s.body.slice(0, 150))}…</p>
      ${s.labels.length ? `<span class="pill">${icon('tag')}${esc(s.labels[0])}</span>` : ''}${s.attachments.length ? `<span class="pill">${icon('upload')}${s.attachments.length} קבצים</span>` : ''}
      <button class="btn primary block" data-sample="${s.key}">${icon('play')}שליחה למערכת</button>
    </article>`).join('')}</div>
    <details class="card pad">
      <summary><strong>מייל משלך</strong> – הדביקי טקסט של מייל אמיתי ובדקי מה המערכת מזהה</summary>
      <form id="custom" class="stack">
        <div class="row2"><label class="field"><span>שם השולח</span><input name="fromName"></label><label class="field"><span>מייל השולח *</span><input name="from" type="email" dir="ltr" required></label></div>
        <label class="field"><span>נושא</span><input name="subject"></label>
        <label class="field"><span>תוכן המייל *</span><textarea name="body" rows="8" required></textarea></label>
        <button class="btn primary" type="submit">${icon('play')}שליחה למערכת</button>
      </form>
    </details>
    <div id="run"></div>`;
  const run = async (payload) => {
    const box = $('#run', el);
    box.innerHTML = `<section class="card pad run" aria-live="polite"><h2>${icon('refresh')}מעבד את המייל…</h2><ol class="steps"></ol></section>`;
    box.scrollIntoView({ behavior: document.documentElement.hasAttribute('data-calm') ? 'auto' : 'smooth', block: 'start' });
    let r;
    try { r = await post('/api/admin/emails/simulate', payload); }
    catch (e) { box.innerHTML = `<div class="notice warn">${esc(e.message)}</div>`; return; }
    const ol = $('.steps', box);
    for (const s of r.steps) {
      await new Promise(res => setTimeout(res, document.documentElement.hasAttribute('data-calm') ? 0 : 550));
      ol.insertAdjacentHTML('beforeend', `<li class="${s.warn ? 'warn' : s.ok === false ? 'no' : 'ok'}">${icon(s.warn ? 'alert' : s.ok === false ? 'x' : 'check')}<div><strong>${esc(s.title)}</strong>${s.detail ? `<small>${esc(s.detail)}</small>` : ''}</div></li>`);
    }
    $('h2', box).innerHTML = `${icon('check')}${r.relevant ? 'המייל עובד' : 'המייל סונן'}`;
    box.querySelector('section').insertAdjacentHTML('beforeend', r.relevant
      ? `<div class="row-btns"><a class="btn primary" href="#/admin/inbox/${r.emailId}">${icon('eye')}${r.autoPublished ? 'לצפייה בהטבה שפורסמה' : 'לבדיקה ואישור ההטבה'}</a><a class="btn ghost" href="#/admin/inbox">לתור האישור</a></div>`
      : '<p class="muted">מייל שאינו הצעת הטבה לא נשמר במערכת.</p>');
    refreshBadges();
  };
  $$('[data-sample]', el).forEach(b => b.addEventListener('click', () => run({ sampleKey: b.dataset.sample })));
  $('#custom', el).addEventListener('submit', e => { e.preventDefault(); run(formData(e.target)); });
}

// ================= businesses =================
async function businessesPage(el, query) {
  const [{ items, statuses }, o] = await Promise.all([get('/api/admin/businesses', query), get('/api/admin/overview')]);
  const pct = Math.min(100, Math.round((o.businesses / o.businessGoal) * 100));
  el.innerHTML = `
    ${head('מאגר העסקים', `<a class="btn primary" href="#/admin/businesses/new">${icon('plus')}עסק חדש</a><button class="btn ghost" id="exp">${icon('download')}ייצוא</button>`)}
    <div class="goal card slim"><div class="goal-n"><strong>${o.businesses}</strong> / ${o.businessGoal} עסקים</div><div class="progress" role="progressbar" aria-valuenow="${o.businesses}" aria-valuemax="${o.businessGoal}" aria-label="התקדמות ליעד"><span style="width:${pct}%"></span></div></div>
    <form class="toolbar" id="zf">
      <label class="field compact grow"><span class="sr">חיפוש</span><input name="q" type="search" value="${esc(query.q || '')}" placeholder="שם, איש קשר, טלפון, עיר…"></label>
      <label class="field compact"><span class="sr">סטטוס</span><select name="status"><option value="">כל הסטטוסים</option>${Object.entries(statuses).map(([v, l]) => `<option value="${v}" ${query.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </form>
    ${items.length ? `<div class="blist">${items.map((z, i) => `<a class="brow link" href="#/admin/businesses/${z.id}">
      ${bizAvatar(z.name, z.logo, catTone(z.categoryId), i, 'sm')}
      <div class="brow-main"><span class="brow-title">${esc(z.name)}</span>
        <div class="brow-meta"><span class="pill st-${z.status === 'active' ? 'active' : z.status === 'negotiation' ? 'pending' : 'archived'}">${esc(z.statusLabel)}</span><span>${esc(z.categoryName)}</span>${z.city ? `<span>${esc(z.city)}</span>` : ''}<span>${z.benefitStats.active} הטבות פעילות</span>${z.contactName ? `<span>${esc(z.contactName)}</span>` : ''}</div>
        ${!z.phone && !z.email && !z.website ? `<div class="brow-issues">${icon('alert')}חסרים פרטי קשר</div>` : ''}
      </div>${icon('chevL')}</a>`).join('')}</div>` : emptyState('לא נמצאו עסקים')}`;
  const f = $('#zf', el);
  let t;
  const apply = () => { const p = new URLSearchParams(); for (const [k, v] of new FormData(f)) if (v) p.set(k, v); go('/admin/businesses' + (p.toString() ? '?' + p : '')); };
  f.addEventListener('change', apply);
  f.q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(apply, 500); });
  f.addEventListener('submit', e => { e.preventDefault(); apply(); });
  if (query.q) { f.q.focus(); f.q.setSelectionRange(f.q.value.length, f.q.value.length); }
  $('#exp', el).addEventListener('click', () => exportDialog('businesses'));
}

async function businessEditor(el, id, query) {
  const data = id ? await get(`/api/admin/businesses/${id}`) : null;
  const statuses = data ? data.statuses : { active: 'פעיל', negotiation: 'במשא ומתן', paused: 'מוקפא', ended: 'הסתיים' };
  const z = data ? data.business : { name: '', logo: '', categoryId: '', contactName: '', phone: '', email: '', website: '', facebook: '', instagram: '', address: '', city: '', status: 'active', joinedAt: new Date().toISOString().slice(0, 10), notes: '' };
  let logo = z.logo || '';
  const fld = (n, l, a = '') => `<label class="field"><span>${l}</span><input name="${n}" value="${esc(z[n] || '')}" ${a}></label>`;
  el.innerHTML = `
    <a href="#/admin/businesses" class="back">${icon('chevR')}למאגר העסקים</a>
    ${head(id ? z.name : 'עסק חדש', id ? `<a class="btn primary" href="#/admin/benefits/new?businessId=${id}">${icon('plus')}הטבה חדשה לעסק</a>` : '')}
    <div class="editor">
      <form id="zform" class="editor-form">
        <fieldset class="card pad"><legend>פרטי העסק</legend>
          ${fld('name', 'שם העסק *', 'required')}
          <div class="row2"><label class="field"><span>קטגוריה</span><select name="categoryId"><option value="">בחירה…</option>${catsList().map(c => `<option value="${c.id}" ${z.categoryId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
          <label class="field"><span>סטטוס שיתוף הפעולה</span><select name="status">${Object.entries(statuses).map(([v, l]) => `<option value="${v}" ${z.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
          <div class="img-pick"><div id="lg">${bizAvatar(z.name, logo, catTone(z.categoryId), 0, 'lg')}</div><label class="btn ghost small file">${icon('upload')}העלאת לוגו<input type="file" accept="image/*" id="lgf" hidden></label></div>
        </fieldset>
        <fieldset class="card pad"><legend>יצירת קשר</legend>
          ${fld('contactName', 'איש/אשת קשר')}
          <div class="row2">${fld('phone', 'טלפון', 'type="tel" dir="ltr"')}${fld('email', 'מייל', 'type="email" dir="ltr"')}</div>
          ${fld('website', 'אתר', 'type="url" dir="ltr" placeholder="https://"')}
          <div class="row2">${fld('instagram', 'אינסטגרם', 'dir="ltr"')}${fld('facebook', 'פייסבוק', 'dir="ltr"')}</div>
          <div class="row2">${fld('address', 'כתובת')}${fld('city', 'עיר')}</div>
          ${fld('joinedAt', 'תאריך הצטרפות', 'type="date"')}
        </fieldset>
        <fieldset class="card pad internal"><legend>${icon('lock')}הערות פנימיות (לא מוצגות באתר)</legend>
          <textarea name="notes" rows="4" aria-label="הערות פנימיות">${esc(z.notes || '')}</textarea>
        </fieldset>
        <div id="dups"></div>
        <p class="form-error" role="alert" hidden></p>
        <div class="sticky-actions"><button class="btn primary" type="submit">${icon('check')}שמירה</button>${id && isAdmin() ? `<button class="btn danger-ghost" type="button" id="zdel">${icon('trash')}מחיקה</button>` : ''}</div>
      </form>
      ${data ? `<aside class="editor-side"><div class="sticky">
        <h2 class="small-h">הטבות של העסק</h2>
        ${data.benefits.length ? `<ul class="list">${data.benefits.map(b => `<li><a href="#/admin/benefits/${b.id}">${esc(b.title)}</a>${pill(b.status)}</li>`).join('')}</ul>` : '<p class="muted">אין עדיין הטבות.</p>'}
        ${data.history.length ? `<h2 class="small-h">היסטוריה</h2><ul class="history">${data.history.map(h => `<li><span>${esc(h.summary)}</span><small>${esc(h.userName)} · ${formatDateTime(h.at)}</small></li>`).join('')}</ul>` : ''}
      </div></aside>` : ''}
    </div>`;
  const form = $('#zform', el);
  const checkDups = async () => {
    const v = formData(form);
    if (!v.name && !v.phone && !v.email && !v.website) return;
    const { matches } = await post('/api/admin/businesses/check', { ...v, id });
    $('#dups', el).innerHTML = matches.length ? `<div class="notice warn">${icon('alert')}<div><strong>עסק דומה כבר קיים במאגר:</strong> ${matches.map(m => `<a href="#/admin/businesses/${m.id}">${esc(m.name)}</a> (${esc(m.reasons.join(', '))})`).join(' · ')}</div></div>` : '';
  };
  ['name', 'phone', 'email', 'website'].forEach(n => form[n].addEventListener('change', checkDups));
  $('#lgf', el).addEventListener('change', async e => { try { logo = await readImage(e.target.files[0], 320); $('#lg', el).innerHTML = bizAvatar('', logo, 'teal', 0, 'lg'); } catch (ex) { toast(ex.message, 'error'); } });
  const del = $('#zdel', el);
  if (del) del.addEventListener('click', async () => {
    const v = await dialog({ title: 'מחיקת עסק לצמיתות', body: '<p>אפשר למחוק רק עסק שאין לו הטבות. לעסק שסיים שיתוף פעולה עדיף לשנות סטטוס ל„הסתיים”.</p><label class="field"><span>להקליד „מחיקה” לאישור</span><input id="cf"></label>', actions: [{ label: 'מחיקה', kind: 'danger', value: w => $('#cf', w).value }, { label: 'ביטול', value: null }] });
    if (v === null) return;
    try { await post(`/api/admin/businesses/${id}/delete`, { confirm: v.trim() }); toast('העסק נמחק'); go('/admin/businesses'); } catch (e) { toast(e.message, 'error'); }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('.form-error', form);
    err.hidden = true;
    const v = { ...formData(form), logo };
    try {
      if (id) { await put(`/api/admin/businesses/${id}`, v); toast('נשמר'); return businessEditor(el, id, query); }
      let r = await post('/api/admin/businesses', v);
      if (r.duplicate) {
        const go2 = await dialog({ title: 'נראה שהעסק כבר קיים', body: `<p>מצאנו במאגר:</p><ul>${r.matches.map(m => `<li><a href="#/admin/businesses/${m.id}" data-close>${esc(m.name)}</a> – ${esc(m.reasons.join(', '))}</li>`).join('')}</ul><p>ליצור בכל זאת עסק נפרד?</p>`, actions: [{ label: 'ביטול', value: false }, { label: 'ליצור בכל זאת', value: true, kind: 'ghost' }] });
        if (!go2) return;
        r = await post('/api/admin/businesses', { ...v, force: true });
      }
      toast('העסק נוסף למאגר');
      go(query.return === 'benefit' ? `/admin/benefits/new?businessId=${r.business.id}` : `/admin/businesses/${r.business.id}`);
    } catch (ex) { err.hidden = false; err.textContent = ex.message; }
  });
}

// ================= alerts & reports =================
async function alertsPage(el, query) {
  const tab = query.tab || 'alerts';
  const tabs = `<div class="tabs" role="tablist">${[['alerts', 'התראות'], ['reports', 'דיווחים מהאתר'], ['prefs', 'העדפות התראות']].map(([v, l]) => `<a role="tab" href="#/admin/alerts?tab=${v}" class="${tab === v ? 'on' : ''}" aria-selected="${tab === v}">${l}</a>`).join('')}</div>`;
  if (tab === 'reports') {
    const { items } = await get('/api/admin/reports');
    el.innerHTML = `${head('התראות ודיווחים')}${tabs}
      ${items.length ? `<div class="blist">${items.map(r => `<div class="brow"><div class="brow-main"><strong>${esc(r.reason)}</strong> – <a href="#/admin/benefits/${r.benefitId}">${esc(r.businessName)} · ${esc(r.benefitTitle)}</a>
        ${r.note ? `<div class="muted">„${esc(r.note)}”</div>` : ''}<div class="brow-meta"><span>${formatDateTime(r.at)}</span>${r.status === 'open' ? '<span class="pill st-warn">פתוח</span>' : `<span class="pill st-active">טופל ע״י ${esc(r.resolvedBy)}</span>`}</div></div>
        ${r.status === 'open' ? `<button class="btn small ghost" data-resolve="${r.id}">${icon('check')}טופל</button>` : ''}</div>`).join('')}</div>` : emptyState('אין דיווחים', 'דיווחים של חברות על הטבות שלא עבדו יופיעו כאן.')}`;
    $$('[data-resolve]', el).forEach(b => b.addEventListener('click', async () => { await post(`/api/admin/reports/${b.dataset.resolve}/resolve`); toast('סומן כטופל'); alertsPage(el, query); }));
    return;
  }
  if (tab === 'prefs') {
    const s = isAdmin() ? (await get('/api/admin/settings')).settings : null;
    if (!s) { el.innerHTML = `${head('התראות ודיווחים')}${tabs}<p class="muted">רק מנהלת יכולה לשנות את העדפות ההתראות.</p>`; return; }
    const types = [['newEmailBenefit', 'הטבה חדשה התקבלה במייל'], ['expiry', 'הטבה עומדת לפוג (14, 7 ו־2 ימים לפני)'], ['expired', 'הטבה הסתיימה והועברה ל„הסתיימה”'], ['dataQuality', 'שדות חסרים, קישורים או קופונים לא תקינים'], ['reports', 'דיווח של חברה על הטבה'], ['weeklySummary', 'סיכום שבועי']];
    const ch = [['app', 'בדשבורד'], ['email', 'במייל'], ['whatsapp', 'בוואטסאפ (בקרוב)']];
    el.innerHTML = `${head('התראות ודיווחים')}${tabs}
      <form id="pf" class="card pad stack">
        <div class="table-wrap"><table class="tbl prefs"><thead><tr><th>התראה</th><th>פעילה</th>${ch.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>
        ${types.map(([k, l]) => { const p = s.alertPrefs[k] || { enabled: true, channels: ['app'] }; return `<tr><td>${l}</td><td><input type="checkbox" name="${k}.enabled" ${p.enabled ? 'checked' : ''} aria-label="${l} – פעילה"></td>${ch.map(([c, cl]) => `<td><input type="checkbox" name="${k}.${c}" ${p.channels.includes(c) ? 'checked' : ''} ${c === 'whatsapp' ? 'disabled' : ''} aria-label="${l} – ${cl}"></td>`).join('')}</tr>`; }).join('')}
        </tbody></table></div>
        <p class="muted small">התראות במייל נשלחות לכתובת ${esc(s.contactEmail)} כשמוגדר ספק מייל בשרת. שליחה בוואטסאפ תתאפשר עם WhatsApp Business API.</p>
        <button class="btn primary" type="submit">שמירה</button>
      </form>`;
    $('#pf', el).addEventListener('submit', async e => {
      e.preventDefault();
      const prefs = {};
      for (const [k] of types) prefs[k] = { ...s.alertPrefs[k], enabled: e.target[`${k}.enabled`].checked, channels: ch.map(([c]) => c).filter(c => e.target[`${k}.${c}`].checked) };
      await put('/api/admin/settings', { alertPrefs: prefs });
      toast('ההעדפות נשמרו');
    });
    return;
  }
  const { items } = await get('/api/admin/alerts');
  const lvIcon = { info: 'info', warning: 'alert', critical: 'alert' };
  el.innerHTML = `${head('התראות ודיווחים', `<button class="btn ghost" id="readall">${icon('check')}סימון הכל כנקרא</button><button class="btn ghost" id="runjobs">${icon('refresh')}בדיקה עכשיו</button>`)}${tabs}
    ${items.length ? `<ul class="alerts">${items.map(a => `<li class="alert lv-${a.level} ${a.read ? 'read' : ''}">${icon(lvIcon[a.level])}
      <div><strong>${esc(a.title)}</strong><p>${esc(a.body)}</p><small>${timeAgo(a.at)}${a.channels ? ' · ' + a.channels.map(c => ({ app: 'דשבורד', email: 'מייל', whatsapp: 'וואטסאפ' }[c])).join(', ') : ''}</small></div>
      ${a.benefitId ? `<a class="btn small ghost" href="#/admin/benefits/${a.benefitId}">לטיפול</a>` : a.emailId ? `<a class="btn small ghost" href="#/admin/inbox/${a.emailId}">לבדיקה</a>` : a.filter ? `<a class="btn small ghost" href="#/admin/benefits?status=${a.filter}">לרשימה</a>` : ''}</li>`).join('')}</ul>` : emptyState('אין התראות')}`;
  $('#readall', el).addEventListener('click', async () => { await post('/api/admin/alerts/read', {}); refreshBadges(); alertsPage(el, query); });
  $('#runjobs', el).addEventListener('click', async () => { await post('/api/admin/jobs/run'); toast('הבדיקות האוטומטיות הורצו'); refreshBadges(); alertsPage(el, query); });
}

// ================= stats =================
async function statsPage(el, query) {
  const days = Number(query.days) || 30;
  const s = await get('/api/admin/stats', { days });
  const maxDay = Math.max(1, ...s.daily.map(d => d.views));
  const maxCat = Math.max(1, ...s.categories.map(c => c.views));
  const W = 600, H = 160, bw = W / s.daily.length;
  // Ticks at round numbers within the data range.
  const step = maxDay > 40 ? Math.ceil(maxDay / 4 / 10) * 10 : Math.max(1, Math.ceil(maxDay / 4));
  const ticks = []; for (let v = 0; v <= maxDay; v += step) ticks.push(v);
  const top = Math.max(maxDay, ticks[ticks.length - 1]);
  el.innerHTML = `
    ${head('נתונים וסטטיסטיקות', `<div class="seg small" role="radiogroup" aria-label="תקופה">${[7, 30, 90].map(d => `<label><input type="radio" name="days" value="${d}" ${d === days ? 'checked' : ''}><span>${d} ימים</span></label>`).join('')}</div>`)}
    ${s.hasSampleStats ? `<div class="notice">${icon('info')}<div>כרגע מוצגים נתוני דוגמה כדי להמחיש את המסך. ${isAdmin() ? '<button class="link-btn" id="clear">מחיקת נתוני הדוגמה</button>' : ''}</div></div>` : ''}
    <div class="kpis five">
      ${[['views', 'צפיות'], ['redeems', 'לחיצות למימוש'], ['copies', 'העתקות קופון'], ['shares', 'שיתופים'], ['reports', 'דיווחים']].map(([k, l]) => `<div class="kpi"><span class="kpi-n">${s.totals[k]}</span><span class="kpi-l">${l}</span></div>`).join('')}
    </div>
    <section class="card pad">
      <h2 class="small-h">צפיות בהטבות לפי יום</h2>
      <div class="chart-wrap"><svg viewBox="-34 -8 ${W + 40} ${H + 30}" class="chart" role="img" aria-label="צפיות לפי יום ב־${days} הימים האחרונים">
        ${ticks.map(v => `<g><line x1="0" x2="${W}" y1="${H - (v / top) * H}" y2="${H - (v / top) * H}" class="grid"/><text x="-6" y="${H - (v / top) * H + 4}" class="axis" text-anchor="end">${v}</text></g>`).join('')}
        ${s.daily.map((d, i) => { const h = (d.views / top) * H; return `<rect x="${W - (i + 1) * bw + 1}" y="${H - h}" width="${Math.max(1, bw - 2)}" height="${h}" rx="${Math.min(4, bw / 3)}" class="bar-v"><title>${formatDate(d.date)}: ${d.views} צפיות, ${d.redeems} לחיצות למימוש</title></rect>`; }).join('')}
        <text x="${W}" y="${H + 20}" class="axis" text-anchor="start">${formatDate(s.daily[0].date)}</text><text x="0" y="${H + 20}" class="axis" text-anchor="end">${formatDate(s.daily[s.daily.length - 1].date)}</text>
      </svg></div>
    </section>
    <div class="panels">
      <section class="card panel wide"><h2>ביצועים לפי הטבה</h2>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>הטבה</th><th class="num">צפיות</th><th class="num">מימושים</th><th class="num">העתקות</th><th class="num">שיתופים</th><th class="num">דיווחים</th><th class="num">יחס המרה</th></tr></thead>
        <tbody>${s.perBenefit.filter(p => p.status === 'active' || p.views).map(p => `<tr><td><a href="#/admin/benefits/${p.id}">${esc(p.businessName)}</a><div class="muted small">${esc(p.title)}</div></td><td class="num">${p.views}</td><td class="num">${p.redeems}</td><td class="num">${p.copies}</td><td class="num">${p.shares}</td><td class="num">${p.reports}</td><td class="num">${p.views ? Math.round(((p.redeems + p.copies) / p.views) * 100) + '%' : '–'}</td></tr>`).join('')}</tbody></table></div>
      </section>
      <section class="card panel"><h2>קטגוריות</h2><div class="bars">${s.categories.map(c => `<div class="bar-row" title="${esc(c.name)}: ${c.views} צפיות, ${c.redeems} מימושים"><span class="bar-label">${esc(c.name)}</span><span class="bar-track"><span class="bar" style="width:${(c.views / maxCat) * 100}%"></span></span><span class="bar-val">${c.views}</span></div>`).join('')}</div></section>
      <section class="card panel"><h2>עסקים מובילים</h2><ol class="list">${s.topBusinesses.filter(b => b.views).map(b => `<li><a href="#/admin/businesses/${b.id}">${esc(b.name)}</a><span class="muted">${b.redeems} מימושים · ${b.views} צפיות</span></li>`).join('') || '<li class="muted">אין עדיין נתונים</li>'}</ol></section>
      <section class="card panel"><h2>מילות חיפוש נפוצות</h2><ul class="list">${s.topSearches.map(x => `<li><span>„${esc(x.q)}”</span><span class="muted">${x.n}</span></li>`).join('') || '<li class="muted">אין עדיין חיפושים</li>'}</ul></section>
      <section class="card panel"><h2>חיפושים בלי תוצאות</h2><ul class="list">${s.zeroSearches.map(x => `<li><span>„${esc(x.q)}”</span><span class="muted">${x.n}</span></li>`).join('') || '<li class="muted">אין</li>'}</ul></section>
      <section class="card panel"><h2>הטבות שלא קיבלו חשיפה</h2>${s.noExposure.length ? `<ul class="list">${s.noExposure.map(p => `<li><a href="#/admin/benefits/${p.id}">${esc(p.businessName)} – ${esc(p.title)}</a></li>`).join('')}</ul><p class="muted small">אפשר לסמן אותן כמומלצות או להקדים אותן בסדר ההצגה.</p>` : '<p class="muted">כל ההטבות הפעילות נצפו לפחות פעם אחת.</p>'}</section>
      <section class="card panel"><h2>מקור ההטבות</h2><dl class="summary">${[['manual', 'נוספו ידנית'], ['email', 'התקבלו מהמייל'], ['import', 'ייבוא מקובץ']].map(([k, l]) => `<div><dt>${l}</dt><dd>${s.sources[k] || 0}</dd></div>`).join('')}</dl></section>
    </div>`;
  $$('input[name=days]', el).forEach(r => r.addEventListener('change', () => go(`/admin/stats?days=${r.value}`)));
  const clear = $('#clear', el);
  if (clear) clear.addEventListener('click', async () => {
    if (!(await confirmDialog('מחיקת נתוני הדוגמה', 'כל הצפיות והחיפושים לדוגמה יימחקו. נתונים אמיתיים יישארו.', 'מחיקה', 'danger'))) return;
    await post('/api/admin/stats/clear-sample'); toast('נתוני הדוגמה נמחקו'); statsPage(el, query);
  });
}

// ================= export / import =================
async function loadXlsx() {
  if (window.XLSX) return window.XLSX;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = res; s.onerror = () => rej(new Error('לא הצלחנו לטעון את רכיב ה־Excel. בדקו את החיבור לאינטרנט.'));
    document.head.appendChild(s);
  });
  return window.XLSX;
}

async function exportDialog(kind) {
  const fmt = await dialog({ title: kind === 'benefits' ? 'ייצוא רשימת ההטבות' : 'ייצוא מאגר העסקים', body: '<p>באיזה פורמט?</p>', actions: [{ label: 'Excel', value: 'xlsx' }, { label: 'CSV', value: 'csv', kind: 'ghost' }, { label: 'ביטול', value: null }] });
  if (!fmt) return;
  try {
    const { columns, rows } = await get(`/api/admin/export/${kind}`);
    const name = `${kind === 'benefits' ? 'הטבות' : 'עסקים'}-יותר-רעות-${new Date().toISOString().slice(0, 10)}`;
    if (fmt === 'csv') {
      const e = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      downloadFile(name + '.csv', '﻿' + [columns, ...rows].map(r => r.map(e).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
    } else {
      const X = await loadXlsx();
      const ws = X.utils.aoa_to_sheet([columns, ...rows]);
      ws['!cols'] = columns.map(() => ({ wch: 22 }));
      const wb = X.utils.book_new();
      wb.Workbook = { Views: [{ RTL: true }] };
      X.utils.book_append_sheet(wb, ws, kind === 'benefits' ? 'הטבות' : 'עסקים');
      X.writeFile(wb, name + '.xlsx');
    }
    toast('הקובץ ירד למכשיר');
  } catch (e) { toast(e.message, 'error'); }
}

async function importDialog(done) {
  const cols = ['שם העסק', 'כותרת', 'תיאור קצר', 'קטגוריה', 'הנחה', 'קוד קופון', 'קישור למימוש', 'טלפון', 'עיר', 'תנאי מימוש', 'תאריך סיום'];
  await dialog({
    title: 'ייבוא הטבות מ־Excel',
    body: `<p>הקובץ צריך לכלול שורת כותרות. עמודות מוכרות: ${cols.map(c => `<code>${c}</code>`).join(', ')}.</p>
      <p class="muted small">ההטבות ייכנסו כטיוטות, ועסקים קיימים יזוהו לפי השם. אפשר לבדוק ולפרסם אחר כך.</p>
      <div class="row-btns"><button class="btn ghost small" id="tpl">${icon('download')}הורדת קובץ לדוגמה</button>
      <label class="btn primary file">${icon('upload')}בחירת קובץ<input type="file" id="xf" accept=".xlsx,.xls,.csv" hidden></label></div>
      <div id="imp-res"></div>`,
    onMount: (w) => {
      $('#tpl', w).addEventListener('click', async () => {
        try {
          const X = await loadXlsx();
          const ws = X.utils.aoa_to_sheet([cols, ['בית הקפה של דנה', '15% הנחה על כל התפריט', 'הנחה לחברות המועדון', 'אוכל ובתי קפה', '15%', 'REUT15', 'https://example.co.il', '03-1234567', 'חיפה', 'לא כפל מבצעים', '31/12/2026']]);
          const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'הטבות'); X.writeFile(wb, 'תבנית-ייבוא-הטבות.xlsx');
        } catch (e) { toast(e.message, 'error'); }
      });
      $('#xf', w).addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const box = $('#imp-res', w);
        box.innerHTML = '<p class="muted">קורא את הקובץ…</p>';
        try {
          const X = await loadXlsx();
          const wb = X.read(await file.arrayBuffer(), { type: 'array', cellDates: false, raw: false });
          const rows = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
          if (!rows.length) throw new Error('הקובץ ריק');
          const r = await post('/api/admin/import/benefits', { rows });
          box.innerHTML = `<div class="notice">${icon('check')}<div>נוספו ${r.created} הטבות כטיוטה (${r.linked} חוברו לעסקים קיימים, ${r.newBusinesses} עסקים חדשים).${r.skipped.length ? `<br>דולגו: ${esc(r.skipped.slice(0, 5).join(' · '))}` : ''}</div></div>`;
          done && done();
        } catch (ex) { box.innerHTML = `<div class="notice warn">${esc(ex.message)}</div>`; }
      });
    },
  });
}

// ================= settings =================
async function settingsPage(el, query) {
  if (!isAdmin()) { el.innerHTML = emptyState('אין הרשאה', 'ההגדרות זמינות למנהלת בלבד.'); return; }
  const tab = query.tab || 'general';
  const { settings: s, gmail } = await get('/api/admin/settings');
  const tabs = `<div class="tabs" role="tablist">${[['general', 'כללי ומיתוג'], ['gmail', 'Gmail ושולחים'], ['users', 'משתמשים והרשאות'], ['audit', 'יומן פעילות'], ['data', 'גיבוי ונתונים']].map(([v, l]) => `<a role="tab" href="#/admin/settings?tab=${v}" class="${tab === v ? 'on' : ''}" aria-selected="${tab === v}">${l}</a>`).join('')}</div>`;
  const msg = { connected: ['ok', 'תיבת ה־Gmail חוברה בהצלחה'], denied: ['warn', 'החיבור בוטל ב־Google'], error: ['warn', 'החיבור נכשל. נסי שוב.'], 'not-configured': ['warn', 'צריך להגדיר בשרת את פרטי ה־OAuth של Google לפני החיבור (ראו README).'] }[query.gmail];

  if (tab === 'general') {
    let logo = s.logo || '';
    el.innerHTML = `${head('הגדרות')}${tabs}
      <form id="gf" class="card pad stack narrow-form">
        <label class="field"><span>שם המועדון</span><input name="siteName" value="${esc(s.siteName)}" required></label>
        <label class="field"><span>סלוגן</span><input name="tagline" value="${esc(s.tagline)}"></label>
        <div class="field"><span>לוגו</span><div class="img-pick"><img id="lg" class="logo-prev" src="${esc(logo || window.__YR_LOGO__ || 'img/logo.jpg')}" alt="הלוגו הנוכחי"><div class="stack"><label class="btn ghost small file">${icon('upload')}העלאת לוגו חדש<input type="file" accept="image/*" id="lgf" hidden></label>${logo ? '<button type="button" class="link-btn" id="lgr">חזרה ללוגו המקורי</button>' : ''}</div></div></div>
        <label class="field"><span>מייל ליצירת קשר והתראות</span><input name="contactEmail" type="email" dir="ltr" value="${esc(s.contactEmail)}"></label>
        <label class="field"><span>יעד מספר עסקים במאגר</span><input name="businessGoal" type="number" min="1" value="${esc(s.businessGoal)}"></label>
        <p class="muted small">צבעי המותג: טורקיז, כתום, ורוד וענבר, לפי הלוגו של רעות.</p>
        <button class="btn primary" type="submit">שמירה</button>
      </form>`;
    $('#lgf', el).addEventListener('change', async e => { try { logo = await readImage(e.target.files[0], 640); $('#lg', el).src = logo; } catch (ex) { toast(ex.message, 'error'); } });
    const lgr = $('#lgr', el); if (lgr) lgr.addEventListener('click', () => { logo = ''; $('#lg', el).src = window.__YR_LOGO__ || 'img/logo.jpg'; });
    $('#gf', el).addEventListener('submit', async e => {
      e.preventDefault();
      await put('/api/admin/settings', { ...formData(e.target), logo });
      await refreshBoot();
      $('.brand-logo').src = state.boot.logo || window.__YR_LOGO__ || 'img/logo.jpg';
      $('.brand-text strong').textContent = state.boot.siteName;
      $('.brand-text small').textContent = state.boot.tagline;
      toast('ההגדרות נשמרו');
    });
    return;
  }

  if (tab === 'gmail') {
    const { items: senders } = await get('/api/admin/senders');
    const demo = state.boot.demo;
    el.innerHTML = `${head('הגדרות')}${tabs}
      ${msg ? `<div class="notice ${msg[0] === 'warn' ? 'warn' : ''}">${esc(msg[1])}</div>` : ''}
      <section class="card pad stack">
        <h2 class="small-h">${icon('mail')}חיבור לתיבת Gmail</h2>
        ${gmail.connected ? `<p>${icon('check')}מחובר לתיבה <strong dir="ltr">${esc(gmail.email)}</strong>. המערכת בודקת מיילים חדשים כל ${s.gmail.pollMinutes} דקות${s.gmail.lastCheckedAt ? ` (בדיקה אחרונה ${timeAgo(s.gmail.lastCheckedAt)})` : ''}.</p>
          <div class="row-btns"><button class="btn ghost" id="gdis">ניתוק</button></div>`
          : demo ? `<p>בגרסת ההדגמה אין חיבור אמיתי ל־Gmail. אפשר לנסות את כל זרימת הקליטה ב<a href="#/admin/demo">הדגמת קליטה ממייל</a>.</p>`
          : `<p>החיבור נעשה דרך Google בהרשאת OAuth, בלי לשמור סיסמה. ${gmail.configured ? '' : '<strong>לפני החיבור צריך להגדיר בשרת את GOOGLE_CLIENT_ID ו־GOOGLE_CLIENT_SECRET (ההוראות ב־README).</strong>'}</p>
          <a class="btn primary" href="/auth/google/start" ${gmail.configured ? '' : 'aria-disabled="true"'}>${icon('lock')}חיבור עם Google</a>`}
        <p class="muted small">הרשאה מבוקשת: קריאת הודעות והוספת תווית (gmail.modify). המערכת קוראת רק הודעות עם התווית, משולחים מאושרים, שהועברו לכתובת ההטבות או עם מילות המפתח, ומסמנת כל הודעה שטופלה בתווית „${esc(s.gmail.processedLabel)}” כדי שלא תעובד שוב.</p>
        <p class="muted small">חילוץ בעזרת AI: ${gmail.aiAvailable ? '<strong>פעיל</strong>' : 'לא מוגדר (נעשה שימוש במנוע החילוץ המקומי). להפעלה: ANTHROPIC_API_KEY בשרת.'}</p>
      </section>
      <form id="gmf" class="card pad stack">
        <h2 class="small-h">איך מזהים מייל של הצעת הטבה</h2>
        <label class="field"><span>תווית ייעודית ב־Gmail</span><input name="label" value="${esc(s.gmail.label)}"></label>
        <label class="field"><span>כתובת להעברת מיילים</span><input name="forwardAddress" type="email" dir="ltr" value="${esc(s.gmail.forwardAddress)}"><small>מייל שמועבר לכתובת הזו ייחשב כהצעת הטבה.</small></label>
        <label class="field"><span>מילות מפתח (מופרדות בפסיק)</span><input name="keywords" value="${esc(s.gmail.keywords.join(', '))}"></label>
        <label class="field"><span>תדירות בדיקה (דקות)</span><input name="pollMinutes" type="number" min="5" value="${esc(s.gmail.pollMinutes)}"></label>
        <button class="btn primary" type="submit">שמירה</button>
      </form>
      <section class="card pad stack">
        <h2 class="small-h">שולחים מאושרים</h2>
        <p class="muted small">מייל משולח מאושר מזוהה תמיד כהצעת הטבה. פרסום אוטומטי חל רק על שולחים שסומנו במפורש.</p>
        ${senders.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>שולח</th><th>מאושר</th><th>פרסום אוטומטי</th><th></th></tr></thead><tbody>
          ${senders.map(x => `<tr data-s="${x.id}"><td><strong>${esc(x.name)}</strong><div class="small" dir="ltr">${esc(x.email)}</div></td><td><input type="checkbox" data-sk="trusted" ${x.trusted ? 'checked' : ''} aria-label="מאושר"></td><td><input type="checkbox" data-sk="autoPublish" ${x.autoPublish ? 'checked' : ''} ${x.trusted ? '' : 'disabled'} aria-label="פרסום אוטומטי"></td><td><button class="icon-btn" data-sdel aria-label="הסרה">${icon('trash')}</button></td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">אין עדיין שולחים מאושרים. אפשר להוסיף כאן או ישירות ממסך האישור.</p>'}
        <form id="sf" class="row2 align-end"><label class="field"><span>מייל השולח</span><input name="email" type="email" dir="ltr" required></label><label class="field"><span>שם</span><input name="name"></label><button class="btn ghost" type="submit">${icon('plus')}הוספה</button></form>
      </section>`;
    $('#gmf', el).addEventListener('submit', async e => { e.preventDefault(); const v = formData(e.target); await put('/api/admin/settings', { gmail: { ...v, keywords: v.keywords.split(/[,،]/) } }); toast('נשמר'); });
    $('#sf', el).addEventListener('submit', async e => { e.preventDefault(); try { await post('/api/admin/senders', { ...formData(e.target), trusted: true }); settingsPage(el, query); } catch (ex) { toast(ex.message, 'error'); } });
    $$('[data-s]', el).forEach(tr => {
      const sd = senders.find(x => x.id === tr.dataset.s);
      tr.addEventListener('change', async () => { await post('/api/admin/senders', { email: sd.email, name: sd.name, trusted: $('[data-sk=trusted]', tr).checked, autoPublish: $('[data-sk=autoPublish]', tr).checked }); settingsPage(el, query); });
      $('[data-sdel]', tr).addEventListener('click', async () => { await post(`/api/admin/senders/${sd.id}/delete`); settingsPage(el, query); });
    });
    const dis = $('#gdis', el);
    if (dis) dis.addEventListener('click', async () => { if (await confirmDialog('ניתוק Gmail', 'המערכת תפסיק לבדוק מיילים חדשים ותבטל את ההרשאה ב־Google.', 'ניתוק', 'danger')) { await post('/api/admin/gmail/disconnect'); settingsPage(el, query); } });
    return;
  }

  if (tab === 'users') {
    const { items } = await get('/api/admin/users');
    const roles = { member: 'משתמשת רגילה', editor: 'עורכת תוכן', admin: 'מנהלת' };
    el.innerHTML = `${head('הגדרות', `<button class="btn primary" id="addu">${icon('plus')}משתמשת חדשה</button>`)}${tabs}
      <div class="roles card pad"><dl>
        <div><dt>משתמשת רגילה</dt><dd>צפייה, חיפוש, שמירת מועדפים ומימוש הטבות.</dd></div>
        <div><dt>עורכת תוכן</dt><dd>הוספה ועריכה של הטבות ועסקים ואישור הטבות מהמייל, בלי ניהול משתמשים והגדרות.</dd></div>
        <div><dt>מנהלת</dt><dd>שליטה מלאה, כולל משתמשים, הרשאות, Gmail, נתונים, גיבויים ומחיקה סופית.</dd></div>
      </dl></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>שם</th><th>מייל</th><th>תפקיד</th><th>כניסה אחרונה</th><th></th></tr></thead><tbody>
      ${items.map(u => `<tr data-u="${u.id}" class="${u.disabled ? 'dim' : ''}"><td>${esc(u.name)}${u.disabled ? ' <span class="pill st-archived">מושבת</span>' : ''}</td><td dir="ltr">${esc(u.email)}</td>
        <td><select data-role aria-label="תפקיד" ${u.id === state.user.id ? 'disabled' : ''}>${Object.entries(roles).map(([v, l]) => `<option value="${v}" ${u.role === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
        <td>${u.lastLoginAt ? timeAgo(u.lastLoginAt) : '–'}</td>
        <td class="nowrap"><button class="btn small ghost" data-pw>סיסמה חדשה</button>${u.id !== state.user.id ? `<button class="btn small ghost" data-dis>${u.disabled ? 'הפעלה' : 'השבתה'}</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>`;
    $$('[data-u]', el).forEach(tr => {
      const id = tr.dataset.u, u = items.find(x => x.id === id);
      const role = $('[data-role]', tr);
      role.addEventListener('change', async () => { try { await put(`/api/admin/users/${id}`, { role: role.value }); toast('התפקיד עודכן'); } catch (e) { toast(e.message, 'error'); } });
      $('[data-pw]', tr).addEventListener('click', async () => {
        const pw = await dialog({ title: `סיסמה חדשה ל${u.name}`, body: '<label class="field"><span>סיסמה (8 תווים לפחות)</span><input type="password" id="np" autocomplete="new-password" dir="ltr"></label>', actions: [{ label: 'עדכון', value: w => $('#np', w).value }, { label: 'ביטול', value: null }] });
        if (pw) try { await put(`/api/admin/users/${id}`, { password: pw }); toast('הסיסמה עודכנה'); } catch (e) { toast(e.message, 'error'); }
      });
      const dis = $('[data-dis]', tr);
      if (dis) dis.addEventListener('click', async () => { await put(`/api/admin/users/${id}`, { disabled: !u.disabled }); settingsPage(el, query); });
    });
    $('#addu', el).addEventListener('click', async () => {
      const v = await dialog({
        title: 'משתמשת חדשה',
        body: `<div class="stack"><label class="field"><span>שם</span><input id="un"></label><label class="field"><span>מייל</span><input id="ue" type="email" dir="ltr"></label>
          <label class="field"><span>תפקיד</span><select id="ur">${Object.entries(roles).map(([k, l]) => `<option value="${k}" ${k === 'editor' ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field"><span>סיסמה ראשונית</span><input id="up" type="password" autocomplete="new-password" dir="ltr"><small>8 תווים לפחות. כדאי לבקש להחליף בכניסה הראשונה.</small></label></div>`,
        actions: [{ label: 'הוספה', value: w => ({ name: $('#un', w).value, email: $('#ue', w).value, role: $('#ur', w).value, password: $('#up', w).value }) }, { label: 'ביטול', value: null }],
      });
      if (!v) return;
      try { await post('/api/admin/users', v); toast('המשתמשת נוספה'); settingsPage(el, query); } catch (e) { toast(e.message, 'error'); }
    });
    return;
  }

  if (tab === 'audit') {
    const { items } = await get('/api/admin/audit', { entity: query.entity || '', limit: 300 });
    el.innerHTML = `${head('הגדרות')}${tabs}
      <form class="toolbar"><label class="field compact"><span class="sr">סוג</span><select id="ae"><option value="">כל הפעולות</option>${[['benefit', 'הטבות'], ['business', 'עסקים'], ['email', 'מיילים'], ['user', 'משתמשים'], ['settings', 'הגדרות'], ['system', 'מערכת']].map(([v, l]) => `<option value="${v}" ${query.entity === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></form>
      <ul class="history big">${items.map(h => `<li><span>${esc(h.summary)}</span><small>${esc(h.userName)} · ${formatDateTime(h.at)}</small></li>`).join('')}</ul>`;
    $('#ae', el).addEventListener('change', e => go(`/admin/settings?tab=audit${e.target.value ? '&entity=' + e.target.value : ''}`));
    return;
  }

  if (tab === 'data') {
    el.innerHTML = `${head('הגדרות')}${tabs}
      <div class="panels">
        <section class="card panel"><h2>${icon('download')}גיבוי</h2><p>${state.boot.demo ? 'בגרסת ההדגמה הנתונים נשמרים רק בדפדפן.' : 'השרת שומר גיבוי אוטומטי כל יום ל־30 יום אחורה.'} אפשר גם להוריד עותק מלא עכשיו (ללא סיסמאות).</p><button class="btn ghost" id="bk">${icon('download')}הורדת גיבוי מלא</button></section>
        <section class="card panel"><h2>${icon('upload')}ייבוא וייצוא</h2><div class="stack">
          <button class="btn ghost" id="eb">${icon('download')}ייצוא הטבות</button>
          <button class="btn ghost" id="ez">${icon('download')}ייצוא עסקים</button>
          <button class="btn ghost" id="ib">${icon('upload')}ייבוא הטבות מ־Excel</button></div></section>
        <section class="card panel"><h2>${icon('refresh')}אוטומציות</h2><p>פעם בכמה דקות המערכת מעבירה הטבות שפג תוקפן ל„הסתיימה”, שולחת התראות לפני סיום תוקף ובודקת שדות חסרים. פעם ביום היא בודקת שהקישורים עובדים.</p><button class="btn ghost" id="rj">הרצה עכשיו</button></section>
        ${state.boot.demo ? `<section class="card panel"><h2>${icon('trash')}איפוס ההדגמה</h2><p>מחזיר את כל הנתונים למצב ההתחלתי.</p><button class="btn danger-ghost" id="reset">איפוס</button></section>` : ''}
      </div>`;
    $('#bk', el).addEventListener('click', async () => { const r = await get('/api/admin/backup'); downloadFile(`גיבוי-יותר-רעות-${r.at.slice(0, 10)}.json`, JSON.stringify(r.backup, null, 1), 'application/json'); toast('הגיבוי ירד למכשיר'); });
    $('#eb', el).addEventListener('click', () => exportDialog('benefits'));
    $('#ez', el).addEventListener('click', () => exportDialog('businesses'));
    $('#ib', el).addEventListener('click', () => importDialog());
    $('#rj', el).addEventListener('click', async () => { await post('/api/admin/jobs/run'); toast('האוטומציות הורצו'); refreshBadges(); });
    const reset = $('#reset', el);
    if (reset) reset.addEventListener('click', async () => { if (await confirmDialog('איפוס ההדגמה', 'כל השינויים שעשית בהדגמה יימחקו.', 'איפוס', 'danger')) { window.__YR_RESET__(); } });
  }
}
