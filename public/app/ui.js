// UI helpers: escaping, icons, toasts, dialogs, formatting and the benefit card.

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const P = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  filter: '<path d="M3 5h18M6 12h12M10 19h4"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  whatsapp: '<path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.4z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1.2-1.2-1.8-1-1 .8a4 4 0 0 1-2.3-2.3l.8-1-1-1.8z"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  pin: '<path d="M12 22s7-6.3 7-12a7 7 0 0 0-14 0c0 5.7 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  store: '<path d="M4 9h16l-1.5-5h-13zM5 9v11h14V9M9 20v-6h6v6"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  flag: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v11h14V9M10 13h4"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  coffee: '<path d="M17 8h1a4 4 0 0 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4zM6 2v3M10 2v3M14 2v3"/>',
  shirt: '<path d="M20.4 6.6 16 4l-1.5 1.5a3.5 3.5 0 0 1-5 0L8 4 3.6 6.6l1.6 4.2L7 10v10h10V10l1.8.8z"/>',
  family: '<circle cx="8" cy="6" r="3"/><circle cx="17" cy="9" r="2.2"/><path d="M3 21v-3a5 5 0 0 1 10 0v3M13.5 21v-2.5a3.5 3.5 0 0 1 7 0V21"/>',
  ticket: '<path d="M3 8a2 2 0 0 0 0 4v0a2 2 0 0 1 0 4v2a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-2a2 2 0 0 1 0-4 2 2 0 0 1 0-4V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1zM14 5v14" stroke-dasharray="2 2.5"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M2 13h20"/>',
  textSize: '<path d="M4 7V5h10v2M9 5v14M7 19h4M14 12v-1h7v1M17.5 11v8M16 19h3"/>',
  contrast: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor"/>',
  star: '<path d="m12 2 3 6.3 7 1-5 4.8 1.2 6.9L12 17.8 5.8 21l1.2-6.9-5-4.8 7-1z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8M21 3v5h-5"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
  wand: '<path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  play: '<path d="m6 4 14 8-14 8z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
};

export function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;
}

// Organic "stone" shapes echo the four blobs in the logo.
const STONES = ['48% 52% 44% 56% / 55% 46% 54% 45%', '56% 44% 52% 48% / 46% 55% 45% 54%', '44% 56% 50% 50% / 52% 48% 52% 48%', '52% 48% 58% 42% / 48% 54% 46% 52%'];
export const stone = (i) => STONES[i % STONES.length];
const CAT_TONES = { food: 'orange', health: 'teal', fashion: 'pink', kids: 'amber', beauty: 'pink', leisure: 'orange', services: 'teal', online: 'amber', local: 'teal' };
export const catTone = (id) => CAT_TONES[id] || 'teal';

export function formatDate(s) {
  if (!s) return '';
  const [y, m, d] = s.slice(0, 10).split('-');
  return `${Number(d)}.${Number(m)}.${y}`;
}
export function formatDateTime(s) {
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}
export function timeAgo(s) {
  const diff = (Date.now() - new Date(s).getTime()) / 1000;
  if (diff < 60) return 'עכשיו';
  if (diff < 3600) return `לפני ${Math.round(diff / 60)} דק׳`;
  if (diff < 86400) return `לפני ${Math.round(diff / 3600)} שע׳`;
  const days = Math.round(diff / 86400);
  return days === 1 ? 'אתמול' : `לפני ${days} ימים`;
}

