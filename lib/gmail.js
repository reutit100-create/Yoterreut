// Gmail connection over OAuth 2.0 (no passwords are ever stored).
// Scope: gmail.modify, the narrowest Gmail scope that can both read messages and add the
// "processed" label. The search query restricts what is read to likely benefit offers.
import fs from 'node:fs';
import path from 'node:path';

const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

export function createGmail({ dataDir, appUrl }) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${appUrl}/auth/google/callback`;
  const secretsFile = path.join(dataDir, 'gmail-token.json');
  let token = null;
  let labelIds = {};
  try { token = JSON.parse(fs.readFileSync(secretsFile, 'utf8')); } catch { /* not connected */ }

  const configured = () => !!(clientId && clientSecret);
  const saveToken = t => {
    token = t;
    fs.writeFileSync(secretsFile, JSON.stringify(t), { mode: 0o600 });
  };

  async function oauth(params) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error_description || j.error || 'OAuth error');
    return j;
  }

  async function accessToken() {
    if (!token) throw new Error('Gmail is not connected');
    if (token.access_token && token.expires_at > Date.now() + 60000) return token.access_token;
    const j = await oauth({ grant_type: 'refresh_token', refresh_token: token.refresh_token });
    saveToken({ ...token, access_token: j.access_token, expires_at: Date.now() + j.expires_in * 1000 });
    return token.access_token;
  }

  async function api(p, init = {}) {
    const res = await fetch(API + p, { ...init, headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json', ...(init.headers || {}) } });
    if (!res.ok) throw new Error(`Gmail API ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async function ensureLabel(name) {
    if (labelIds[name]) return labelIds[name];
    const { labels = [] } = await api('/labels');
    let l = labels.find(x => x.name === name);
    if (!l) l = await api('/labels', { method: 'POST', body: JSON.stringify({ name, labelListVisibility: 'labelShow', messageListVisibility: 'show' }) });
    labelIds[name] = l.id;
    return l.id;
  }

  const b64 = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

  function walk(part, out) {
    if (!part) return;
    if (part.mimeType === 'text/plain' && part.body?.data && !part.filename) out.text.push(b64(part.body.data).toString('utf8'));
    else if (part.mimeType === 'text/html' && part.body?.data && !part.filename) out.html.push(b64(part.body.data).toString('utf8'));
    if (part.filename && part.body?.attachmentId) out.attachments.push({ name: part.filename, type: part.mimeType, id: part.body.attachmentId, size: part.body.size });
    for (const p of part.parts || []) walk(p, out);
  }

  const htmlToText = h => h.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n');

  return {
    configured,
    status: () => ({ configured: configured(), connected: !!token, email: token?.email || '', scopes: SCOPES, redirectUri }),
    authUrl(state) {
      const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent', state, include_granted_scopes: 'true' });
      return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
    },
    async connect(code) {
      const j = await oauth({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
      saveToken({ refresh_token: j.refresh_token, access_token: j.access_token, expires_at: Date.now() + j.expires_in * 1000 });
      const profile = await api('/profile');
      saveToken({ ...token, email: profile.emailAddress });
      return profile.emailAddress;
    },
    async disconnect() {
      if (token?.refresh_token) { try { await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token.refresh_token)}`, { method: 'POST' }); } catch { /* best effort */ } }
      token = null; labelIds = {};
      try { fs.unlinkSync(secretsFile); } catch { /* already gone */ }
    },
    async fetchNew(settings, senders, seen) {
      if (!token) return [];
      const g = settings.gmail;
      const quote = s => `"${s.replace(/"/g, '')}"`;
      const any = [`label:${quote(g.label)}`];
      if (g.forwardAddress) any.push(`to:${g.forwardAddress}`);
      const approved = senders.map(s => s.email).filter(Boolean);
      if (approved.length) any.push(`from:(${approved.join(' OR ')})`);
      if (g.keywords?.length) any.push(`{${g.keywords.map(quote).join(' ')}}`);
      const q = `newer_than:14d -label:${quote(g.processedLabel)} {${any.join(' ')}}`;
      const list = await api(`/messages?maxResults=25&q=${encodeURIComponent(q)}`);
      const seenSet = new Set(seen);
      const out = [];
      for (const { id } of list.messages || []) {
        if (seenSet.has(id)) continue;
        const m = await api(`/messages/${id}?format=full`);
        const headers = Object.fromEntries((m.payload.headers || []).map(h => [h.name.toLowerCase(), h.value]));
        const parts = { text: [], html: [], attachments: [] };
        walk(m.payload, parts);
        const fromRaw = headers.from || '';
        const fm = fromRaw.match(/^(.*?)\s*<([^>]+)>$/);
        const attachmentData = [];
        for (const a of parts.attachments) {
          if (a.size > MAX_ATTACHMENT_BYTES || !/^(application\/pdf|image\/)/.test(a.type)) continue;
          const att = await api(`/messages/${id}/attachments/${a.id}`);
          attachmentData.push({ name: a.name, type: a.type, data: b64(att.data).toString('base64') });
        }
        const labelNames = [];
        if (m.labelIds?.length) {
          const { labels = [] } = await api('/labels');
          for (const l of labels) if (m.labelIds.includes(l.id)) labelNames.push(l.name);
        }
        out.push({
          gmailId: id, from: fm ? fm[2] : fromRaw, fromName: fm ? fm[1].replace(/^"|"$/g, '') : '', to: headers.to || '', subject: headers.subject || '',
          receivedAt: new Date(Number(m.internalDate)).toISOString(), body: parts.text.join('\n') || htmlToText(parts.html.join('\n')),
          labels: labelNames, attachments: parts.attachments.map(a => ({ name: a.name, type: a.type })), attachmentData,
        });
      }
      return out;
    },
    async markProcessed(gmailId, settings) {
      const id = await ensureLabel(settings.gmail.processedLabel);
      await api(`/messages/${gmailId}/modify`, { method: 'POST', body: JSON.stringify({ addLabelIds: [id] }) });
    },
  };
}
