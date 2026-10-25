// The application core: every API route, permission check, workflow and automation.
// It runs unchanged on the Node server (persisting to disk) and inside the browser
// for the demo (persisting to localStorage). Hosts supply storage, passwords, AI and Gmail.
import { uid, nowIso, todayStr, addDays, daysUntil, formatDateHe, normalizeName, randomCoupon } from './util.js';
import { triageEmail, extractBenefitRuleBased, finalizeExtraction, findDuplicateBusinesses, findSimilarBenefits, rewriteMarketingRuleBased, REQUIRED_FIELDS, FIELD_LABELS } from './extract.js';
import { SAMPLE_EMAILS } from './seed.js';

export const ROLES = { member: 1, editor: 2, admin: 3 };
export const ROLE_LABELS = { member: 'משתמשת רגילה', editor: 'עורכת תוכן', admin: 'מנהלת' };
export const STATUS_LABELS = { draft: 'טיוטה', pending: 'ממתינה לאישור', active: 'פעילה', ended: 'הסתיימה', archived: 'בארכיון' };
const BENEFIT_STATUSES = Object.keys(STATUS_LABELS);

const BENEFIT_FIELDS = ['businessId', 'title', 'shortDescription', 'fullDescription', 'categoryId', 'subcategory', 'discountType',
  'discountValue', 'discountLabel', 'couponCode', 'redeemUrl', 'whatsapp', 'phone', 'address', 'city', 'redeemMode', 'openingHours',
  'terms', 'startDate', 'endDate', 'isPermanent', 'image', 'featured', 'exclusive', 'sortOrder', 'status', 'needsCompletion'];
const BUSINESS_FIELDS = ['name', 'logo', 'categoryId', 'contactName', 'phone', 'email', 'website', 'facebook', 'instagram',
  'address', 'city', 'status', 'joinedAt', 'notes'];

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };

