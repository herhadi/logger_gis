const test = require('node:test');
const assert = require('node:assert/strict');
const { requireLogin, requireAdmin, requireCronSecret } = require('../backend/middleware/auth');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    get() { return undefined; }
  };
}

test('middleware login dan admin menolak session yang tidak sesuai', () => {
  const unauth = response();
  requireLogin({ session: null }, unauth, () => assert.fail());
  assert.equal(unauth.statusCode, 401);

  const nonAdmin = response();
  requireAdmin({ session: { user: { role: 'user' } } }, nonAdmin, () => assert.fail());
  assert.equal(nonAdmin.statusCode, 403);
});

test('middleware cron menerima secret yang benar', () => {
  const res = response();
  const req = { get(name) { return name === 'x-cron-secret' ? 'secret' : undefined; } };
  let called = false;
  requireCronSecret('secret')(req, res, () => { called = true; });
  assert.equal(called, true);
});
