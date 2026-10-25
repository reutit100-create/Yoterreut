// יותר רעות – web server. Serves the PWA, the JSON API (shared/core.js), Gmail OAuth,
// scheduled automations and backups. No framework: Node's built-in http module only.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createCore } from './shared/core.js';
import { buildSeed } from './shared/seed.js';
import { todayStr } from './shared/util.js';
import { createAi } from './lib/ai.js';
import { createGmail } from './lib/gmail.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const APP_URL = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const SECURE_COOKIE = APP_URL.startsWith('https://');
const SESSION_HOURS = 12;
fs.mkdirSync(BACKUP_DIR, { recursive: true });

// ---------- passwords ----------
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
function checkPassword(user, pw) {
  if (!user.passwordHash) return false;
  const [, salt, hash] = user.passwordHash.split('$');
  const test = crypto.scryptSync(pw, salt, 64);
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
}

// ---------- storage ----------
function loadDb() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const db = buildSeed();
  // On a real server only the admin account is created, with a password from the environment
  // (or a random one printed once). The demo editor/member accounts exist only in the demo build.
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@yoter-reut.org.il').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  db.users = [{ id: 'user_admin', email: adminEmail, name: 'מנהלת', role: 'admin', passwordHash: hashPassword(adminPassword), createdAt: new Date().toISOString() }];
  if (!process.env.ADMIN_PASSWORD) console.log(`\n  חשבון מנהלת נוצר: ${adminEmail}\n  סיסמה זמנית: ${adminPassword}\n  (מומלץ להחליף בהגדרות ← משתמשים)\n`);
  return db;
}

const store = {
  db: loadDb(),
  _timer: null,
  save() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), 300);
  },
  flush() {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.db));
    fs.renameSync(tmp, DB_FILE);
  },
};
store.flush();

function dailyBackup() {
  const file = path.join(BACKUP_DIR, `db-${todayStr()}.json`);
  if (!fs.existsSync(file)) fs.copyFileSync(DB_FILE, file);
  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('db-')).sort();
  for (const f of files.slice(0, Math.max(0, files.length - 30))) fs.unlinkSync(path.join(BACKUP_DIR, f));
}

// ---------- integrations ----------
const ai = createAi();
const gmailClient = createGmail({ dataDir: DATA_DIR, appUrl: APP_URL });
const gmail = {
  status: () => ({ ...gmailClient.status(), aiAvailable: ai.available() }),
  fetchNew: (...a) => gmailClient.fetchNew(...a),
  markProcessed: id => gmailClient.markProcessed(id, store.db.settings),
};
const outbox = path.join(DATA_DIR, 'notifications.log');
function notify(alert) {
  // In-app alerts are stored by the core. Email/WhatsApp delivery is logged here until an
  // email provider (or the official WhatsApp Business API) is configured.
  const external = (alert.channels || []).filter(c => c !== 'app');
  if (external.length) fs.appendFileSync(outbox, `${alert.at}\t${external.join(',')}\t${alert.title}\t${alert.body}\n`);
}

const core = createCore(store, { mode: 'server', checkPassword, hashPassword, ai, gmail, notify });

// ---------- sessions ----------
const sessions = new Map(); // token -> { userId, expires }
function getUser(req) {
  const token = (req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith('yr_session='))?.slice(11);
  const s = token && sessions.get(token);
  if (!s || s.expires < Date.now()) return null;
  const u = store.db.users.find(x => x.id === s.userId && !x.disabled);
  return u || null;
}
function sessionCookie(token, maxAge) {
  return `yr_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${SECURE_COOKIE ? '; Secure' : ''}`;
}

const loginAttempts = new Map(); // ip -> [timestamps]
function rateLimited(ip) {
  const now = Date.now();
  const arr = (loginAttempts.get(ip) || []).filter(t => now - t < 15 * 60000);
  arr.push(now);
  loginAttempts.set(ip, arr);
  return arr.length > 10;
}

// ---------- http ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};
// Only these folders are public. shared/seed.js is not served.
const STATIC = [['/shared/util.js', path.join(ROOT, 'shared/util.js')]];

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, { ...SECURITY_HEADERS, ...(isJson ? { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } : {}), ...headers });
  res.end(isJson ? JSON.stringify(body) : body);
}

