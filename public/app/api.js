// API client. In the server build it calls /api over HTTP. In the demo build a
// local backend (the same core, running in the browser) is installed on window.__YR_BACKEND__.

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function api(method, path, body) {
  const local = window.__YR_BACKEND__;
  let status, data;
  if (local) {
    ({ status, body: data } = await local(method, path, body));
  } else {
    const res = await fetch(path, {
      method,
      headers: method === 'GET' ? {} : { 'content-type': 'application/json', 'x-requested-with': 'yoter-reut' },
      body: method === 'GET' ? undefined : JSON.stringify(body || {}),
      credentials: 'same-origin',
    });
    status = res.status;
    try { data = await res.json(); } catch { data = { error: 'תשובה לא תקינה מהשרת' }; }
  }
  if (status >= 400) throw new ApiError(status, (data && data.error) || 'אירעה שגיאה');
  return data;
}

export const get = (p, q) => api('GET', q ? `${p}?${new URLSearchParams(Object.entries(q).filter(([, v]) => v !== '' && v !== undefined && v !== null))}` : p);
export const post = (p, b) => api('POST', p, b);
export const put = (p, b) => api('PUT', p, b);

// Small per-device preferences (favorites, text size, my city). Storage can be unavailable.
export const local = {
  get(key, fallback) {
    try { const v = localStorage.getItem('yr_' + key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('yr_' + key, JSON.stringify(value)); } catch { /* private mode */ }
  },
};

export function eventLog(type, benefitId) {
  post('/api/public/events', { type, benefitId }).catch(() => {});
}
