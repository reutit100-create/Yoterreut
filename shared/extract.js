// Email triage, rule-based benefit extraction (used in demo mode and as a fallback
// when no AI key is configured) and duplicate detection.
import { normalizeName, normalizePhone, domainOf, similarity, todayStr } from './util.js';
import { CITIES } from './seed.js';

const HEB = '֐-׿';

export const FIELD_LABELS = {
  businessName: 'שם העסק', contactName: 'איש/אשת קשר', email: 'מייל', phone: 'טלפון',
  title: 'כותרת ההטבה', description: 'תיאור ההטבה', discountType: 'סוג ההטבה', discountValue: 'שיעור/סכום ההנחה',
  discountLabel: 'ניסוח ההנחה', couponCode: 'קוד קופון', terms: 'תנאי מימוש', startDate: 'תאריך התחלה',
  endDate: 'תוקף', address: 'כתובת', city: 'עיר', website: 'אתר', whatsapp: 'וואטסאפ', social: 'רשת חברתית',
  logoAttachment: 'לוגו/תמונה מצורפת', categoryId: 'קטגוריה', redeemMode: 'אופן מימוש',
};

// Fields the admin needs before a benefit can be published.
export const REQUIRED_FIELDS = ['businessName', 'title', 'discountValue', 'categoryId'];
const IMPORTANT_FIELDS = ['businessName', 'title', 'description', 'discountValue', 'couponCode', 'endDate', 'phone', 'website', 'categoryId', 'terms'];

const CATEGORY_WORDS = {
  food: ['קפה', 'מסעדה', 'מאפ', 'אוכל', 'ארוחה', 'חומוס', 'פיצה', 'מרק', 'קינוח', 'משלוח אוכל', 'ירקות'],
  health: ['כושר', 'אימון', 'יוגה', 'פילאטיס', 'מנוי', 'פיזיו', 'טיפול זוגי', 'בריאות', 'אופטיקה', 'אופניים', 'ספורט'],
  fashion: ['בגד', 'אופנה', 'נעל', 'כפכפ', 'שעון', 'תכשיט', 'משקפי', 'קולקציה', 'לבית', 'עיצוב הבית'],
  kids: ['ילד', 'צעצוע', 'משפחה', 'חוג', 'הורים', 'תינוק', 'משחקי חשיבה'],
  beauty: ['מספרה', 'תספורת', 'קוסמטיקה', 'טיפוח', 'ציפורניים', 'איפור', 'טיפול פנים'],
  leisure: ['הצגה', 'תיאטרון', 'מופע', 'סדנה', 'ספר', 'אטרקציה', 'חדר בריחה', 'באולינג', 'ספארי', 'כרטיס'],
  services: ['ייעוץ', 'עורך דין', 'רו״ח', 'רואה חשבון', 'תיקון', 'שירות', 'תוכנה', 'עיצוב גרפי'],
  online: ['אונליין', 'בזום', 'זום', 'באתר', 'קורס', 'דיגיטלי', 'אפליקציה'],
};

export function guessCategory(text) {
  let best = null, bestScore = 0;
  for (const [cat, words] of Object.entries(CATEGORY_WORDS)) {
    const score = words.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);
    if (score > bestScore) { best = cat; bestScore = score; }
  }
  return { value: best, confidence: bestScore >= 2 ? 0.8 : bestScore === 1 ? 0.55 : 0 };
}

// Decide whether an email looks like a benefit offer, and why.
export function triageEmail(email, settings, senders = []) {
  const g = settings.gmail || {};
  const text = `${email.subject}\n${email.body}`;
  const reasons = [];
  let score = 0;
  const sender = senders.find(s => s.email.toLowerCase() === (email.from || '').toLowerCase());
  if (sender) { reasons.push(`שולח/ת מוכר/ת: ${sender.name}`); score += sender.trusted ? 3 : 2; }
  if ((email.labels || []).includes(g.label)) { reasons.push(`תווית „${g.label}”`); score += 3; }
  if (email.to && g.forwardAddress && email.to.toLowerCase().includes(g.forwardAddress.toLowerCase())) { reasons.push('הועבר לכתובת ההטבות'); score += 3; }
  const hits = (g.keywords || []).filter(k => text.includes(k));
  if (hits.length) { reasons.push(`מילות מפתח: ${hits.join(', ')}`); score += Math.min(hits.length, 3); }
  if (/\d{1,2}\s?%/.test(text)) { reasons.push('אחוז הנחה בטקסט'); score += 1; }
  if (/להסרה מרשימת התפוצה|unsubscribe|ניוזלטר/i.test(text)) { reasons.push('נראה כמו ניוזלטר'); score -= 3; }
  return { relevant: score >= 2, score, reasons, sender: sender || null };
}

