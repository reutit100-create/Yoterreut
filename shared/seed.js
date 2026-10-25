// Initial data: the 24 real benefits that רעות collected, plus sample users,
// sample statistics and sample emails for demo mode.
// Benefits whose details are incomplete are kept out of the public site
// (status "pending") and carry a needsCompletion note for the admin.
import { addDays, todayStr, nowIso } from './util.js';

export const CATEGORIES = [
  { id: 'food', name: 'אוכל ובתי קפה', icon: 'coffee', subcategories: ['בתי קפה', 'מסעדות', 'מאפיות', 'משלוחים'] },
  { id: 'health', name: 'בריאות וכושר', icon: 'heart', subcategories: ['אימון וכושר', 'טיפול ורווחה', 'טבע ובריאות', 'אופניים'] },
  { id: 'fashion', name: 'אופנה ולייף סטייל', icon: 'shirt', subcategories: ['ביגוד', 'הנעלה', 'שעונים ואקססוריז', 'משקפיים', 'לבית'] },
  { id: 'kids', name: 'ילדים ומשפחה', icon: 'family', subcategories: ['צעצועים', 'משחקי חשיבה', 'חוגים'] },
  { id: 'beauty', name: 'טיפוח', icon: 'sparkle', subcategories: ['מספרות', 'קוסמטיקה', 'מוצרי טיפוח'] },
  { id: 'leisure', name: 'פנאי ותרבות', icon: 'ticket', subcategories: ['אטרקציות', 'חדרי בריחה', 'ספרים', 'סדנאות ויצירה'] },
  { id: 'services', name: 'שירותים מקצועיים', icon: 'briefcase', subcategories: ['עיצוב ויצירה', 'תוכנה ומחשבים', 'הכשרה ולימודים'] },
  { id: 'online', name: 'אונליין', icon: 'globe', subcategories: ['חנויות אונליין', 'קורסים'] },
];

export const CITIES = ['ירושלים', 'תל אביב-יפו', 'חיפה', 'באר שבע', 'רמת גן', 'ראשון לציון', 'פתח תקווה', 'מודיעין', 'כפר סבא', 'נתניה'];

