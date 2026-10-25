// Small helpers shared by the server, the browser app and the in-browser demo backend.

export function uid(prefix = '') {
  const rnd = (globalThis.crypto && globalThis.crypto.randomUUID)
    ? globalThis.crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
  return prefix ? `${prefix}_${rnd}` : rnd;
}

export const nowIso = () => new Date().toISOString();

// Dates are stored as YYYY-MM-DD (Israel local date is close enough for an MVP).
export function todayStr(d = new Date()) {
  const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return tz.toISOString().slice(0, 10);
}

export function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return todayStr(d);
}

export function daysUntil(dateStr, from = todayStr()) {
  if (!dateStr) return null;
  const a = new Date(from + 'T12:00:00');
  const b = new Date(dateStr + 'T12:00:00');
  return Math.round((b - a) / 86400000);
}

export function formatDateHe(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

// Normalise Hebrew/English business names for duplicate detection.
export function normalizeName(s = '') {
  return String(s)
    .toLowerCase()
    .replace(/["'״׳`]/g, '')
    .replace(/\b(בע"?מ|בעמ|ltd|inc|llc)\b/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizePhone(s = '') {
  let d = String(s).replace(/\D/g, '');
  if (d.startsWith('972')) d = '0' + d.slice(3);
  return d;
}

export function domainOf(url = '') {
  try {
    const u = new URL(/^https?:\/\//.test(url) ? url : 'https://' + url);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch { return ''; }
}

// Dice coefficient over character bigrams: 1 = identical, 0 = nothing shared.
export function similarity(a, b) {
  a = normalizeName(a).replace(/\s/g, '');
  b = normalizeName(b).replace(/\s/g, '');
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = s => {
    const m = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) || 0) + 1);
    }
    return m;
  };
  const A = grams(a), B = grams(b);
  let inter = 0;
  for (const [g, n] of A) inter += Math.min(n, B.get(g) || 0);
  return (2 * inter) / (a.length - 1 + b.length - 1);
}

export function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCsv(rows, columns) {
  const head = columns.map(c => csvEscape(c.label)).join(',');
  const body = rows.map(r => columns.map(c => csvEscape(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(','));
  // BOM so Excel opens Hebrew correctly.
  return '﻿' + [head, ...body].join('\r\n');
}

export function randomCoupon(prefix = 'REUT') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}${s}`;
}

export function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
