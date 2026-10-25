import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../shared/core.js';
import { buildSeed, SAMPLE_EMAILS } from '../shared/seed.js';
import { addDays, todayStr } from '../shared/util.js';

function setup() {
  const store = { db: buildSeed(), save() {} };
  const core = createCore(store, { checkPassword: (u, pw) => u.password === pw, hashPassword: pw => pw });
  const users = Object.fromEntries(store.db.users.map(u => [u.role, u]));
  return { store, core, users };
}

test('public API hides benefits that need completion and internal fields', async () => {
  const { core } = setup();
  const r = await core.handle({ method: 'GET', path: '/api/public/benefits' });
  assert.equal(r.body.items.length, 17);
  assert.ok(r.body.items.every(b => !('needsCompletion' in b) && !('status' in b) && !('notes' in b)));
  const hidden = await core.handle({ method: 'GET', path: '/api/public/benefits/ben_cdsoft' });
  assert.equal(hidden.status, 404);
});

test('roles: members cannot reach the dashboard, editors cannot manage users', async () => {
  const { core, users } = setup();
  assert.equal((await core.handle({ method: 'GET', path: '/api/admin/overview' })).status, 401);
  assert.equal((await core.handle({ method: 'GET', path: '/api/admin/overview', user: users.member })).status, 403);
  assert.equal((await core.handle({ method: 'GET', path: '/api/admin/overview', user: users.editor })).status, 200);
  assert.equal((await core.handle({ method: 'GET', path: '/api/admin/users', user: users.editor })).status, 403);
});

test('email pipeline: duplicate business detected, benefit waits for approval', async () => {
  const { core, store, users } = setup();
  const r = await core.handle({ method: 'POST', path: '/api/admin/emails/simulate', body: { sampleKey: 'dup' }, user: users.admin });
  assert.equal(r.body.relevant, true);
  const email = store.db.emails[0];
  assert.equal(email.duplicates.businesses[0].id, 'biz_timeout');
  assert.equal(store.db.benefits.find(b => b.id === r.body.benefitId).status, 'pending');
  const approve = await core.handle({ method: 'POST', path: `/api/admin/emails/${email.id}/approve`, body: { publish: true }, user: users.admin });
  assert.equal(approve.status, 409, 'must choose to link or create when the business already exists');
});

test('newsletter is ignored and nothing is stored', async () => {
  const { core, store, users } = setup();
  const r = await core.handle({ method: 'POST', path: '/api/admin/emails/simulate', body: { sampleKey: 'newsletter' }, user: users.admin });
  assert.equal(r.body.relevant, false);
  assert.equal(store.db.emails.length, 0);
});

test('auto-publish only for trusted senders with auto-publish enabled', async () => {
  const { core, store, users } = setup();
  store.db.senders.push({ id: 's1', email: 'office@energym.co.il', name: 'אנרג׳ים', trusted: true, autoPublish: true });
  const r = await core.handle({ method: 'POST', path: '/api/admin/emails/simulate', body: { sampleKey: 'gym' }, user: users.admin });
  assert.equal(r.body.autoPublished, true);
  assert.equal(store.db.benefits.find(b => b.id === r.body.benefitId).status, 'active');
});

test('expired benefits move to "ended" and expiry alerts fire once', () => {
  const { core, store } = setup();
  const b = store.db.benefits.find(x => x.id === 'ben_clever');
  b.isPermanent = false; b.endDate = addDays(todayStr(), -1);
  const c = store.db.benefits.find(x => x.id === 'ben_shade');
  c.endDate = addDays(todayStr(), 5);
  core.runJobs();
  assert.equal(b.status, 'ended');
  const n = store.db.alerts.filter(a => a.type === 'expiry').length;
  assert.equal(n, 1);
  core.runJobs();
  assert.equal(store.db.alerts.filter(a => a.type === 'expiry').length, 1);
});

test('permanent delete requires typed confirmation and admin role', async () => {
  const { core, users } = setup();
  assert.equal((await core.handle({ method: 'POST', path: '/api/admin/benefits/ben_shade/delete', body: { confirm: 'מחיקה' }, user: users.editor })).status, 403);
  assert.equal((await core.handle({ method: 'POST', path: '/api/admin/benefits/ben_shade/delete', body: {}, user: users.admin })).status, 400);
  assert.equal((await core.handle({ method: 'POST', path: '/api/admin/benefits/ben_shade/delete', body: { confirm: 'מחיקה' }, user: users.admin })).status, 200);
});