export function createCore(store, opts = {}) {
  const db = () => store.db;
  const save = () => store.save();
  const ai = opts.ai || null;
  const gmail = opts.gmail || null;
  const notify = opts.notify || (() => {});

  // ---------- helpers ----------
  const bizById = id => db().businesses.find(b => b.id === id);
  const benById = id => db().benefits.find(b => b.id === id);
  const catName = id => (db().categories.find(c => c.id === id) || {}).name || '';

  function audit(user, action, entity, entityId, summary) {
    db().auditLog.unshift({ id: uid('log'), at: nowIso(), userId: user ? user.id : 'system', userName: user ? user.name : 'מערכת', action, entity, entityId, summary });
    if (db().auditLog.length > 5000) db().auditLog.length = 5000;
  }

  function addAlert(type, level, title, body, extra = {}) {
    const prefsKey = { expiry: 'expiry', expired: 'expired', new_email_benefit: 'newEmailBenefit', data_quality: 'dataQuality', report: 'reports', weekly_summary: 'weeklySummary' }[type];
    const pref = (db().settings.alertPrefs || {})[prefsKey] || { enabled: true, channels: ['app'] };
    if (!pref.enabled) return null;
    const alert = { id: uid('al'), type, level, title, body, at: nowIso(), read: false, channels: pref.channels, ...extra };
    db().alerts.unshift(alert);
    if (db().alerts.length > 1000) db().alerts.length = 1000;
    try { notify(alert); } catch { /* notification channels must never break the app */ }
    return alert;
  }

  function isLive(b, today = todayStr()) {
    return b.status === 'active' && (!b.startDate || b.startDate <= today) && (b.isPermanent || !b.endDate || b.endDate >= today);
  }

  function discountText(b) {
    if (b.discountLabel) return b.discountLabel;
    if (b.discountType === 'percent' && b.discountValue) return `${b.discountValue}% הנחה`;
    if (b.discountType === 'amount' && b.discountValue) return `${b.discountValue} ₪ הנחה`;
    return 'הטבה';
  }

  function eventCounts(since = null) {
    const m = {};
    for (const e of db().events) {
      if (since && e.at < since) continue;
      const c = m[e.benefitId] || (m[e.benefitId] = { view: 0, redeem_click: 0, coupon_copy: 0, share: 0, report: 0, favorite: 0 });
      c[e.type] = (c[e.type] || 0) + 1;
    }
    return m;
  }

  // Everything a member may see. Internal fields (notes, status, sources, audit) never leave the core here.
  function publicBenefit(b, counts) {
    const biz = bizById(b.businessId) || {};
    const today = todayStr();
    const left = b.isPermanent || !b.endDate ? null : daysUntil(b.endDate, today);
    const publishedDaysAgo = b.publishedAt ? -daysUntil(b.publishedAt.slice(0, 10), today) : 999;
    const tags = [];
    if (publishedDaysAgo <= 14) tags.push('new');
    if (b.exclusive) tags.push('exclusive');
    if (b.featured) tags.push('featured');
    if (left !== null && left <= 14) tags.push('ending');
    return {
      id: b.id, title: b.title, shortDescription: b.shortDescription, fullDescription: b.fullDescription,
      categoryId: b.categoryId, categoryName: catName(b.categoryId), subcategory: b.subcategory,
      discountType: b.discountType, discountValue: Number(b.discountValue) || 0, discountText: discountText(b),
      couponCode: b.couponCode, redeemUrl: b.redeemUrl, whatsapp: b.whatsapp, phone: b.phone || biz.phone || '',
      address: b.address || biz.address || '', city: b.city || biz.city || '', redeemMode: b.redeemMode,
      openingHours: b.openingHours, terms: b.terms, startDate: b.startDate, endDate: b.isPermanent ? '' : b.endDate,
      isPermanent: !!b.isPermanent, daysLeft: left, image: b.image || biz.logo || '', tags,
      business: { id: biz.id, name: biz.name || '', logo: biz.logo || '', website: biz.website || '', instagram: biz.instagram || '', facebook: biz.facebook || '' },
      popularity: counts ? (counts[b.id]?.view || 0) + 3 * (counts[b.id]?.redeem_click || 0) : 0,
      publishedAt: b.publishedAt,
    };
  }

  function liveBenefits() {
    const today = todayStr();
    return db().benefits.filter(b => isLive(b, today));
  }

  function matchesQuery(pb, q) {
    if (!q) return true;
    const hay = normalizeName([pb.title, pb.shortDescription, pb.fullDescription, pb.business.name, pb.categoryName, pb.subcategory, pb.city, pb.discountText, pb.redeemMode === 'online' ? 'אונליין' : ''].join(' '));
    const words = normalizeName(q).split(' ').filter(Boolean);
    // Each word must appear; allow Hebrew prefixes (ה, ב, ל, ו, מ, ש) on the query word.
    return words.every(w => hay.includes(w) || (w.length > 3 && /^[הבלומש]/.test(w) && hay.includes(w.slice(1))));
  }

  function listPublic(query = {}) {
    const counts = eventCounts(addDays(todayStr(), -30));
    let list = liveBenefits().map(b => publicBenefit(b, counts));
    const q = (query.q || '').trim();
    list = list.filter(pb => matchesQuery(pb, q));
    if (query.category) list = list.filter(pb => pb.categoryId === query.category);
    if (query.city) list = list.filter(pb => pb.city === query.city || (query.includeOnline === '1' && pb.redeemMode !== 'in_store'));
    if (query.mode === 'online') list = list.filter(pb => pb.redeemMode === 'online' || pb.redeemMode === 'both');
    if (query.mode === 'in_store') list = list.filter(pb => pb.redeemMode === 'in_store' || pb.redeemMode === 'both');
    if (query.minDiscount) list = list.filter(pb => pb.discountType === 'percent' && pb.discountValue >= Number(query.minDiscount));
    const order = Object.fromEntries(db().benefits.map(b => [b.id, b.sortOrder ?? 999]));
    const sorters = {
      recommended: (a, b) => (b.tags.includes('featured') - a.tags.includes('featured')) || (order[a.id] - order[b.id]),
      popular: (a, b) => b.popularity - a.popularity,
      new: (a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')),
      ending: (a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999),
      discount: (a, b) => (b.discountType === 'percent' ? b.discountValue : 0) - (a.discountType === 'percent' ? a.discountValue : 0),
    };
    list.sort(sorters[query.sort] || sorters.recommended);
    if (q && query.log !== '0') {
      db().searches.push({ id: uid('s'), q: q.slice(0, 60), results: list.length, at: nowIso() });
      if (db().searches.length > 20000) db().searches.splice(0, 5000);
      save();
    }
    return list;
  }

  function requireRole(user, role) {
    if (!user) fail(401, 'יש להתחבר כדי להמשיך');
    if (ROLES[user.role] < ROLES[role]) fail(403, 'אין לך הרשאה לפעולה הזו');
  }

  function safeUser(u) { return u && { id: u.id, email: u.email, name: u.name, role: u.role, roleLabel: ROLE_LABELS[u.role] }; }

  function pick(obj, fields) {
    const out = {};
    for (const f of fields) if (obj[f] !== undefined) out[f] = obj[f];
    return out;
  }

  function cleanBenefitInput(input) {
    const b = pick(input, BENEFIT_FIELDS);
    if (b.discountValue !== undefined) b.discountValue = Number(b.discountValue) || 0;
    if (b.sortOrder !== undefined) b.sortOrder = Number(b.sortOrder) || 0;
    for (const k of ['isPermanent', 'featured', 'exclusive']) if (b[k] !== undefined) b[k] = !!b[k];
    if (b.isPermanent) b.endDate = '';
    if (b.status && !BENEFIT_STATUSES.includes(b.status)) fail(400, 'סטטוס לא תקין');
    for (const k of ['title', 'shortDescription', 'couponCode']) if (typeof b[k] === 'string') b[k] = b[k].trim();
    return b;
  }

  function validateForPublish(b) {
    const errs = [];
    if (!b.title) errs.push('כותרת');
    if (!b.businessId || !bizById(b.businessId)) errs.push('עסק');
    if (!b.categoryId) errs.push('קטגוריה');
    if (!b.discountValue && !b.discountLabel && b.discountType !== 'gift') errs.push('גובה ההנחה או ניסוח ההטבה');
    if (!b.isPermanent && b.endDate && b.endDate < todayStr()) errs.push('תאריך הסיום כבר עבר');
    if (errs.length) fail(400, `חסרים פרטים לפני פרסום: ${errs.join(', ')}`);
  }

  function setStatus(b, status, user) {
    if (status === 'active') {
      validateForPublish(b);
      if (!b.publishedAt) b.publishedAt = nowIso();
    }
    b.status = status;
    b.updatedAt = nowIso();
    b.updatedBy = user ? user.id : 'system';
  }

  function adminBenefit(b, counts) {
    const biz = bizById(b.businessId);
    const c = (counts && counts[b.id]) || {};
    return {
      ...b, businessName: biz ? biz.name : '(ללא עסק)', categoryName: catName(b.categoryId), statusLabel: STATUS_LABELS[b.status],
      daysLeft: b.isPermanent || !b.endDate ? null : daysUntil(b.endDate),
      stats: { views: c.view || 0, redeems: c.redeem_click || 0, copies: c.coupon_copy || 0, shares: c.share || 0, reports: c.report || 0 },
      issues: benefitIssues(b),
    };
  }

  function benefitIssues(b) {
    const issues = [];
    if (b.needsCompletion) issues.push(b.needsCompletion);
    if (!b.title) issues.push('חסרה כותרת');
    if (!b.discountValue && !b.discountLabel && b.discountType !== 'gift') issues.push('חסר גובה ההנחה');
    if (!b.isPermanent && !b.endDate) issues.push('לא הוגדר תוקף (תאריך סיום או הטבה קבועה)');
    const biz = bizById(b.businessId);
    if (!b.couponCode && !b.redeemUrl && !b.whatsapp && !b.phone && !b.address && !(biz && (biz.phone || biz.website))) issues.push('אין דרך מימוש (קופון, קישור, טלפון או כתובת)');
    if (b.couponCode && (/\s/.test(b.couponCode) || b.couponCode.length < 3)) issues.push('קוד הקופון נראה לא תקין');
    for (const [k, label] of [['redeemUrl', 'קישור המימוש'], ['whatsapp', 'קישור הוואטסאפ']]) {
      const v = b[k];
      if (v && k === 'redeemUrl' && !/^https?:\/\/[^\s.]+\.[^\s]+$/.test(v)) issues.push(`${label} לא תקין`);
      if (v && k === 'whatsapp' && !/^(\+?972|0)?[\d-\s]{8,}$|^https:\/\/(wa\.me|api\.whatsapp\.com)\//.test(v)) issues.push(`${label} לא תקין`);
    }
    if (b.linkBroken) issues.push('הקישור לא נטען בבדיקה האחרונה');
    return issues;
  }

  function businessStats(bizId) {
    const bens = db().benefits.filter(b => b.businessId === bizId);
    return { active: bens.filter(b => isLive(b)).length, total: bens.length };
  }

  // ---------- email pipeline ----------
  async function extractFromEmail(email) {
    if (ai && ai.available && ai.available()) {
      try {
        const r = await ai.extract(email, { categories: db().categories });
        if (r) return { ...r, engine: 'ai' };
      } catch (e) { /* fall back to rules */ }
    }
    return { ...extractBenefitRuleBased(email, { categories: db().categories }), engine: 'rules' };
  }

  function duplicatesFor(fields) {
    const businesses = findDuplicateBusinesses(db().businesses, { name: fields.businessName, email: fields.email, phone: fields.phone, whatsapp: fields.whatsapp, website: fields.website });
    const benefits = findSimilarBenefits(db().benefits, fields, businesses.filter(b => b.strong).map(b => b.id));
    return { businesses, benefits };
  }

  function benefitFromFields(f, businessId, user) {
    return {
      id: uid('ben'), businessId: businessId || '', title: f.title || '', shortDescription: f.shortDescription || (f.description || '').slice(0, 140),
      fullDescription: f.description || '', categoryId: f.categoryId || '', subcategory: '', discountType: f.discountType || 'percent',
      discountValue: Number(f.discountValue) || 0, discountLabel: f.discountLabel || '', couponCode: f.couponCode || '',
      redeemUrl: f.website || '', whatsapp: f.whatsapp || '', phone: f.phone || '', address: f.address || '', city: f.city || '',
      redeemMode: f.redeemMode || 'both', openingHours: '', terms: f.terms || '', startDate: f.startDate || todayStr(),
      endDate: f.endDate || '', isPermanent: false, image: f.logoData || '', featured: false, exclusive: false,
      sortOrder: db().benefits.length + 1, status: 'pending', needsCompletion: '', source: 'email', sourceEmailId: null,
      createdBy: user ? user.id : 'system', updatedBy: user ? user.id : 'system', createdAt: nowIso(), updatedAt: nowIso(), publishedAt: null,
    };
  }

  function businessFromFields(f) {
    return {
      id: uid('biz'), name: f.businessName || 'עסק חדש', logo: f.logoData || '', categoryId: f.categoryId || '', contactName: f.contactName || '',
      phone: f.phone || '', email: f.email || '', website: f.website || '', facebook: /facebook/.test(f.social || '') ? f.social : '',
      instagram: /instagram/.test(f.social || '') ? f.social : '', address: f.address || '', city: f.city || '', status: 'active',
      joinedAt: todayStr(), notes: '', createdAt: nowIso(), updatedAt: nowIso(),
    };
  }

  // Processes one incoming email. Returns the steps taken (shown in demo mode).
  async function processEmail(raw, { user = null, source = 'gmail' } = {}) {
    const steps = [];
    const settings = db().settings;
    const triage = triageEmail(raw, settings, db().senders);
    steps.push({ key: 'received', title: 'המייל התקבל', detail: `${raw.fromName || raw.from} · ${raw.subject}` });
    steps.push({ key: 'triage', title: triage.relevant ? 'זוהה כהצעת הטבה' : 'לא זוהה כהצעת הטבה', detail: triage.reasons.join(' · ') || 'לא נמצאו סימנים להטבה', ok: triage.relevant });
    if (!triage.relevant) {
      // Not relevant: keep nothing but the message id, so it is not processed again.
      if (raw.gmailId) db().jobState.seenGmailIds = [...(db().jobState.seenGmailIds || []).slice(-2000), raw.gmailId];
      save();
      return { steps, relevant: false };
    }
    const extraction = await extractFromEmail(raw);
    const img = (raw.attachmentData || []).find(a => /^image\//.test(a.type) && a.data.length < 400000);
    if (img) extraction.fields.logoData = `data:${img.type};base64,${img.data}`;
    steps.push({ key: 'extract', title: extraction.engine === 'ai' ? 'הפרטים חולצו בעזרת AI' : 'הפרטים חולצו (מנוע חילוץ מקומי)', detail: `ציון ביטחון ${extraction.overall}% · ${Object.keys(extraction.fields).length} שדות זוהו${extraction.missing.length ? ` · חסרים: ${extraction.missing.map(k => FIELD_LABELS[k]).join(', ')}` : ''}` });
    const dups = duplicatesFor(extraction.fields);
    steps.push({ key: 'dups', title: dups.businesses.length || dups.benefits.length ? 'נמצאו התאמות במאגר' : 'לא נמצאו כפילויות', detail: [...dups.businesses.map(d => `עסק: ${d.name} (${d.reasons.join(', ')})`), ...dups.benefits.map(d => `הטבה: ${d.title}`)].join(' · ') || 'העסק וההטבה חדשים במאגר', warn: !!(dups.businesses.length || dups.benefits.length) });

    const email = {
      id: uid('em'), gmailId: raw.gmailId || null, source, from: raw.from, fromName: raw.fromName || '', to: raw.to || '', subject: raw.subject,
      receivedAt: raw.receivedAt || nowIso(), body: (raw.body || '').slice(0, 20000), attachments: (raw.attachments || []).map(a => ({ name: a.name, type: a.type })),
      triage: { reasons: triage.reasons, score: triage.score }, extraction, duplicates: dups, status: 'pending_review', benefitId: null,
      processedAt: nowIso(), handledBy: null, handledAt: null,
    };
    const strongBiz = dups.businesses.find(d => d.strong);
    const ben = benefitFromFields(extraction.fields, strongBiz ? strongBiz.id : '', user);
    ben.sourceEmailId = email.id;
    email.benefitId = ben.id;
    db().benefits.push(ben);
    db().emails.unshift(email);

    // Auto-publish only for senders the admin explicitly trusted and approved for it.
    const snd = triage.sender;
    let autoPublished = false;
    if (snd && snd.trusted && snd.autoPublish && extraction.overall >= 70 && !dups.benefits.length
      && REQUIRED_FIELDS.every(k => extraction.fields[k] !== undefined && extraction.fields[k] !== '')) {
      if (!ben.businessId) { const nb = businessFromFields(extraction.fields); db().businesses.push(nb); ben.businessId = nb.id; }
      try {
        setStatus(ben, 'active', null);
        email.status = 'approved'; email.handledBy = 'פרסום אוטומטי'; email.handledAt = nowIso();
        autoPublished = true;
        audit(null, 'auto_publish', 'benefit', ben.id, `פורסמה אוטומטית מהשולח המאושר ${snd.email}: ${ben.title}`);
      } catch { ben.status = 'pending'; }
    }
    steps.push({ key: 'queue', title: autoPublished ? 'פורסם אוטומטית (שולח מאושר)' : 'הועבר לתור האישור', detail: autoPublished ? 'השולח הוגדר כמקור מהימן עם פרסום אוטומטי' : 'ממתין לבדיקה ואישור של המנהלת', ok: true });
    audit(user, 'email_ingested', 'email', email.id, `התקבל מייל מ־${raw.from}: ${raw.subject}`);
    addAlert('new_email_benefit', 'info', autoPublished ? 'הטבה חדשה פורסמה אוטומטית' : 'הטבה חדשה ממתינה לאישור', `${extraction.fields.businessName || raw.fromName || raw.from}: ${extraction.fields.title || raw.subject}`, { emailId: email.id, benefitId: ben.id });
    if (raw.gmailId && gmail && gmail.markProcessed) { try { await gmail.markProcessed(raw.gmailId); steps.push({ key: 'label', title: 'סומן בתווית „טופל” ב־Gmail', ok: true }); } catch { /* retried on next check */ } }
    if (raw.gmailId) db().jobState.seenGmailIds = [...(db().jobState.seenGmailIds || []).slice(-2000), raw.gmailId];
    save();
    return { steps, relevant: true, emailId: email.id, benefitId: ben.id, autoPublished };
  }

  // ---------- automations ----------
  function isoWeek(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day + 3);
    const first = new Date(d.getFullYear(), 0, 4);
    return `${d.getFullYear()}-W${String(1 + Math.round(((d - first) / 86400000 - 3 + ((first.getDay() + 6) % 7)) / 7)).padStart(2, '0')}`;
  }

  function weeklySummary() {
    const since = addDays(todayStr(), -7);
    const bens = db().benefits;
    const added = bens.filter(b => b.createdAt && b.createdAt.slice(0, 10) >= since && b.status !== 'archived');
    const expired = bens.filter(b => b.status === 'ended' && b.updatedAt && b.updatedAt.slice(0, 10) >= since);
    const ev = db().events.filter(e => e.at.slice(0, 10) >= since);
    const bizCount = db().businesses.filter(b => b.status === 'active').length;
    return {
      newBenefits: added.length, expired: expired.length, views: ev.filter(e => e.type === 'view').length,
      redeems: ev.filter(e => e.type === 'redeem_click').length, businesses: bizCount, goal: db().settings.businessGoal || 100,
    };
  }

  function runJobs() {
    const today = todayStr();
    const st = db().jobState;
    st.sent = st.sent || {};
    const prefs = db().settings.alertPrefs || {};
    let changed = false;
    const quality = [];
    for (const b of db().benefits) {
      if (b.status === 'active' && !b.isPermanent && b.endDate && b.endDate < today) {
        b.status = 'ended'; b.updatedAt = nowIso(); b.updatedBy = 'system'; changed = true;
        audit(null, 'auto_expire', 'benefit', b.id, `הטבה הועברה ל„הסתיימה” (תוקף ${formatDateHe(b.endDate)}): ${b.title}`);
        addAlert('expired', 'warning', 'הטבה הסתיימה', `${bizById(b.businessId)?.name || ''} – ${b.title}. אפשר לחדש אותה או לשלוח לעסק הודעת חידוש.`, { benefitId: b.id });
      }
      if (b.status === 'active' && !b.isPermanent && b.endDate) {
        const left = daysUntil(b.endDate, today);
        const days = (prefs.expiry && prefs.expiry.days) || [14, 7, 2];
        const due = days.filter(d => left <= d && left >= 0).sort((x, y) => x - y)[0];
        if (due !== undefined && !st.sent[`exp:${b.id}:${due}:${b.endDate}`]) {
          // Mark every larger threshold as sent too, so a new benefit doesn't trigger three alerts at once.
          days.filter(d => d >= due).forEach(d => { st.sent[`exp:${b.id}:${d}:${b.endDate}`] = today; });
          addAlert('expiry', left <= 2 ? 'critical' : 'warning', `הטבה מסתיימת בעוד ${left === 0 ? 'היום' : left + ' ימים'}`, `${bizById(b.businessId)?.name || ''} – ${b.title} (עד ${formatDateHe(b.endDate)})`, { benefitId: b.id });
          changed = true;
        }
      }
      if (b.status === 'active' || b.status === 'pending') {
        const issues = benefitIssues(b);
        const key = `dq:${b.id}:${issues.join('|')}`;
        if (issues.length && !st.sent[key]) {
          st.sent[key] = today;
          quality.push({ b, issues });
        }
      }
    }
    // A few issues get one alert each; many at once are grouped so the alert list stays readable.
    if (quality.length > 3) {
      addAlert('data_quality', 'info', `${quality.length} הטבות עם פרטים חסרים או לא תקינים`, quality.slice(0, 6).map(q => `${bizById(q.b.businessId)?.name || q.b.title}: ${q.issues[0]}`).join(' · ') + (quality.length > 6 ? ' ועוד…' : ''), { filter: 'needs' });
      changed = true;
    } else for (const q of quality) {
      addAlert('data_quality', 'info', 'פרטים חסרים או לא תקינים', `${bizById(q.b.businessId)?.name || ''} – ${q.b.title}: ${q.issues.join('; ')}`, { benefitId: q.b.id });
      changed = true;
    }
    const week = isoWeek(today);
    if (st.weeklySummaryWeek !== week) {
      st.weeklySummaryWeek = week;
      const s = weeklySummary();
      addAlert('weekly_summary', 'info', 'סיכום שבועי', `${s.newBenefits} הטבות חדשות · ${s.expired} הסתיימו · ${s.views} צפיות · ${s.redeems} לחיצות למימוש · ${s.businesses}/${s.goal} עסקים במאגר`, { summary: s });
      changed = true;
    }
    if (changed) save();
    return { ok: true };
  }

  // ---------- statistics ----------
  function stats(days = 30) {
    const since = addDays(todayStr(), -days);
    const counts = eventCounts(since);
    const bens = db().benefits.filter(b => b.status !== 'archived');
    const perBenefit = bens.map(b => adminBenefit(b, counts)).map(b => ({ id: b.id, title: b.title, businessName: b.businessName, categoryName: b.categoryName, status: b.status, statusLabel: b.statusLabel, ...b.stats }));
    perBenefit.sort((a, b) => b.views - a.views);
    const cats = db().categories.map(c => {
      const ids = new Set(bens.filter(b => b.categoryId === c.id).map(b => b.id));
      let views = 0, redeems = 0;
      for (const id of ids) { views += counts[id]?.view || 0; redeems += counts[id]?.redeem_click || 0; }
      return { id: c.id, name: c.name, views, redeems, benefits: ids.size };
    }).sort((a, b) => b.views - a.views);
    const searches = db().searches.filter(s => s.at >= since);
    const group = arr => Object.entries(arr.reduce((m, s) => { const k = s.q.trim(); m[k] = (m[k] || 0) + 1; return m; }, {})).map(([q, n]) => ({ q, n })).sort((a, b) => b.n - a.n);
    const bizPerf = db().businesses.map(z => {
      const ids = bens.filter(b => b.businessId === z.id).map(b => b.id);
      return { id: z.id, name: z.name, views: ids.reduce((n, id) => n + (counts[id]?.view || 0), 0), redeems: ids.reduce((n, id) => n + (counts[id]?.redeem_click || 0), 0) };
    }).sort((a, b) => b.redeems - a.redeems || b.views - a.views);
    const daily = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = addDays(todayStr(), -i);
      daily.push({ date: d, views: 0, redeems: 0 });
    }
    const dIdx = Object.fromEntries(daily.map((d, i) => [d.date, i]));
    for (const e of db().events) {
      const i = dIdx[e.at.slice(0, 10)];
      if (i === undefined) continue;
      if (e.type === 'view') daily[i].views++;
      if (e.type === 'redeem_click') daily[i].redeems++;
    }
    const totals = { views: 0, redeems: 0, copies: 0, shares: 0, reports: 0 };
    for (const p of perBenefit) { totals.views += p.views; totals.redeems += p.redeems; totals.copies += p.copies; totals.shares += p.shares; totals.reports += p.reports; }
    const sources = { manual: 0, email: 0, import: 0 };
    for (const b of bens) sources[b.source || 'manual'] = (sources[b.source || 'manual'] || 0) + 1;
    return {
      days, totals, perBenefit, categories: cats, topSearches: group(searches).slice(0, 15),
      zeroSearches: group(searches.filter(s => s.results === 0)).slice(0, 15),
      topBusinesses: bizPerf.slice(0, 10), noExposure: perBenefit.filter(p => p.status === 'active' && p.views === 0),
      sources, daily, hasSampleStats: !!db().meta.hasSampleStats,
    };
  }

  function overview() {
    const today = todayStr();
    const bens = db().benefits;
    const counts = eventCounts(addDays(today, -30));
    const live = bens.filter(b => isLive(b, today));
    const expiring = live.filter(b => !b.isPermanent && b.endDate && daysUntil(b.endDate, today) <= 14).map(b => adminBenefit(b, counts)).sort((a, b) => a.daysLeft - b.daysLeft);
    const expired = bens.filter(b => b.status === 'ended').map(b => adminBenefit(b, counts));
    const s = stats(30);
    return {
      activeBenefits: live.length,
      businesses: db().businesses.filter(b => b.status !== 'ended').length,
      businessGoal: db().settings.businessGoal || 100,
      pendingEmails: db().emails.filter(e => e.status === 'pending_review').length,
      pendingBenefits: bens.filter(b => b.status === 'pending').length,
      needsCompletion: bens.filter(b => b.needsCompletion && b.status !== 'archived').map(b => adminBenefit(b, counts)),
      expiring, expired, totals: s.totals, topBenefits: s.perBenefit.filter(p => p.status === 'active').slice(0, 8),
      categories: s.categories, zeroSearches: s.zeroSearches.slice(0, 8), sources: s.sources,
      unreadAlerts: db().alerts.filter(a => !a.read).length, alerts: db().alerts.slice(0, 6),
      openReports: db().reports.filter(r => r.status === 'open').length,
      weekly: weeklySummary(), gmailMode: db().settings.gmail.mode, hasSampleStats: !!db().meta.hasSampleStats,
      aiAvailable: !!(ai && ai.available && ai.available()),
    };
  }

  // ---------- router ----------
  const routes = [];
  const route = (method, pattern, role, fn) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, role, fn });
  };

  // ----- public -----
  route('GET', '/api/public/bootstrap', null, () => {
    const s = db().settings;
    const live = liveBenefits();
    const cities = [...new Set(live.map(b => b.city || bizById(b.businessId)?.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he'));
    return {
      siteName: s.siteName, tagline: s.tagline, logo: s.logo, contactEmail: s.contactEmail,
      categories: db().categories.map(c => ({ id: c.id, name: c.name, icon: c.icon, count: live.filter(b => b.categoryId === c.id).length })),
      cities, total: live.length, demo: opts.mode === 'demo',
    };
  });
  route('GET', '/api/public/home', null, () => {
    const counts = eventCounts(addDays(todayStr(), -30));
    const all = liveBenefits().map(b => publicBenefit(b, counts));
    const byNew = [...all].sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
    return {
      featured: all.filter(b => b.tags.includes('featured')).slice(0, 8),
      newest: byNew.slice(0, 8),
      popular: [...all].sort((a, b) => b.popularity - a.popularity).slice(0, 8),
      ending: all.filter(b => b.daysLeft !== null && b.daysLeft <= 21).sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 8),
    };
  });
  route('GET', '/api/public/benefits', null, ({ query }) => ({ items: listPublic(query) }));
  route('POST', '/api/public/benefits/by-ids', null, ({ body }) => {
    const ids = new Set((body.ids || []).slice(0, 200));
    return { items: liveBenefits().filter(b => ids.has(b.id)).map(b => publicBenefit(b)) };
  });
  route('GET', '/api/public/benefits/:id', null, ({ params, user }) => {
    const b = benById(params.id);
    // Editors may preview unpublished benefits; members only see live ones.
    const canPreview = user && ROLES[user.role] >= ROLES.editor;
    if (!b || (!isLive(b) && !canPreview)) fail(404, 'ההטבה לא נמצאה או שאינה פעילה עוד');
    const counts = eventCounts(addDays(todayStr(), -30));
    const pb = publicBenefit(b, counts);
    const related = liveBenefits().filter(x => x.id !== b.id && x.categoryId === b.categoryId).map(x => publicBenefit(x, counts)).sort((a, c) => c.popularity - a.popularity).slice(0, 4);
    return { benefit: pb, related, preview: !isLive(b) };
  });
  route('POST', '/api/public/events', null, ({ body }) => {
    const types = ['view', 'redeem_click', 'coupon_copy', 'share', 'favorite'];
    if (!types.includes(body.type) || !benById(body.benefitId)) fail(400, 'אירוע לא תקין');
    // No personal data is stored with events: type, benefit and time only.
    db().events.push({ id: uid('ev'), type: body.type, benefitId: body.benefitId, at: nowIso() });
    save();
    return { ok: true };
  });
  route('POST', '/api/public/reports', null, ({ body }) => {
    const b = benById(body.benefitId);
    if (!b) fail(404, 'ההטבה לא נמצאה');
    const reason = String(body.reason || '').slice(0, 80);
    if (!reason) fail(400, 'יש לבחור סיבה');
    const rep = { id: uid('rep'), benefitId: b.id, reason, note: String(body.note || '').slice(0, 500), at: nowIso(), status: 'open' };
    db().reports.unshift(rep);
    db().events.push({ id: uid('ev'), type: 'report', benefitId: b.id, at: nowIso() });
    addAlert('report', 'warning', 'דיווח על הטבה', `${bizById(b.businessId)?.name || ''} – ${b.title}: ${reason}${rep.note ? ` („${rep.note}”)` : ''}`, { benefitId: b.id, reportId: rep.id });
    save();
    return { ok: true };
  });

  // ----- auth -----
  route('POST', '/api/auth/login', null, async ({ body }) => {
    const email = String(body.email || '').trim().toLowerCase();
    const u = db().users.find(x => x.email.toLowerCase() === email && !x.disabled);
    if (!u || !(await opts.checkPassword(u, String(body.password || '')))) fail(401, 'המייל או הסיסמה שגויים');
    u.lastLoginAt = nowIso();
    audit(u, 'login', 'user', u.id, 'התחברות למערכת');
    save();
    return { user: safeUser(u), __session: { userId: u.id } };
  });
  route('POST', '/api/auth/logout', null, () => ({ ok: true, __session: null }));
  route('GET', '/api/auth/me', null, ({ user }) => ({ user: safeUser(user) }));

  route('GET', '/api/me/favorites', 'member', ({ user }) => ({ ids: db().favorites.filter(f => f.userId === user.id).map(f => f.benefitId) }));
  route('PUT', '/api/me/favorites', 'member', ({ user, body }) => {
    const ids = [...new Set((body.ids || []).filter(id => benById(id)))].slice(0, 500);
    db().favorites = db().favorites.filter(f => f.userId !== user.id).concat(ids.map(benefitId => ({ userId: user.id, benefitId, at: nowIso() })));
    save();
    return { ids };
  });

  // ----- admin: overview, stats -----
  route('GET', '/api/admin/overview', 'editor', () => overview());
  route('GET', '/api/admin/stats', 'editor', ({ query }) => stats(Math.min(365, Number(query.days) || 30)));
  route('POST', '/api/admin/stats/clear-sample', 'admin', ({ user }) => {
    db().events = db().events.filter(e => !e.sample);
    db().searches = db().searches.filter(s => !s.sample);
    db().meta.hasSampleStats = false;
    audit(user, 'clear_sample_stats', 'system', '', 'נמחקו נתוני הסטטיסטיקה לדוגמה');
    save();
    return { ok: true };
  });

  // ----- admin: benefits -----
  route('GET', '/api/admin/benefits', 'editor', ({ query }) => {
    const counts = eventCounts(addDays(todayStr(), -30));
    let list = db().benefits.map(b => adminBenefit(b, counts));
    const q = normalizeName(query.q || '');
    if (q) list = list.filter(b => normalizeName(`${b.title} ${b.businessName} ${b.couponCode} ${b.city} ${b.categoryName}`).includes(q));
    if (query.status === 'needs') list = list.filter(b => b.issues.length);
    else if (query.status === 'expiring') list = list.filter(b => b.status === 'active' && b.daysLeft !== null && b.daysLeft <= 14);
    else if (query.status) list = list.filter(b => b.status === query.status);
    else list = list.filter(b => b.status !== 'archived');
    if (query.category) list = list.filter(b => b.categoryId === query.category);
    if (query.source) list = list.filter(b => b.source === query.source);
    if (query.businessId) list = list.filter(b => b.businessId === query.businessId);
    list.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
    return { items: list };
  });
  route('GET', '/api/admin/benefits/:id', 'editor', ({ params }) => {
    const b = benById(params.id);
    if (!b) fail(404, 'ההטבה לא נמצאה');
    const counts = eventCounts();
    const history = db().auditLog.filter(l => l.entityId === b.id).slice(0, 30);
    return { benefit: adminBenefit(b, counts), history, sourceEmail: b.sourceEmailId ? db().emails.find(e => e.id === b.sourceEmailId) || null : null };
  });
  route('POST', '/api/admin/benefits', 'editor', ({ body, user }) => {
    const input = cleanBenefitInput(body);
    const b = {
      id: uid('ben'), businessId: '', title: '', shortDescription: '', fullDescription: '', categoryId: '', subcategory: '', discountType: 'percent',
      discountValue: 0, discountLabel: '', couponCode: '', redeemUrl: '', whatsapp: '', phone: '', address: '', city: '', redeemMode: 'in_store',
      openingHours: '', terms: '', startDate: todayStr(), endDate: '', isPermanent: false, image: '', featured: false, exclusive: false,
      needsCompletion: '', sortOrder: Math.max(0, ...db().benefits.map(x => x.sortOrder || 0)) + 1, status: 'draft', source: 'manual', sourceEmailId: null,
      createdBy: user.id, updatedBy: user.id, createdAt: nowIso(), updatedAt: nowIso(), publishedAt: null, ...input,
    };
    if (!b.title) fail(400, 'יש למלא כותרת להטבה');
    if (b.status === 'active') { b.status = 'draft'; setStatus(b, 'active', user); }
    db().benefits.push(b);
    audit(user, 'create', 'benefit', b.id, `נוספה הטבה (${STATUS_LABELS[b.status]}): ${b.title}`);
    save();
    return { benefit: adminBenefit(b) };
  });
  route('PUT', '/api/admin/benefits/:id', 'editor', ({ params, body, user }) => {
    const b = benById(params.id);
    if (!b) fail(404, 'ההטבה לא נמצאה');
    const input = cleanBenefitInput(body);
    const changed = Object.keys(input).filter(k => JSON.stringify(input[k]) !== JSON.stringify(b[k]));
    const newStatus = input.status; delete input.status;
    Object.assign(b, input, { updatedAt: nowIso(), updatedBy: user.id });
    if (newStatus && newStatus !== b.status) setStatus(b, newStatus, user);
    else if (b.status === 'active') validateForPublish(b);
    delete b.linkBroken;
    audit(user, 'update', 'benefit', b.id, `עודכנה הטבה: ${b.title}${changed.length ? ` (${changed.length} שדות)` : ''}`);
    save();
    return { benefit: adminBenefit(b) };
  });
  route('POST', '/api/admin/benefits/:id/duplicate', 'editor', ({ params, user }) => {
    const b = benById(params.id);
    if (!b) fail(404, 'ההטבה לא נמצאה');
    const copy = { ...b, id: uid('ben'), title: `${b.title} (עותק)`, status: 'draft', publishedAt: null, createdAt: nowIso(), updatedAt: nowIso(), createdBy: user.id, updatedBy: user.id, source: 'manual', sourceEmailId: null, sortOrder: (b.sortOrder || 0) + 0.5 };
    db().benefits.push(copy);
    audit(user, 'duplicate', 'benefit', copy.id, `שוכפלה הטבה: ${b.title}`);
    save();
    return { benefit: adminBenefit(copy) };
  });
  route('POST', '/api/admin/benefits/:id/status', 'editor', ({ params, body, user }) => {
    const b = benById(params.id);
    if (!b) fail(404, 'ההטבה לא נמצאה');
    if (!BENEFIT_STATUSES.includes(body.status)) fail(400, 'סטטוס לא תקין');
    const prev = b.status;
    setStatus(b, body.status, user);
    const verbs = { active: 'פורסמה', draft: 'הוסרה מהאתר (טיוטה)', archived: 'הועברה לארכיון', ended: 'סומנה כהסתיימה', pending: 'הועברה לאישור' };
    audit(user, body.status === 'active' ? 'publish' : 'status', 'benefit', b.id, `${verbs[body.status]}: ${b.title} (מ„${STATUS_LABELS[prev]}”)`);
    save();
    return { benefit: adminBenefit(b) };
  });
  route('POST', '/api/admin/benefits/:id/renew', 'editor', ({ params, body, user }) => {
    const b = benById(params.id);
    if (!b) fail(404, 'ההטבה לא נמצאה');
    if (body.isPermanent) { b.isPermanent = true; b.endDate = ''; }
    else {
      if (!body.endDate || body.endDate < todayStr()) fail(400, 'יש לבחור תאריך סיום עתידי');
      b.endDate = body.endDate; b.isPermanent = false;
    }
    b.startDate = b.startDate && b.startDate <= todayStr() ? b.startDate : todayStr();
    setStatus(b, 'active', user);
    audit(user, 'renew', 'benefit', b.id, `חודשה הטבה${b.isPermanent ? ' כקבועה' : ` עד ${formatDateHe(b.endDate)}`}: ${b.title}`);
    save();
    return { benefit: adminBenefit(b) };
  });
  route('POST', '/api/admin/benefits/:id/delete', 'admin', ({ params, body, user }) => {
    const b = benById(params.id);
    if (!b) fail(404, 'ההטבה לא נמצאה');
    // Permanent delete needs a second, typed confirmation.
    if (body.confirm !== 'מחיקה') fail(400, 'כדי למחוק לצמיתות יש להקליד „מחיקה”');
    db().benefits = db().benefits.filter(x => x.id !== b.id);
    db().favorites = db().favorites.filter(f => f.benefitId !== b.id);
    audit(user, 'delete', 'benefit', b.id, `נמחקה לצמיתות: ${b.title}`);
    save();
    return { ok: true };
  });
  route('POST', '/api/admin/benefits/bulk', 'editor', ({ body, user }) => {
    const ids = body.ids || [];
    const errors = [];
    let n = 0;
    for (const id of ids) {
      const b = benById(id);
      if (!b) continue;
      try {
        switch (body.action) {
          case 'publish': setStatus(b, 'active', user); break;
          case 'unpublish': setStatus(b, 'draft', user); break;
          case 'archive': setStatus(b, 'archived', user); break;
          case 'feature': b.featured = !!body.value; break;
          case 'exclusive': b.exclusive = !!body.value; break;
          case 'category': if (!db().categories.some(c => c.id === body.value)) fail(400, 'קטגוריה לא קיימת'); b.categoryId = body.value; break;
          case 'endDate': if (!body.value) fail(400, 'יש לבחור תאריך'); b.endDate = body.value; b.isPermanent = false; break;
          case 'permanent': b.isPermanent = true; b.endDate = ''; break;
          default: fail(400, 'פעולה לא מוכרת');
        }
        b.updatedAt = nowIso(); b.updatedBy = user.id; n++;
      } catch (e) { errors.push(`${b.title}: ${e.message}`); }
    }
    audit(user, 'bulk', 'benefit', '', `עריכה מרוכזת (${body.action}) ל־${n} הטבות`);
    save();
    return { updated: n, errors };
  });
  route('POST', '/api/admin/benefits/reorder', 'editor', ({ body, user }) => {
    (body.ids || []).forEach((id, i) => { const b = benById(id); if (b) b.sortOrder = i + 1; });
    audit(user, 'reorder', 'benefit', '', 'שונה סדר הצגת ההטבות');
    save();
    return { ok: true };
  });
  route('GET', '/api/admin/benefits/:id/renewal-message', 'editor', ({ params }) => {
    const b = benById(params.id);
    if (!b) fail(404, 'ההטבה לא נמצאה');
    const biz = bizById(b.businessId) || {};
    const s = db().settings;
    const text = `שלום ${biz.contactName || biz.name || ''},\n\nתודה רבה על ההטבה „${b.title}” שאתם מעניקים לחברות ${s.siteName}.${b.endDate ? `\nתוקף ההטבה ${daysUntil(b.endDate) < 0 ? 'הסתיים' : 'מסתיים'} ב־${formatDateHe(b.endDate)}.` : ''}\nנשמח מאוד להמשיך את שיתוף הפעולה. האם אפשר לחדש את ההטבה לתקופה נוספת? אם תרצו לעדכן את תנאי ההטבה, נשמח לשמוע.\n\nבתודה,\n${s.siteName}`;
    const phone = (biz.phone || b.whatsapp || b.phone || '').replace(/\D/g, '').replace(/^0/, '972');
    return { text, email: biz.email || '', whatsappUrl: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : '', mailto: biz.email ? `mailto:${biz.email}?subject=${encodeURIComponent('חידוש הטבה – ' + s.siteName)}&body=${encodeURIComponent(text)}` : '' };
  });
  route('POST', '/api/admin/coupon', 'editor', ({ body }) => ({ code: randomCoupon((body.prefix || 'REUT').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'REUT') }));
  route('POST', '/api/admin/benefits/:id/rewrite', 'editor', async ({ params }) => {
    const b = benById(params.id);
    if (!b) fail(404, 'ההטבה לא נמצאה');
    return rewrite(b);
  });
  route('POST', '/api/admin/rewrite', 'editor', async ({ body }) => rewrite(body));

  async function rewrite(b) {
    const bizName = b.businessName || bizById(b.businessId)?.name || '';
    if (ai && ai.available && ai.available()) {
      try { const r = await ai.rewrite(b, bizName); if (r) return { ...r, engine: 'ai' }; } catch { /* fall back */ }
    }
    return { ...rewriteMarketingRuleBased(b, bizName), engine: 'rules' };
  }

  // ----- admin: import / export -----
  route('GET', '/api/admin/export/:kind', 'editor', ({ params }) => {
    if (params.kind === 'benefits') {
      return {
        columns: ['מזהה', 'שם העסק', 'כותרת', 'תיאור קצר', 'קטגוריה', 'הנחה', 'קוד קופון', 'קישור למימוש', 'טלפון', 'עיר', 'תאריך התחלה', 'תאריך סיום', 'קבועה', 'סטטוס', 'מקור', 'השלמות נדרשות'],
        rows: db().benefits.map(b => [b.id, bizById(b.businessId)?.name || '', b.title, b.shortDescription, catName(b.categoryId), discountText(b), b.couponCode, b.redeemUrl, b.phone, b.city, b.startDate, b.endDate, b.isPermanent ? 'כן' : 'לא', STATUS_LABELS[b.status], { manual: 'ידני', email: 'מייל', import: 'ייבוא' }[b.source] || b.source, b.needsCompletion || '']),
      };
    }
    if (params.kind === 'businesses') {
      return {
        columns: ['מזהה', 'שם העסק', 'קטגוריה', 'איש קשר', 'טלפון', 'מייל', 'אתר', 'כתובת', 'עיר', 'סטטוס שיתוף פעולה', 'תאריך הצטרפות', 'הטבות פעילות'],
        rows: db().businesses.map(z => [z.id, z.name, catName(z.categoryId), z.contactName, z.phone, z.email, z.website, z.address, z.city, BIZ_STATUS[z.status] || z.status, z.joinedAt, businessStats(z.id).active]),
      };
    }
    fail(404, 'סוג ייצוא לא מוכר');
  });
  route('POST', '/api/admin/import/benefits', 'editor', ({ body, user }) => {
    const rows = (body.rows || []).slice(0, 2000);
    const col = (r, ...names) => { for (const n of names) if (r[n] !== undefined && r[n] !== null && String(r[n]).trim() !== '') return String(r[n]).trim(); return ''; };
    let created = 0, linked = 0, newBiz = 0;
    const skipped = [];
    for (const [i, r] of rows.entries()) {
      const bizName = col(r, 'שם העסק', 'עסק', 'business');
      const title = col(r, 'כותרת', 'כותרת ההטבה', 'ההטבה', 'title');
      if (!bizName || !title) { skipped.push(`שורה ${i + 2}: חסר שם עסק או כותרת`); continue; }
      let biz = db().businesses.find(z => normalizeName(z.name) === normalizeName(bizName));
      if (!biz) {
        const dup = findDuplicateBusinesses(db().businesses, { name: bizName, phone: col(r, 'טלפון', 'phone'), website: col(r, 'אתר', 'קישור למימוש') }).find(d => d.strong);
        biz = dup ? bizById(dup.id) : null;
      }
      if (biz) linked++;
      else { biz = businessFromFields({ businessName: bizName, phone: col(r, 'טלפון', 'phone'), city: col(r, 'עיר', 'city'), website: col(r, 'אתר') }); db().businesses.push(biz); newBiz++; }
      const catText = col(r, 'קטגוריה', 'category');
      const cat = db().categories.find(c => c.name === catText || c.id === catText);
      const disc = col(r, 'הנחה', 'אחוז הנחה', 'שווי ההטבה', 'discount');
      const pct = disc.match(/(\d{1,2})\s*%/);
      const end = col(r, 'תאריך סיום', 'תוקף', 'endDate');
      const toIso = s => { const m = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/); if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; };
      const b = {
        ...benefitFromFields({}, biz.id, user), title, shortDescription: col(r, 'תיאור קצר', 'תיאור'), fullDescription: col(r, 'תיאור מלא', 'תיאור'),
        categoryId: cat ? cat.id : '', discountType: pct ? 'percent' : disc ? 'amount' : 'gift', discountValue: pct ? Number(pct[1]) : Number(disc.replace(/\D/g, '')) || 0,
        discountLabel: pct ? '' : disc, couponCode: col(r, 'קוד קופון', 'קופון', 'coupon'), redeemUrl: col(r, 'קישור למימוש', 'קישור', 'אתר'),
        phone: col(r, 'טלפון'), city: col(r, 'עיר'), terms: col(r, 'תנאי מימוש', 'תנאים'), endDate: toIso(end),
        isPermanent: /קבוע|ללא/.test(end) || col(r, 'קבועה') === 'כן', source: 'import', status: 'draft',
      };
      db().benefits.push(b);
      created++;
    }
    audit(user, 'import', 'benefit', '', `ייבוא מקובץ: ${created} הטבות נוספו כטיוטה, ${newBiz} עסקים חדשים`);
    save();
    return { created, linked, newBusinesses: newBiz, skipped };
  });

  // ----- admin: businesses -----
  const BIZ_STATUS = { active: 'פעיל', negotiation: 'במשא ומתן', paused: 'מוקפא', ended: 'הסתיים' };
  route('GET', '/api/admin/businesses', 'editor', ({ query }) => {
    let list = db().businesses.map(z => ({ ...z, categoryName: catName(z.categoryId), statusLabel: BIZ_STATUS[z.status], benefitStats: businessStats(z.id) }));
    const q = normalizeName(query.q || '');
    if (q) list = list.filter(z => normalizeName(`${z.name} ${z.contactName} ${z.email} ${z.phone} ${z.city}`).includes(q));
    if (query.status) list = list.filter(z => z.status === query.status);
    list.sort((a, b) => a.name.localeCompare(b.name, 'he'));
    return { items: list, statuses: BIZ_STATUS };
  });
  route('GET', '/api/admin/businesses/:id', 'editor', ({ params }) => {
    const z = bizById(params.id);
    if (!z) fail(404, 'העסק לא נמצא');
    const counts = eventCounts();
    const bens = db().benefits.filter(b => b.businessId === z.id).map(b => adminBenefit(b, counts));
    return { business: { ...z, categoryName: catName(z.categoryId), statusLabel: BIZ_STATUS[z.status] }, benefits: bens, statuses: BIZ_STATUS, history: db().auditLog.filter(l => l.entityId === z.id).slice(0, 20) };
  });
  route('POST', '/api/admin/businesses/check', 'editor', ({ body }) => ({ matches: findDuplicateBusinesses(db().businesses, body, body.id || null) }));
  route('POST', '/api/admin/businesses', 'editor', ({ body, user }) => {
    const input = pick(body, BUSINESS_FIELDS);
    if (!input.name || !input.name.trim()) fail(400, 'יש למלא את שם העסק');
    const matches = findDuplicateBusinesses(db().businesses, input).filter(m => m.strong);
    if (matches.length && !body.force) return { duplicate: true, matches };
    const z = { ...businessFromFields({}), ...input, joinedAt: input.joinedAt || todayStr(), createdAt: nowIso(), updatedAt: nowIso() };
    db().businesses.push(z);
    audit(user, 'create', 'business', z.id, `נוסף עסק: ${z.name}`);
    save();
    return { business: z };
  });
  route('PUT', '/api/admin/businesses/:id', 'editor', ({ params, body, user }) => {
    const z = bizById(params.id);
    if (!z) fail(404, 'העסק לא נמצא');
    const input = pick(body, BUSINESS_FIELDS);
    if (input.name !== undefined && !input.name.trim()) fail(400, 'יש למלא את שם העסק');
    Object.assign(z, input, { updatedAt: nowIso() });
    audit(user, 'update', 'business', z.id, `עודכן עסק: ${z.name}`);
    save();
    return { business: z };
  });
  route('POST', '/api/admin/businesses/:id/delete', 'admin', ({ params, body, user }) => {
    const z = bizById(params.id);
    if (!z) fail(404, 'העסק לא נמצא');
    if (body.confirm !== 'מחיקה') fail(400, 'כדי למחוק לצמיתות יש להקליד „מחיקה”');
    if (db().benefits.some(b => b.businessId === z.id)) fail(400, 'לעסק יש הטבות. יש למחוק או להעביר אותן קודם, או לסמן את העסק כ„הסתיים”.');
    db().businesses = db().businesses.filter(x => x.id !== z.id);
    audit(user, 'delete', 'business', z.id, `נמחק עסק לצמיתות: ${z.name}`);
    save();
    return { ok: true };
  });

  // ----- admin: emails / approval queue -----
  route('GET', '/api/admin/emails', 'editor', ({ query }) => {
    let list = db().emails;
    if (query.status) list = list.filter(e => e.status === query.status);
    return {
      items: list.slice(0, 200).map(e => ({ id: e.id, from: e.from, fromName: e.fromName, subject: e.subject, receivedAt: e.receivedAt, status: e.status, confidence: e.extraction.overall, businessName: e.extraction.fields.businessName || '', title: e.extraction.fields.title || '', hasDuplicates: !!(e.duplicates.businesses.length || e.duplicates.benefits.length), engine: e.extraction.engine })),
      counts: { pending_review: db().emails.filter(e => e.status === 'pending_review').length, all: db().emails.length },
    };
  });
  route('GET', '/api/admin/emails/:id', 'editor', ({ params }) => {
    const e = db().emails.find(x => x.id === params.id);
    if (!e) fail(404, 'המייל לא נמצא');
    // Refresh duplicate checks: the database may have changed since the email arrived.
    const dups = duplicatesFor(e.extraction.fields);
    dups.benefits = dups.benefits.filter(d => d.id !== e.benefitId);
    const snd = db().senders.find(s => s.email.toLowerCase() === (e.from || '').toLowerCase()) || null;
    return { email: { ...e, duplicates: dups }, sender: snd, fieldLabels: FIELD_LABELS, aiAvailable: !!(ai && ai.available && ai.available()) };
  });
  route('POST', '/api/admin/emails/:id/approve', 'editor', ({ params, body, user }) => {
    const e = db().emails.find(x => x.id === params.id);
    if (!e) fail(404, 'המייל לא נמצא');
    if (e.status !== 'pending_review') fail(400, 'המייל כבר טופל');
    const f = { ...e.extraction.fields, ...(body.fields || {}) };
    let biz;
    if (body.businessId) { biz = bizById(body.businessId); if (!biz) fail(400, 'העסק שנבחר לא קיים'); }
    else {
      const strong = findDuplicateBusinesses(db().businesses, { name: f.businessName, email: f.email, phone: f.phone, website: f.website }).filter(m => m.strong);
      if (strong.length && !body.createBusiness) fail(409, `נראה שהעסק כבר קיים במאגר (${strong[0].name}). יש לבחור לחבר לעסק הקיים או ליצור עסק חדש.`);
      biz = businessFromFields(f);
      db().businesses.push(biz);
      audit(user, 'create', 'business', biz.id, `נוצר עסק חדש מתוך מייל: ${biz.name}`);
    }
    let b = benById(e.benefitId);
    if (!b) { b = benefitFromFields(f, biz.id, user); b.sourceEmailId = e.id; db().benefits.push(b); }
    Object.assign(b, {
      businessId: biz.id, title: f.title || b.title, shortDescription: f.shortDescription || b.shortDescription, fullDescription: f.description || b.fullDescription,
      categoryId: f.categoryId || b.categoryId, discountType: f.discountType || b.discountType, discountValue: Number(f.discountValue) || 0,
      discountLabel: f.discountLabel || '', couponCode: f.couponCode || '', redeemUrl: f.redeemUrl || f.website || '', whatsapp: f.whatsapp || '',
      phone: f.phone || '', address: f.address || '', city: f.city || '', terms: f.terms || '', endDate: f.endDate || '', startDate: f.startDate || b.startDate,
      redeemMode: f.redeemMode || b.redeemMode, updatedAt: nowIso(), updatedBy: user.id,
    });
    setStatus(b, body.publish ? 'active' : 'draft', user);
    e.status = 'approved'; e.handledBy = user.name; e.handledAt = nowIso();
    if (body.trustSender) upsertSender(e.from, e.fromName || biz.name, { trusted: true, autoPublish: !!body.autoPublish }, user);
    audit(user, body.publish ? 'approve_publish' : 'approve_draft', 'benefit', b.id, `${body.publish ? 'אושרה ופורסמה' : 'אושרה כטיוטה'} הטבה מהמייל: ${b.title}`);
    save();
    return { benefit: adminBenefit(b), business: biz };
  });
  route('POST', '/api/admin/emails/:id/reject', 'editor', ({ params, body, user }) => {
    const e = db().emails.find(x => x.id === params.id);
    if (!e) fail(404, 'המייל לא נמצא');
    const irrelevant = body.reason === 'irrelevant';
    e.status = irrelevant ? 'irrelevant' : 'rejected'; e.handledBy = user.name; e.handledAt = nowIso();
    // The pending benefit was never public, so it is removed together with the rejection.
    const b = benById(e.benefitId);
    if (b && b.status === 'pending') db().benefits = db().benefits.filter(x => x.id !== b.id);
    if (irrelevant) e.body = ''; // keep only what is needed: an irrelevant email's content is not stored
    audit(user, irrelevant ? 'mark_irrelevant' : 'reject', 'email', e.id, `${irrelevant ? 'סומן כלא רלוונטי' : 'נדחה'}: ${e.subject}`);
    save();
    return { ok: true };
  });
  route('POST', '/api/admin/emails/simulate', 'editor', async ({ body, user }) => {
    let raw;
    if (body.sampleKey) {
      const s = SAMPLE_EMAILS.find(x => x.key === body.sampleKey);
      if (!s) fail(400, 'מייל לדוגמה לא נמצא');
      raw = { ...s, receivedAt: nowIso(), to: db().settings.gmail.forwardAddress };
    } else {
      if (!body.body || !body.from) fail(400, 'יש למלא כתובת שולח ותוכן');
      raw = { from: String(body.from), fromName: String(body.fromName || ''), subject: String(body.subject || '(ללא נושא)'), body: String(body.body), labels: [], attachments: [], receivedAt: nowIso() };
    }
    return processEmail(raw, { user, source: 'demo' });
  });
  route('GET', '/api/admin/emails-samples', 'editor', () => ({ items: SAMPLE_EMAILS.map(s => ({ key: s.key, from: s.from, fromName: s.fromName, subject: s.subject, body: s.body, labels: s.labels, attachments: s.attachments })) }));

  // ----- admin: senders (approved sources) -----
  function upsertSender(email, name, patch, user) {
    let s = db().senders.find(x => x.email.toLowerCase() === email.toLowerCase());
    if (!s) { s = { id: uid('snd'), email, name: name || email, trusted: false, autoPublish: false }; db().senders.push(s); }
    Object.assign(s, patch);
    if (!s.trusted) s.autoPublish = false;
    audit(user, 'sender', 'sender', s.id, `עודכן שולח: ${s.email} (${s.trusted ? 'מאושר' : 'רגיל'}${s.autoPublish ? ', פרסום אוטומטי' : ''})`);
    return s;
  }
  route('GET', '/api/admin/senders', 'editor', () => ({ items: db().senders }));
  route('POST', '/api/admin/senders', 'admin', ({ body, user }) => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email || '')) fail(400, 'כתובת מייל לא תקינה');
    const s = upsertSender(body.email.trim(), body.name, { trusted: !!body.trusted, autoPublish: !!body.autoPublish, ...(body.name ? { name: body.name } : {}) }, user);
    save();
    return { sender: s };
  });
  route('POST', '/api/admin/senders/:id/delete', 'admin', ({ params, user }) => {
    db().senders = db().senders.filter(s => s.id !== params.id);
    audit(user, 'delete', 'sender', params.id, 'הוסר שולח מרשימת השולחים');
    save();
    return { ok: true };
  });

  // ----- admin: alerts & reports -----
  route('GET', '/api/admin/alerts', 'editor', ({ query }) => {
    let list = db().alerts;
    if (query.type) list = list.filter(a => a.type === query.type);
    return { items: list.slice(0, 300), unread: db().alerts.filter(a => !a.read).length };
  });
  route('POST', '/api/admin/alerts/read', 'editor', ({ body }) => {
    for (const a of db().alerts) if (!body.ids || body.ids.includes(a.id)) a.read = true;
    save();
    return { ok: true };
  });
  route('GET', '/api/admin/reports', 'editor', () => ({ items: db().reports.map(r => ({ ...r, benefitTitle: benById(r.benefitId)?.title || '(נמחקה)', businessName: bizById(benById(r.benefitId)?.businessId)?.name || '' })) }));
  route('POST', '/api/admin/reports/:id/resolve', 'editor', ({ params, user }) => {
    const r = db().reports.find(x => x.id === params.id);
    if (!r) fail(404, 'הדיווח לא נמצא');
    r.status = 'resolved'; r.resolvedBy = user.name; r.resolvedAt = nowIso();
    audit(user, 'resolve_report', 'report', r.id, `טופל דיווח: ${r.reason}`);
    save();
    return { ok: true };
  });
  route('POST', '/api/admin/jobs/run', 'editor', () => runJobs());

  // ----- admin only: settings, users, audit, backups -----
  route('GET', '/api/admin/settings', 'admin', () => ({ settings: db().settings, categories: db().categories, gmail: gmail && gmail.status ? gmail.status() : { configured: false, connected: false } }));
  route('PUT', '/api/admin/settings', 'admin', ({ body, user }) => {
    const s = db().settings;
    for (const k of ['siteName', 'tagline', 'logo', 'contactEmail']) if (typeof body[k] === 'string') s[k] = body[k];
    if (body.businessGoal) s.businessGoal = Math.max(1, Number(body.businessGoal) || 100);
    if (body.alertPrefs) s.alertPrefs = { ...s.alertPrefs, ...body.alertPrefs };
    if (body.gmail) {
      const g = body.gmail;
      if (typeof g.label === 'string') s.gmail.label = g.label;
      if (Array.isArray(g.keywords)) s.gmail.keywords = g.keywords.map(String).map(x => x.trim()).filter(Boolean);
      if (typeof g.forwardAddress === 'string') s.gmail.forwardAddress = g.forwardAddress;
      if (g.pollMinutes) s.gmail.pollMinutes = Math.max(5, Number(g.pollMinutes) || 15);
    }
    audit(user, 'settings', 'settings', '', 'עודכנו הגדרות המערכת');
    save();
    return { settings: s };
  });
  route('GET', '/api/admin/users', 'admin', () => ({ items: db().users.map(u => ({ ...safeUser(u), disabled: !!u.disabled, lastLoginAt: u.lastLoginAt || null })) }));
  route('POST', '/api/admin/users', 'admin', async ({ body, user }) => {
    const email = String(body.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, 'כתובת מייל לא תקינה');
    if (db().users.some(u => u.email.toLowerCase() === email)) fail(400, 'כבר קיים משתמש עם המייל הזה');
    if (!ROLES[body.role]) fail(400, 'תפקיד לא תקין');
    if (String(body.password || '').length < 8) fail(400, 'הסיסמה צריכה להכיל לפחות 8 תווים');
    const u = { id: uid('user'), email, name: String(body.name || email), role: body.role, passwordHash: await opts.hashPassword(String(body.password)), createdAt: nowIso() };
    db().users.push(u);
    audit(user, 'create', 'user', u.id, `נוסף משתמש: ${u.email} (${ROLE_LABELS[u.role]})`);
    save();
    return { user: safeUser(u) };
  });
  route('PUT', '/api/admin/users/:id', 'admin', async ({ params, body, user }) => {
    const u = db().users.find(x => x.id === params.id);
    if (!u) fail(404, 'המשתמש לא נמצא');
    if (u.id === user.id && body.role && body.role !== 'admin') fail(400, 'אי אפשר להוריד לעצמך את הרשאת המנהלת');
    if (body.role) { if (!ROLES[body.role]) fail(400, 'תפקיד לא תקין'); u.role = body.role; }
    if (typeof body.name === 'string') u.name = body.name;
    if (typeof body.disabled === 'boolean') { if (u.id === user.id) fail(400, 'אי אפשר להשבית את החשבון שלך'); u.disabled = body.disabled; }
    if (body.password) { if (String(body.password).length < 8) fail(400, 'הסיסמה צריכה להכיל לפחות 8 תווים'); u.passwordHash = await opts.hashPassword(String(body.password)); delete u.password; }
    audit(user, 'update', 'user', u.id, `עודכן משתמש: ${u.email} (${ROLE_LABELS[u.role]}${u.disabled ? ', מושבת' : ''})`);
    save();
    return { user: safeUser(u) };
  });
  route('GET', '/api/admin/audit', 'admin', ({ query }) => {
    let list = db().auditLog;
    if (query.entity) list = list.filter(l => l.entity === query.entity);
    return { items: list.slice(0, Number(query.limit) || 300) };
  });
  route('GET', '/api/admin/backup', 'admin', ({ user }) => {
    audit(user, 'backup_download', 'system', '', 'הורד גיבוי מלא של הנתונים');
    const copy = JSON.parse(JSON.stringify(db()));
    copy.users = copy.users.map(({ passwordHash, password, ...u }) => u); // never export password hashes
    return { backup: copy, at: nowIso() };
  });

  // ----- Gmail (host-provided) -----
  route('GET', '/api/admin/gmail/status', 'admin', () => (gmail && gmail.status ? gmail.status() : { configured: false, connected: false }));
  route('POST', '/api/admin/gmail/check', 'editor', async ({ user }) => {
    if (!gmail || !gmail.fetchNew) fail(400, 'Gmail לא מחובר עדיין. אפשר להשתמש במצב ההדגמה.');
    const msgs = await gmail.fetchNew(db().settings, db().senders, db().jobState.seenGmailIds || []);
    const results = [];
    for (const m of msgs) results.push(await processEmail(m, { user, source: 'gmail' }));
    db().settings.gmail.lastCheckedAt = nowIso();
    save();
    return { checked: msgs.length, relevant: results.filter(r => r.relevant).length };
  });

  async function handle({ method, path, query = {}, body = {}, user = null }) {
    for (const r of routes) {
      if (r.method !== method) continue;
      const m = path.match(r.re);
      if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      try {
        if (r.role) requireRole(user, r.role);
        const result = await r.fn({ params, query, body: body || {}, user });
        return { status: 200, body: result };
      } catch (e) {
        if (e instanceof HttpError) return { status: e.status, body: { error: e.message } };
        console.error(e);
        return { status: 500, body: { error: 'אירעה שגיאה. נסו שוב.' } };
      }
    }
    return { status: 404, body: { error: 'הנתיב לא נמצא' } };
  }

  return { handle, runJobs, processEmail, overview, stats };
}