function readBody(req, limit = 15 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(Object.assign(new Error('bad json'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  const fixed = STATIC.find(([p]) => p === pathname);
  let file = fixed ? fixed[1] : path.join(ROOT, 'public', pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(path.join(ROOT, 'public')) && !fixed) return send(res, 403, 'Forbidden');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, 'public', 'index.html'); // SPA fallback
  const ext = path.extname(file);
  const cache = ext === '.html' || file.endsWith('sw.js') ? 'no-cache' : 'public, max-age=3600';
  send(res, 200, fs.readFileSync(file), { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': cache });
}

const oauthStates = new Map();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, APP_URL);
  const { pathname } = url;
  try {
    // Gmail OAuth (admin only).
    if (pathname === '/auth/google/start') {
      const user = getUser(req);
      if (!user || user.role !== 'admin') return send(res, 302, '', { location: '/#/login' });
      if (!gmailClient.configured()) return send(res, 302, '', { location: '/#/admin/settings?gmail=not-configured' });
      const state = crypto.randomBytes(16).toString('hex');
      oauthStates.set(state, { userId: user.id, expires: Date.now() + 10 * 60000 });
      return send(res, 302, '', { location: gmailClient.authUrl(state) });
    }
    if (pathname === '/auth/google/callback') {
      const st = oauthStates.get(url.searchParams.get('state'));
      oauthStates.delete(url.searchParams.get('state'));
      const user = getUser(req);
      if (!st || st.expires < Date.now() || !user || user.id !== st.userId) return send(res, 302, '', { location: '/#/admin/settings?gmail=error' });
      if (url.searchParams.get('error')) return send(res, 302, '', { location: '/#/admin/settings?gmail=denied' });
      const email = await gmailClient.connect(url.searchParams.get('code'));
      store.db.settings.gmail.mode = 'live';
      store.db.settings.gmail.connectedEmail = email;
      store.db.auditLog.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), userId: user.id, userName: user.name, action: 'gmail_connect', entity: 'settings', entityId: '', summary: `חוברה תיבת Gmail: ${email}` });
      store.save();
      return send(res, 302, '', { location: '/#/admin/settings?gmail=connected' });
    }

    if (pathname.startsWith('/api/')) {
      const user = getUser(req);
      // CSRF: state-changing requests must come from our own front-end (custom header + JSON).
      if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'yoter-reut') return send(res, 403, { error: 'בקשה לא מורשית' });
      if (pathname === '/api/auth/login' && rateLimited(req.socket.remoteAddress)) return send(res, 429, { error: 'יותר מדי ניסיונות התחברות. נסו שוב בעוד רבע שעה.' });
      if (pathname === '/api/admin/gmail/disconnect' && req.method === 'POST') {
        if (!user || user.role !== 'admin') return send(res, 403, { error: 'אין לך הרשאה לפעולה הזו' });
        await gmailClient.disconnect();
        store.db.settings.gmail.mode = 'demo';
        store.db.settings.gmail.connectedEmail = '';
        store.save();
        return send(res, 200, { ok: true });
      }
      const body = req.method === 'GET' ? {} : await readBody(req);
      const query = Object.fromEntries(url.searchParams);
      const out = await core.handle({ method: req.method, path: pathname, query, body, user });
      const headers = {};
      if (out.body && '__session' in out.body) {
        const sess = out.body.__session;
        delete out.body.__session;
        const old = (req.headers.cookie || '').match(/yr_session=([^;]+)/);
        if (old) sessions.delete(old[1]);
        if (sess) {
          const token = crypto.randomBytes(32).toString('hex');
          sessions.set(token, { userId: sess.userId, expires: Date.now() + SESSION_HOURS * 3600000 });
          headers['set-cookie'] = sessionCookie(token, SESSION_HOURS * 3600);
        } else headers['set-cookie'] = sessionCookie('', 0);
      }
      return send(res, out.status, out.body, headers);
    }

    if (req.method === 'GET') return serveStatic(req, res, pathname);
    send(res, 405, 'Method not allowed');
  } catch (e) {
    console.error(e);
    send(res, e.status || 500, { error: e.status === 413 ? 'הקובץ גדול מדי' : 'אירעה שגיאה בשרת' });
  }
});

// ---------- scheduled automations ----------
async function checkLinks() {
  for (const b of store.db.benefits.filter(x => x.status === 'active' && x.redeemUrl)) {
    try {
      const r = await fetch(b.redeemUrl, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(8000) });
      b.linkBroken = r.status >= 400 && r.status !== 405 && r.status !== 403;
    } catch { b.linkBroken = true; }
  }
  store.save();
}
let lastGmailCheck = 0;
async function tick() {
  try {
    core.runJobs();
    dailyBackup();
    const g = store.db.settings.gmail;
    if (gmailClient.status().connected && Date.now() - lastGmailCheck > (g.pollMinutes || 15) * 60000) {
      lastGmailCheck = Date.now();
      const msgs = await gmailClient.fetchNew(store.db.settings, store.db.senders, store.db.jobState.seenGmailIds || []);
      for (const m of msgs) await core.processEmail(m, { source: 'gmail' });
      g.lastCheckedAt = new Date().toISOString();
      store.save();
    }
  } catch (e) { console.error('scheduled job failed:', e.message); }
}
setInterval(tick, 5 * 60000);
setInterval(() => checkLinks().catch(() => {}), 24 * 3600000);
tick();

process.on('SIGTERM', () => { store.flush(); process.exit(0); });
process.on('SIGINT', () => { store.flush(); process.exit(0); });

server.listen(PORT, () => console.log(`יותר רעות פועל בכתובת ${APP_URL}`));
