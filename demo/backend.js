// Demo backend: runs the real application core inside the browser, persisting to localStorage.
// Installed before the app boots, so the app's API calls never leave the page.
import { createCore } from '../shared/core.js';
import { buildSeed } from '../shared/seed.js';

const KEY = 'yr_demo_db_v1';
const SESSION = 'yr_demo_session';
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* storage unavailable: demo still works in memory */ } };

let db;
try { db = JSON.parse(read(KEY)); } catch { db = null; }
if (!db || !db.meta) db = buildSeed();

const store = {
  db,
  timer: null,
  save() { clearTimeout(this.timer); this.timer = setTimeout(() => write(KEY, JSON.stringify(this.db)), 200); },
};
store.save();

// Demo accounts keep their passwords in plain text: this is sample data in the viewer's own browser.
const core = createCore(store, {
  mode: 'demo',
  checkPassword: (u, pw) => (u.password ? u.password === pw : u.passwordHash === 'demo$' + pw),
  hashPassword: (pw) => 'demo$' + pw,
});
core.runJobs();

let sessionUserId = read(SESSION);
window.__YR_SET_SESSION__ = (id) => { sessionUserId = id; write(SESSION, id); };
window.__YR_RESET__ = () => { write(KEY, null); write(SESSION, null); location.hash = '#/'; location.reload(); };

window.__YR_BACKEND__ = async (method, fullPath, body) => {
  const [path, qs = ''] = fullPath.split('?');
  const user = sessionUserId ? store.db.users.find(u => u.id === sessionUserId && !u.disabled) || null : null;
  const out = await core.handle({ method, path, query: Object.fromEntries(new URLSearchParams(qs)), body: body ? JSON.parse(JSON.stringify(body)) : {}, user });
  if (out.body && '__session' in out.body) {
    window.__YR_SET_SESSION__(out.body.__session ? out.body.__session.userId : null);
    delete out.body.__session;
  }
  // Return copies, like a real network response, so the UI never mutates the store.
  return { status: out.status, body: JSON.parse(JSON.stringify(out.body)) };
};