function firstMatch(text, re, group = 1) {
  const m = text.match(re);
  return m ? m[group].trim() : '';
}

function parseHebDate(d, m, y) {
  const now = new Date();
  let year = y ? Number(y) : now.getFullYear();
  if (year < 100) year += 2000;
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  let s = `${year}-${mm}-${dd}`;
  // A date without a year that has already passed refers to next year.
  if (!y && s < todayStr()) s = `${year + 1}-${mm}-${dd}`;
  return s;
}

// Rule-based extraction. Returns { fields, confidence, missing, uncertain, overall }.
export function extractBenefitRuleBased(email, { categories = [] } = {}) {
  const body = email.body || '';
  const text = `${email.subject || ''}\n${body}`;
  const lines = body.split(/\n/).map(l => l.trim()).filter(Boolean);
  const f = {}, c = {};
  const set = (k, v, conf) => { if (v !== '' && v !== null && v !== undefined) { f[k] = v; c[k] = conf; } };

  // Business name: signature, sender display name, or "של X".
  const fromName = (email.fromName || '').replace(/\(דוגמה\)/g, '').trim();
  // "מיכל – קפה נווה" (person first) vs "לשונות – לימוד שפות" (business first).
  const parts = fromName.split(/\s[–-]\s/);
  const personFirst = parts.length > 1 && !parts[0].includes(' ') && new RegExp(`(^|\\n)${parts[0]}\\s`).test(body);
  let bizFromSender = parts.length > 1 ? (personFirst ? parts[1] : parts[0]) : fromName;
  const sigIdx = lines.findIndex(l => /^(בברכה|תודה|בתודה|נשמח לשתף פעולה)/.test(l));
  const signature = sigIdx >= 0 ? lines.slice(sigIdx + 1) : [];
  const sigBiz = signature.find(l => l.includes(',') ) ? signature.find(l => l.includes(',')).split(',').slice(-1)[0].trim() : (signature.length > 1 ? signature[signature.length - 1] : '');
  const bizName = sigBiz && !/^\d/.test(sigBiz) ? sigBiz : bizFromSender;
  set('businessName', bizName, sigBiz && bizFromSender && similarity(sigBiz, bizFromSender) > 0.5 ? 0.9 : bizName ? 0.65 : 0);

  const contact = firstMatch(body, new RegExp(`שמי\\s+([${HEB}]+\\s+[${HEB}]+)`))
    || (signature[0] && !signature[0].includes('צוות') ? signature[0].split(',')[0].trim() : '');
  set('contactName', contact, /שמי/.test(body) ? 0.9 : 0.6);

  const fromEmail = (email.from || '').match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  set('email', fromEmail ? fromEmail[0] : firstMatch(body, /([\w.+-]+@[\w-]+\.[\w.]+)/), 0.9);

  const phoneRe = /(0\d{1,2}[-\s]?\d{3}[-\s]?\d{4}|0\d{1,2}-\d{7})/;
  const waLine = lines.find(l => /וואטסאפ|ווטסאפ|whatsapp/i.test(l));
  if (waLine) set('whatsapp', firstMatch(waLine, phoneRe), 0.9);
  const phoneLine = lines.find(l => /טלפון|טל[׳']|להזמנות|נייד/.test(l) && phoneRe.test(l)) || lines.find(l => phoneRe.test(l) && l !== waLine);
  if (phoneLine) set('phone', firstMatch(phoneLine, phoneRe), /טלפון|טל/.test(phoneLine) ? 0.9 : 0.7);

  const urls = [...text.matchAll(/https?:\/\/[^\s)]+/g)].map(m => m[0].replace(/[.,]$/, ''));
  const social = urls.find(u => /facebook|instagram|tiktok/.test(u));
  const site = urls.find(u => u !== social);
  if (site) set('website', site, 0.9);
  if (social) set('social', social, 0.9);

  // Discount: percent, fixed price ("X ₪ במקום Y ₪") or a gift.
  const pct = text.match(/(\d{1,2})\s?%\s*הנחה|הנחה\s+של\s+(\d{1,2})\s?%|(\d{1,2})%/);
  const price = text.match(/(\d+)\s*₪\s*במקום\s*(\d+)\s*₪/) || text.match(/ב-?־?(\d+)\s*₪\s*במקום\s*(\d+)/);
  if (pct) {
    const v = Number(pct[1] || pct[2] || pct[3]);
    set('discountType', 'percent', 0.9); set('discountValue', v, pct[1] || pct[2] ? 0.95 : 0.7);
  } else if (price) {
    set('discountType', 'amount', 0.85); set('discountValue', Number(price[2]) - Number(price[1]), 0.8);
    set('discountLabel', `${price[1]} ₪ במקום ${price[2]} ₪`, 0.85);
  } else if (/מתנה|חינם/.test(text)) {
    set('discountType', 'gift', 0.6);
  }

  const offerLine = lines.find(l => /%|₪|חינם|מתנה/.test(l) && !/^(תנאים|קוד)/.test(l) && l.length < 140);
  if (offerLine) {
    const t = offerLine.replace(/[.:!]+$/, '').replace(/^לחברות( הקהילה)?:\s*/, '');
    set('title', t.length > 60 ? t.slice(0, 57).replace(/\s\S*$/, '') + '…' : t, 0.7);
  } else if (email.subject) {
    set('title', email.subject.replace(/^(Fwd|Fw|RE):\s*/i, ''), 0.4);
  }

  const descStart = lines.findIndex(l => /הטבה|הנחה|מציע|לחברות/.test(l));
  if (descStart >= 0) set('description', lines.slice(descStart, descStart + 3).filter(l => !/^(קוד|כתובת|טלפון|אתר|וואטסאפ|להרשמה|נשמח|להזמנות)/.test(l)).join(' '), 0.6);

  const coupon = [...text.matchAll(/(?:קוד\s*(?:קופון|הנחה)?|קופון)\s*[:：]?\s*["„“]?([A-Za-z0-9א-ת]{3,20})/g)]
    .map(m => m[1]).find(v => !/^(של|את|הנחה|קופון|המימוש|לא|הקופון)$/.test(v) && !/^ל[א-ת]/.test(v));
  if (coupon) set('couponCode', coupon, /[A-Z0-9]{4,}/.test(coupon) ? 0.95 : 0.6);

  const until = text.match(/(?:בתוקף\s+)?(?:עד|ועד)\s+(?:ה-?)?(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
  if (until) set('endDate', parseHebDate(until[1], until[2], until[3]), until[3] ? 0.9 : 0.6);
  const from = text.match(/(?:מ-?|החל מ-?)\s?(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\s+ועד/);
  if (from) set('startDate', parseHebDate(from[1], from[2], from[3]), 0.7);

  const termsLines = lines.filter(l => /^תנאים|לא כפל|למצטרפות|בהצגת|בתיאום|מינימום|בהזמנה יש|לא כולל/.test(l));
  if (termsLines.length) set('terms', termsLines.join(' ').replace(/^תנאים:\s*/, ''), 0.8);

  const addrLine = lines.find(l => /^כתובת|^הכתובת|רחוב\s/.test(l));
  if (addrLine) {
    const addr = addrLine.replace(/^(הכתובת שלנו( כמו תמיד)?|כתובת)\s*:?\s*/, '');
    set('address', addr.split(',')[0].trim(), 0.8);
  }
  const city = CITIES.find(ci => text.includes(ci)) || (text.includes('תל אביב') ? 'תל אביב-יפו' : '');
  if (city) set('city', city, 0.85);

  const online = /אונליין|בזום|באתר|להרשמה:|קוד/.test(text) && !addrLine;
  set('redeemMode', online ? 'online' : addrLine ? 'in_store' : 'both', 0.6);

  const img = (email.attachments || []).find(a => /^image\//.test(a.type));
  if (img) set('logoAttachment', img.name, 0.7);

  const cat = guessCategory(text);
  if (cat.value && (!categories.length || categories.some(x => x.id === cat.value))) set('categoryId', cat.value, cat.confidence);

  return finalizeExtraction(f, c);
}

export function finalizeExtraction(fields, confidence) {
  const missing = IMPORTANT_FIELDS.filter(k => fields[k] === undefined || fields[k] === '' || fields[k] === null || (k === 'discountValue' && !fields[k] && fields.discountType !== 'gift'));
  const uncertain = Object.keys(fields).filter(k => (confidence[k] ?? 1) < 0.7);
  const weights = { businessName: 3, title: 2, discountValue: 3, couponCode: 1, endDate: 1, categoryId: 2, phone: 1, website: 1, description: 1, terms: 1 };
  let tot = 0, got = 0;
  for (const [k, w] of Object.entries(weights)) { tot += w; got += w * (confidence[k] || 0); }
  return { fields, confidence, missing, uncertain, overall: Math.round((got / tot) * 100) };
}

// Find businesses that might be the same as the candidate.
export function findDuplicateBusinesses(businesses, cand, excludeId = null) {
  const out = [];
  const cName = normalizeName(cand.name || cand.businessName || '');
  const cPhone = normalizePhone(cand.phone || '');
  const cWa = normalizePhone(cand.whatsapp || '');
  const cEmail = (cand.email || '').toLowerCase();
  const cDomain = domainOf(cand.website || '');
  const cEmailDomain = cEmail.split('@')[1] || '';
  const freeMail = /gmail|walla|yahoo|hotmail|outlook|012\.net|bezeqint/;
  for (const b of businesses) {
    if (b.id === excludeId) continue;
    const reasons = [];
    const bName = normalizeName(b.name);
    if (cName && bName && cName === bName) reasons.push('שם זהה');
    else {
      const sim = similarity(cName, bName);
      if (sim >= 0.6) reasons.push(`שם דומה (${Math.round(sim * 100)}%)`);
      else if (cName && bName && cName.length > 3 && (bName.includes(cName) || cName.includes(bName))) reasons.push('שם מכיל את השם הקיים');
    }
    if (cEmail && b.email && cEmail === b.email.toLowerCase()) reasons.push('מייל זהה');
    else if (cEmailDomain && !freeMail.test(cEmailDomain) && (domainOf(b.website) === cEmailDomain || (b.email || '').toLowerCase().endsWith('@' + cEmailDomain))) reasons.push('אותו דומיין מייל');
    const bPhone = normalizePhone(b.phone || '');
    if (bPhone && (bPhone === cPhone || bPhone === cWa)) reasons.push('טלפון זהה');
    if (cDomain && b.website && domainOf(b.website) === cDomain) reasons.push('אתר זהה');
    if (reasons.length) out.push({ id: b.id, name: b.name, reasons, strong: reasons.some(r => /זהה/.test(r)) });
  }
  return out.sort((a, b) => Number(b.strong) - Number(a.strong) || b.reasons.length - a.reasons.length);
}

export function findSimilarBenefits(benefits, cand, businessIds = [], excludeId = null) {
  const out = [];
  for (const b of benefits) {
    if (b.id === excludeId || b.status === 'archived') continue;
    const sameBiz = businessIds.includes(b.businessId);
    const sim = similarity(b.title, cand.title || '');
    const sameCoupon = cand.couponCode && b.couponCode && cand.couponCode.toLowerCase() === b.couponCode.toLowerCase();
    if ((sameBiz && (sim > 0.35 || sameCoupon || Number(b.discountValue) === Number(cand.discountValue))) || sim > 0.75 || sameCoupon) {
      out.push({ id: b.id, title: b.title, status: b.status, reasons: [sameBiz && 'אותו עסק', sim > 0.35 && `כותרת דומה (${Math.round(sim * 100)}%)`, sameCoupon && 'אותו קוד קופון'].filter(Boolean) });
    }
  }
  return out;
}

// Offline "rewrite as short marketing copy". The server uses Claude when an API key is set.
export function rewriteMarketingRuleBased(b, businessName = '') {
  const offer = b.discountLabel || (b.discountType === 'percent' && b.discountValue ? `${b.discountValue}% הנחה` : b.discountType === 'amount' && b.discountValue ? `${b.discountValue} ₪ הנחה` : 'הטבה מיוחדת');
  const what = (b.title || '').replace(/^\d{1,2}\s?%\s*הנחה\s*/, '').replace(/^על\s*/, '');
  const title = what ? `${offer} ${what.startsWith('על') ? what : 'על ' + what}`.slice(0, 60) : `${offer} ב${businessName}`;
  const short = `${offer} לחברות יותר רעות${businessName ? ` ב${businessName}` : ''}${b.couponCode ? ` עם הקוד ${b.couponCode}` : ''}.`;
  return { title: title.replace(/\s+/g, ' ').trim(), shortDescription: short };
}
