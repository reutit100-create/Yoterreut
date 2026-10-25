// AI extraction and copywriting with Claude. Used only when ANTHROPIC_API_KEY is set;
// otherwise the core falls back to the rule-based extractor in shared/extract.js.
import Anthropic from '@anthropic-ai/sdk';
import { finalizeExtraction } from '../shared/extract.js';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';

const STRING_FIELDS = ['businessName', 'contactName', 'email', 'phone', 'title', 'description', 'discountLabel', 'couponCode',
  'terms', 'startDate', 'endDate', 'address', 'city', 'website', 'whatsapp', 'social', 'logoAttachment'];

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['isBenefitOffer', 'fields', 'confidence', 'notes'],
  properties: {
    isBenefitOffer: { type: 'boolean' },
    fields: {
      type: 'object',
      additionalProperties: false,
      required: [...STRING_FIELDS, 'discountType', 'discountValue', 'categoryId', 'redeemMode'],
      properties: {
        ...Object.fromEntries(STRING_FIELDS.map(k => [k, { type: 'string' }])),
        discountType: { type: 'string', enum: ['percent', 'amount', 'gift', ''] },
        discountValue: { type: 'number' },
        categoryId: { type: 'string' },
        redeemMode: { type: 'string', enum: ['online', 'in_store', 'both', ''] },
      },
    },
    confidence: {
      type: 'object',
      additionalProperties: false,
      required: [...STRING_FIELDS, 'discountType', 'discountValue', 'categoryId', 'redeemMode'],
      properties: Object.fromEntries([...STRING_FIELDS, 'discountType', 'discountValue', 'categoryId', 'redeemMode'].map(k => [k, { type: 'number' }])),
    },
    notes: { type: 'string' },
  },
};

const SYSTEM = `את/ה עוזר/ת למנהלת של „יותר רעות”, מועדון הטבות קהילתי בישראל.
מקבלים מייל (ולעיתים קבצים מצורפים) מעסק, ומחלצים ממנו את פרטי ההטבה המוצעת לחברות הקהילה.
כללים:
- כתבו את כל הערכים בעברית, כפי שהם מופיעים במייל. אל תמציאו מידע.
- שדה שלא מופיע במייל: מחרוזת ריקה (או 0 ל־discountValue) וביטחון 0.
- confidence לכל שדה: מספר בין 0 ל־1 שמבטא עד כמה הערך מופיע במפורש במייל.
- title: כותרת קצרה ושיווקית עד 60 תווים. description: תיאור ההטבה במשפט או שניים.
- discountType: percent לאחוז, amount לסכום בשקלים, gift למתנה או משהו חינם. discountValue: המספר בלבד.
- תאריכים בפורמט YYYY-MM-DD. אם השנה חסרה, השתמשו בתאריך העתידי הקרוב.
- טלפונים בפורמט ישראלי (למשל 03-1234567). website: קישור מלא.
- categoryId: אחד מהמזהים שברשימה, או מחרוזת ריקה.
- isBenefitOffer: false לניוזלטר, פרסומת כללית או מייל שאינו הצעת הטבה.
- notes: הערה קצרה למנהלת על מידע חסר או לא ברור.`;

export function createAi() {
  const key = process.env.ANTHROPIC_API_KEY;
  const client = key ? new Anthropic() : null;

  async function call({ system, content, schema, maxTokens = 4000 }) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages: [{ role: 'user', content }],
    });
    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') return null;
    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    try { return JSON.parse(text); } catch { return null; }
  }

  return {
    available: () => !!client,
    async extract(email, { categories }) {
      if (!client) return null;
      const content = [];
      // Attachments the model can read directly: PDFs and images (size-limited by the Gmail module).
      for (const a of email.attachmentData || []) {
        if (a.type === 'application/pdf') content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.data } });
        else if (/^image\/(png|jpeg|gif|webp)$/.test(a.type)) content.push({ type: 'image', source: { type: 'base64', media_type: a.type, data: a.data } });
      }
      content.push({
        type: 'text',
        text: `קטגוריות אפשריות: ${categories.map(c => `${c.id} = ${c.name}`).join(', ')}\nתאריך היום: ${new Date().toISOString().slice(0, 10)}\n\nמאת: ${email.fromName || ''} <${email.from}>\nנושא: ${email.subject}\nקבצים מצורפים: ${(email.attachments || []).map(a => a.name).join(', ') || 'אין'}\n\n${(email.body || '').slice(0, 15000)}`,
      });
      const r = await call({ system: SYSTEM, content, schema: SCHEMA });
      if (!r) return null;
      const fields = {}, confidence = {};
      for (const [k, v] of Object.entries(r.fields)) {
        if (v === '' || v === null || (k === 'discountValue' && !v)) continue;
        fields[k] = v;
        confidence[k] = Math.max(0, Math.min(1, Number(r.confidence[k]) || 0));
      }
      if (!categories.some(c => c.id === fields.categoryId)) delete fields.categoryId;
      const out = finalizeExtraction(fields, confidence);
      out.notes = r.notes;
      if (!r.isBenefitOffer) out.overall = Math.min(out.overall, 30);
      return out;
    },
    async rewrite(b, businessName) {
      if (!client) return null;
      const r = await call({
        system: 'את/ה קופירייטר/ית של „יותר רעות”, מועדון הטבות קהילתי חם ונגיש. כתבו בעברית פשוטה, חמה וברורה, בלי סימני קריאה מיותרים ובלי להמציא פרטים שלא ניתנו.',
        content: [{ type: 'text', text: `נסחו מחדש את ההטבה בצורה שיווקית וקצרה.\ntitle: עד 50 תווים, מתחיל בהטבה עצמה.\nshortDescription: משפט אחד עד 120 תווים.\n\nעסק: ${businessName}\nכותרת נוכחית: ${b.title || ''}\nתיאור: ${b.shortDescription || b.fullDescription || b.description || ''}\nהנחה: ${b.discountLabel || (b.discountValue ? b.discountValue + (b.discountType === 'percent' ? '%' : ' ₪') : '')}\nקופון: ${b.couponCode || ''}\nתנאים: ${b.terms || ''}` }],
        schema: { type: 'object', additionalProperties: false, required: ['title', 'shortDescription'], properties: { title: { type: 'string' }, shortDescription: { type: 'string' } } },
        maxTokens: 2000,
      });
      return r;
    },
  };
}