// Deterministic pseudo-random numbers so the sample statistics look the same every time.
function rng(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// [id, business name, category, benefit fields, business fields]
const REAL = [
  ['safari', 'הספארי ברמת גן', 'leisure', { title: 'כרטיס כניסה לספארי ב־92 ₪', shortDescription: 'כרטיס כניסה לספארי ברמת גן במחיר מוזל לחברות רעות.', discountType: 'amount', discountValue: 92, discountLabel: 'כרטיס ב־92 ₪', subcategory: 'אטרקציות', city: 'רמת גן', redeemMode: 'in_store', terms: 'בהצגת תעודת שיוך לעמותת רעות בקופות.', needsCompletion: 'לאמת את המחיר המקורי: תועד פעם כ־129 ₪ ופעם כ־139 ₪.' }, { city: 'רמת גן' }],
  ['clever', 'Clever / תלתן ספרים', 'leisure', { title: '25% הנחה קבועה על ספרים', shortDescription: 'הנחה קבועה, כולל כפל מבצעים.', discountValue: 25, couponCode: 'REUT25', subcategory: 'ספרים', redeemMode: 'online', terms: 'ההנחה חלה גם על מוצרים במבצע (כולל כפל מבצעים).', isPermanent: true }],
  ['timeout', 'Timeout Escape', 'leisure', { title: '20% הנחה על חדרי בריחה', shortDescription: 'חדרי בריחה בהנחה לחברות יותר רעות.', discountValue: 20, subcategory: 'חדרי בריחה', phone: '053-5253866', redeemMode: 'in_store', terms: 'בעת ההזמנה יש לציין „יותר רעות” ולהציג כרטיס או תעודת חברות ותעודת זהות.' }, { phone: '053-5253866' }],
  ['barefoots', 'BareFoots ישראל', 'fashion', { title: '20% הנחה על כל האתר', shortDescription: 'הנחה על כל מוצרי האתר בקוד קופון.', discountValue: 20, couponCode: 'Reut20', subcategory: 'הנעלה', redeemMode: 'online' }],
  ['shade', 'Shade', 'fashion', { title: '15% הנחה באתר', shortDescription: 'הנחה בקניה באתר בקוד קופון.', discountValue: 15, couponCode: 'REUT15', subcategory: 'שעונים ואקססוריז', redeemMode: 'online' }],
  ['mofet', 'מכון מופ״ת', 'services', { title: 'הטבה במכון מופ״ת', shortDescription: 'קוד קופון אושר, פרטי ההטבה בהשלמה.', discountType: 'percent', discountValue: 0, subcategory: 'הכשרה ולימודים', redeemMode: 'online', needsCompletion: 'קוד הקופון אושר, אך שיעור ההנחה ופרטי המימוש לא נשמרו.' }],
  ['hakol', 'הכל לבית', 'fashion', { title: '12% הנחה בחנות', shortDescription: 'הנחה על מוצרים לבית בהצגת אישור זכאות.', discountValue: 12, subcategory: 'לבית', redeemMode: 'in_store', terms: 'בהצגת אישור זכאות בקופה.', needsCompletion: 'חסרים כתובת החנות, עיר ותוקף ההטבה.' }],
  ['ysport', 'Y-Sport – יוגב מרכנתי', 'health', { title: '20% הנחה על שירותי אימון', shortDescription: 'אימונים אישיים וקבוצתיים בהנחה.', discountValue: 20, subcategory: 'אימון וכושר', redeemMode: 'in_store' }, { contactName: 'יוגב מרכנתי' }],
  ['joya', 'Joya Create', 'services', { title: '10% הנחה על פרויקטים', shortDescription: 'הנחה על פרויקטי עיצוב ויצירה.', discountValue: 10, subcategory: 'עיצוב ויצירה', phone: '052-2971687', redeemMode: 'both', terms: 'כל פרויקט נבחן לגופו.' }, { phone: '052-2971687' }],
  ['mybike', 'My Bike Store', 'health', { title: '10% הנחה על כל החנות', shortDescription: 'כולל אופניים, אביזרים וציוד.', discountValue: 10, subcategory: 'אופניים', redeemMode: 'both', terms: 'ההנחה חלה על כל החנות, כולל אופניים.' }],
  ['olami', 'חלום עולמי', 'leisure', { title: 'עד 25% הנחה על אטרקציות', shortDescription: 'אטרקציות ובילויים בהנחה.', discountValue: 25, discountLabel: 'עד 25%', subcategory: 'אטרקציות', redeemMode: 'online', terms: 'גובה ההנחה תלוי במחיר הקופון ובמחירון האתר.' }],
  ['social100', '100% עסק חברתי', 'online', { title: '15% הנחה על כל מוצרי האתר', shortDescription: 'קנייה שעושה טוב בעסק חברתי.', discountValue: 15, subcategory: 'חנויות אונליין', redeemMode: 'online', terms: 'יש לציין בהזמנה „דרך רעות”. החיוב מתבצע ביום האספקה, לאחר ההנחה.' }],
  ['cdsoft', 'CDSoft', 'services', { title: 'הטבה ב־CDSoft', shortDescription: 'פרטי ההטבה בהשלמה.', discountValue: 0, subcategory: 'תוכנה ומחשבים', redeemMode: 'online', needsCompletion: 'מופיעה כהטבה פעילה, אך שיעור ההנחה ואופן המימוש חסרים.' }],
  ['rain', 'מכון ריין', 'health', { title: 'טיפול זוגי או משפחתי ב־220 ₪', shortDescription: 'במקום 350 ₪, בקליניקות בפריסה ארצית.', discountType: 'amount', discountValue: 130, discountLabel: '220 ₪ במקום 350 ₪', subcategory: 'טיפול ורווחה', address: 'קליניקות בפריסה ארצית', redeemMode: 'in_store', isPermanent: false }],
  ['dw', 'Daniel Wellington', 'fashion', { title: '15% הנחה באתר', shortDescription: 'שעונים ותכשיטים בהנחה.', discountValue: 15, subcategory: 'שעונים ואקססוריז', redeemMode: 'online', terms: 'ללא כפל מבצעים.' }],
  ['golbary', 'Golbary', 'fashion', { title: '15% הנחה באתר ובחנויות', shortDescription: 'אופנה בהנחה באתר ובחנויות הרשת.', discountValue: 15, subcategory: 'ביגוד', redeemMode: 'both' }],
  ['pardes', 'סטודיו פרדס רימונים / פרדס יפו', 'leisure', { title: '18% הנחה בסטודיו', shortDescription: 'פרטי המימוש בהשלמה.', discountValue: 18, subcategory: 'סדנאות ויצירה', redeemMode: 'in_store', needsCompletion: 'פרטי המימוש חסרים (איך מממשים, כתובת ותוקף).' }],
  ['toydream', 'חלום של צעצוע', 'kids', { title: '5% הנחה על צעצועים', shortDescription: 'הנחה על צעצועים ומשחקים.', discountValue: 5, subcategory: 'צעצועים', redeemMode: 'in_store', needsCompletion: 'חסרים אופן המימוש, כתובת או אתר ותוקף.' }],
  ['bowling', 'באולינג ראשון לציון', 'leisure', { title: '4 ₪ הנחה למשחק באולינג', shortDescription: 'כ־20% הנחה בהצגת תו נכה.', discountType: 'amount', discountValue: 4, discountLabel: '4 ₪ הנחה למשחק (כ־20%)', subcategory: 'אטרקציות', city: 'ראשון לציון', redeemMode: 'in_store', terms: 'בהצגת תו נכה ועל בסיס מקום פנוי.' }, { city: 'ראשון לציון', notes: 'הטבה כללית לבעלי תו נכה, לא בהכרח בלעדית ל„יותר רעות”.' }],
  ['bubima', 'בובימה – צעצועי עץ', 'kids', { title: '12% הנחה על כל רכישה', shortDescription: 'צעצועי עץ, באתר או בחנות.', discountValue: 12, subcategory: 'צעצועים', redeemMode: 'both' }],
  ['gaia', 'גאיה משחקי חשיבה', 'kids', { title: '15% הנחה באתר', shortDescription: 'משחקי חשיבה לכל המשפחה.', discountValue: 15, couponCode: 'רעות', subcategory: 'משחקי חשיבה', redeemMode: 'online', terms: 'ללא כפל מבצעים, לא חל על מוצרים שכבר נמצאים במבצע.' }],
  ['teva', 'טבע בשבילך', 'health', { title: '25% הנחה על מוצרי האתר', shortDescription: 'מוצרי טבע ובריאות בהנחה.', discountValue: 25, couponCode: 'reut25', subcategory: 'טבע ובריאות', redeemMode: 'online', terms: 'דמי המשלוח אינם כלולים בהנחה.' }],
  ['bumpers', 'Bumpers – כפכפי באמפרס', 'fashion', { title: '50% הנחה על כפכפים', shortDescription: 'חצי מחיר בקוד קופון.', discountValue: 50, couponCode: 'Reut50', subcategory: 'הנעלה', redeemMode: 'online', terms: 'ללא כפל מבצעים.' }],
  ['arena', 'ARENA Eyewear', 'fashion', { title: '40% הנחה על כל האתר', shortDescription: 'משקפי שמש וראייה בהנחה.', discountValue: 40, subcategory: 'משקפיים', redeemMode: 'online', needsCompletion: 'קוד המימוש לא נשמר.' }],
];

export function buildSeed() {
  const today = todayStr();
  const ts = nowIso();
  const rand = rng(42);
  // The existing benefits predate the platform, so they are not shown as "new".
  const listedAt = addDays(today, -30) + 'T09:00:00.000Z';

  const businesses = REAL.map(([key, name, categoryId, ben, biz = {}]) => ({
    id: `biz_${key}`, name, logo: '', categoryId, contactName: '', phone: '', email: '', website: '',
    facebook: '', instagram: '', address: '', city: '', status: 'active', joinedAt: addDays(today, -30),
    notes: '', createdAt: listedAt, updatedAt: listedAt, ...biz,
  }));

  const benefits = REAL.map(([key, , categoryId, ben], i) => ({
    id: `ben_${key}`, businessId: `biz_${key}`, title: '', shortDescription: '', fullDescription: '',
    categoryId, subcategory: '', discountType: 'percent', discountValue: 0, discountLabel: '', couponCode: '',
    redeemUrl: '', whatsapp: '', phone: '', address: '', city: '', redeemMode: 'online', openingHours: '',
    terms: '', startDate: addDays(today, -30), endDate: '', isPermanent: false, image: '',
    featured: false, exclusive: false, sortOrder: i + 1, needsCompletion: '',
    source: 'import', sourceEmailId: null, createdBy: 'user_admin', updatedBy: 'user_admin',
    createdAt: listedAt, updatedAt: listedAt, publishedAt: listedAt,
    ...ben,
    status: ben.needsCompletion ? 'pending' : 'active',
  }));
  for (const b of benefits) {
    if (!b.fullDescription) b.fullDescription = [b.shortDescription, b.terms].filter(Boolean).join(' ');
    if (b.status !== 'active') b.publishedAt = null;
  }

  // Sample engagement events (last 30 days) so the statistics screens have something to show.
  // They are marked as sample data and can be cleared from the admin settings.
  const events = [];
  const active = benefits.filter(b => b.status === 'active');
  active.forEach((b, idx) => {
    const w = Math.max(0, 9 - Math.floor(idx / 2.5) + Math.floor(rand() * 3));
    const views = Math.round(w * 18 + rand() * 15 * (w ? 1 : 0));
    for (let i = 0; i < views; i++) {
      const day = addDays(today, -Math.floor(rand() * 30));
      events.push({ id: `ev_${events.length}`, type: 'view', benefitId: b.id, at: day + 'T10:00:00.000Z', sample: true });
      const r = rand();
      if (r < 0.22) events.push({ id: `ev_${events.length}`, type: 'redeem_click', benefitId: b.id, at: day + 'T10:05:00.000Z', sample: true });
      if (b.couponCode && r < 0.15) events.push({ id: `ev_${events.length}`, type: 'coupon_copy', benefitId: b.id, at: day + 'T10:04:00.000Z', sample: true });
      if (r > 0.96) events.push({ id: `ev_${events.length}`, type: 'share', benefitId: b.id, at: day + 'T10:06:00.000Z', sample: true });
    }
  });

  const searches = [];
  const terms = [['ספרים', 21], ['צעצועים', 16], ['כושר', 14], ['משקפיים', 9], ['באולינג', 8], ['חדר בריחה', 11], ['שעון', 5],
    ['קפה', 19, 0], ['מספרה', 12, 0], ['רופא שיניים', 14, 0], ['וטרינר', 7, 0], ['קייטנה', 10, 0]];
  for (const [q, n, results] of terms) {
    for (let i = 0; i < n; i++) searches.push({ id: `s_${searches.length}`, q, results: results === 0 ? 0 : 2, at: addDays(today, -Math.floor(rand() * 30)) + 'T09:00:00.000Z', sample: true });
  }

  // Demo accounts. Change these passwords (or remove the accounts) before going live.
  const users = [
    { id: 'user_admin', email: 'admin@yoter-reut.org.il', name: 'רעות (מנהלת)', role: 'admin', password: 'Reut2026!' },
    { id: 'user_editor', email: 'editor@yoter-reut.org.il', name: 'עורכת תוכן', role: 'editor', password: 'Edit2026!' },
    { id: 'user_member', email: 'member@yoter-reut.org.il', name: 'חברת קהילה', role: 'member', password: 'Member2026!' },
  ];

  return {
    meta: { version: 1, createdAt: ts, seededAt: today, hasSampleStats: true },
    settings: {
      siteName: 'יותר רעות',
      tagline: 'יותר קהילה, יותר הטבות',
      logo: '',
      businessGoal: 100,
      contactEmail: 'hatavot@yoter-reut.org.il',
      alertPrefs: {
        newEmailBenefit: { enabled: true, channels: ['app', 'email'] },
        expiry: { enabled: true, channels: ['app', 'email'], days: [14, 7, 2] },
        expired: { enabled: true, channels: ['app'] },
        dataQuality: { enabled: true, channels: ['app'] },
        reports: { enabled: true, channels: ['app', 'email'] },
        weeklySummary: { enabled: true, channels: ['app', 'email'] },
      },
      gmail: {
        mode: 'demo', // stays 'demo' until the admin connects a Gmail account with OAuth
        connectedEmail: '',
        label: 'הטבות יותר רעות',
        processedLabel: 'יותר רעות/טופל',
        keywords: ['הטבה', 'הנחה', 'קופון', 'שיתוף פעולה', 'מבצע', 'אחוז הנחה', 'קוד קופון'],
        forwardAddress: 'hatavot@yoter-reut.org.il',
        pollMinutes: 15,
        lastCheckedAt: null,
      },
      whatsapp: { apiEnabled: false },
    },
    categories: CATEGORIES.map((c, i) => ({ ...c, order: i + 1 })),
    users, businesses, benefits, events, searches,
    senders: [],
    reports: [],
    favorites: [],
    emails: [],
    alerts: [],
    auditLog: [
      { id: 'log_seed', at: ts, userId: 'system', userName: 'מערכת', action: 'import', entity: 'system', entityId: '', summary: `נטענו ${benefits.length} ההטבות הקיימות של יותר רעות` },
    ],
    jobState: { sent: {}, weeklySummaryWeek: '' },
  };
}

// Sample emails for demo mode: what would arrive in the inbox before Gmail is connected.
export const SAMPLE_EMAILS = [
  {
    key: 'gym',
    from: 'office@energym.co.il',
    fromName: 'אנרג׳ים מועדון כושר (דוגמה)',
    subject: 'הצעה לשיתוף פעולה – הטבה לחברות יותר רעות',
    labels: ['הטבות יותר רעות'],
    body: `שלום רב,

שמי רוני אלמוג, מנהלת השיווק של אנרג׳ים מועדון כושר בפתח תקווה.
נשמח להציע לחברות הקהילה של יותר רעות הטבה בלעדית:
25% הנחה על מנוי שנתי + חודש ראשון חינם.

קוד קופון: ENERGY25
ההטבה בתוקף עד 31/12/2026.
כתובת: רחוב ההסתדרות 45, פתח תקווה
טלפון: 03-9123456
אתר: https://www.energym.co.il
וואטסאפ: 050-1234567

תנאים: למצטרפות חדשות בלבד, בהצגת כרטיס חברה. לא כפל מבצעים.

בברכה,
רוני אלמוג
אנרג׳ים מועדון כושר`,
    attachments: [{ name: 'energym-logo.png', type: 'image/png' }],
  },
  {
    key: 'dup',
    from: 'booking@timeout-escape.co.il',
    fromName: 'Timeout Escape',
    subject: 'עדכון הטבה לחברות רעות – חדר חדש!',
    labels: [],
    body: `היי,

פתחנו חדר בריחה חדש ורצינו לעדכן שההטבה לחברות רעות חלה גם עליו:
20% הנחה על כל החדרים, כולל החדר החדש "המעבדה".
ההטבה בתוקף עד 30/6/2027.

בהזמנה יש לציין "יותר רעות" ולהציג תעודה ותעודת זהות.
להזמנות: 053-5253866

תודה,
צוות Timeout Escape`,
    attachments: [],
  },
  {
    key: 'online',
    from: 'hello@leshonot.co.il',
    fromName: 'לשונות – לימוד שפות (דוגמה)',
    subject: 'Fwd: קופון הנחה לקורסי אנגלית',
    labels: [],
    body: `---------- Forwarded message ---------
מאת: צוות לשונות <hello@leshonot.co.il>

שלום,
אנחנו פלטפורמה ללימוד אנגלית מדוברת בזום בקבוצות קטנות.
לחברות הקהילה: 30% הנחה על החודש הראשון עם הקוד LEARN30.
להרשמה: https://leshonot.co.il/reut

נשמח לשתף פעולה,
אביטל שחר
054-8877665`,
    attachments: [{ name: 'leshonot-brochure.pdf', type: 'application/pdf' }],
  },
  {
    key: 'newsletter',
    from: 'news@mega-deals.com',
    fromName: 'Mega Deals',
    subject: 'הניוזלטר השבועי שלנו',
    labels: [],
    body: `השבוע בבלוג: 10 טיפים לסידור הארון, מתכון לעוגת תפוחים, וסיכום כנס הקיץ.
להסרה מרשימת התפוצה לחצו כאן.`,
    attachments: [],
  },
];