let toastTimer;
export function toast(msg, kind = 'ok') {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
  el.className = `toast show ${kind}`;
  el.innerHTML = `${icon(kind === 'error' ? 'alert' : 'check')}<span>${esc(msg)}</span>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3800);
}

// Accessible modal dialog. Returns a promise resolved with the clicked button's value.
export function dialog({ title, body = '', actions = [{ label: 'סגירה', value: null }], wide = false, onMount }) {
  return new Promise(resolve => {
    const prev = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
      <div class="modal-head"><h2 id="dlg-title">${esc(title)}</h2><button class="icon-btn" data-close aria-label="סגירה">${icon('x')}</button></div>
      <div class="modal-body">${body}</div>
      <div class="modal-actions">${actions.map((a, i) => `<button class="btn ${a.kind || (i === 0 ? 'primary' : 'ghost')}" data-i="${i}">${esc(a.label)}</button>`).join('')}</div>
    </div>`;
    const close = (v) => { wrap.remove(); document.removeEventListener('keydown', onKey); prev && prev.focus && prev.focus(); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    wrap.addEventListener('click', e => {
      if (e.target === wrap || e.target.closest('[data-close]')) return close(null);
      const b = e.target.closest('[data-i]');
      if (b) {
        const a = actions[Number(b.dataset.i)];
        if (a.validate && !a.validate(wrap)) return;
        close(typeof a.value === 'function' ? a.value(wrap) : a.value);
      }
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    if (onMount) onMount(wrap);
    const first = wrap.querySelector('input, select, textarea') || wrap.querySelector('[data-i]');
    first && first.focus();
  });
}

export async function confirmDialog(title, text, okLabel = 'אישור', kind = 'primary') {
  const v = await dialog({ title, body: `<p>${esc(text)}</p>`, actions: [{ label: okLabel, value: true, kind }, { label: 'ביטול', value: false }] });
  return !!v;
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

export function bizAvatar(name = '', image = '', tone = 'teal', i = 0, size = '') {
  if (image) return `<span class="avatar ${size}" style="border-radius:${stone(i)}"><img src="${esc(image)}" alt="" loading="lazy"></span>`;
  const letter = (name.trim().match(/[\p{L}\p{N}]/u) || ['•'])[0];
  return `<span class="avatar ${size} tone-${tone}" style="border-radius:${stone(i)}" aria-hidden="true">${esc(letter)}</span>`;
}

const TAG_LABELS = { new: 'חדש', exclusive: 'בלעדי', featured: 'מומלץ', ending: 'מסתיים בקרוב' };

export function discountBig(b) {
  if (b.discountType === 'percent' && b.discountValue && !b.discountText.startsWith('עד')) return `<span class="num">${b.discountValue}%</span><span class="unit">הנחה</span>`;
  return `<span class="txt">${esc(b.discountText)}</span>`;
}

export function benefitCard(b, { fav = false, idx = 0 } = {}) {
  const where = b.redeemMode === 'online' ? `${icon('globe')}אונליין` : b.city ? `${icon('pin')}${esc(b.city)}${b.redeemMode === 'both' ? ' · גם אונליין' : ''}` : b.redeemMode === 'both' ? `${icon('store')}בעסק ואונליין` : `${icon('store')}בבית העסק`;
  const end = b.isPermanent ? 'הטבה קבועה' : b.endDate ? `עד ${formatDate(b.endDate)}` : '';
  return `<article class="bcard" data-id="${esc(b.id)}">
    <div class="bcard-top">
      ${bizAvatar(b.business.name, b.image, catTone(b.categoryId), idx)}
      <div class="bcard-biz">
        <div class="bcard-bizname">${esc(b.business.name)}</div>
        <div class="bcard-cat">${esc(b.categoryName)}</div>
      </div>
      <button class="fav ${fav ? 'on' : ''}" data-fav="${esc(b.id)}" aria-pressed="${fav}" aria-label="${fav ? 'הסרה מהמועדפים' : 'שמירה במועדפים'}">${icon('heart')}</button>
    </div>
    ${b.tags.length ? `<div class="tags">${b.tags.map(t => `<span class="tag tag-${t}">${TAG_LABELS[t]}</span>`).join('')}</div>` : ''}
    <div class="bcard-discount tone-${catTone(b.categoryId)}">${discountBig(b)}</div>
    <h3 class="bcard-title">${esc(b.title)}</h3>
    <div class="bcard-meta"><span>${where}</span>${end ? `<span>${icon('calendar')}${esc(end)}</span>` : ''}</div>
    <a class="btn primary block" href="#/benefit/${esc(b.id)}">לפרטי ההטבה</a>
  </article>`;
}

export function emptyState(title, text = '', action = '') {
  return `<div class="empty"><div class="empty-stones" aria-hidden="true"><i></i><i></i><i></i></div><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${action}</div>`;
}

// Read a picked image and shrink it to keep the database small.
export function readImage(file, max = 480) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('יש לבחור קובץ תמונה'));
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('לא הצלחנו לקרוא את התמונה'));
      img.src = fr.result;
    };
    fr.onerror = () => reject(new Error('לא הצלחנו לקרוא את הקובץ'));
    fr.readAsDataURL(file);
  });
}

export function downloadFile(name, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
    else out[el.name] = el.value;
  }
  return out;
}
