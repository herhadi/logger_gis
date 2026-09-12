const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const enabled = process.env.RUN_NEST_INTEGRATION === '1';
const databaseEnabled = process.env.RUN_NEST_DB_INTEGRATION === '1';

test('NestJS integration tests require RUN_NEST_INTEGRATION=1', { skip: enabled }, () => {});

if (enabled) {
  const { createNestApp } = require('../dist/main');

  let app;
  test('health endpoint', async () => {
    app = await createNestApp();
    await app.init();
    const response = await request(app.getHttpServer()).get('/health');
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { status: 'ok', framework: 'nestjs' });
  });

  test('protected marker endpoint rejects unauthenticated payload before validation', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/marker/create')
      .send({ tipe: 'acc', coords: 'invalid', unexpected: true });
    assert.equal(response.statusCode, 401);
  });

  test('public tile endpoint responds with vector tile content type', { skip: !databaseEnabled }, async () => {
    const response = await request(app.getHttpServer()).get('/api/marker/tiles/0/0/0.pbf');
    assert.equal(response.statusCode, 200);
    assert.match(String(response.headers['content-type']), /application\/vnd\.mapbox-vector-tile/);
  });

  test('login, session, dan logout berjalan dengan database staging', { skip: !databaseEnabled }, async () => {
    const username = process.env.TEST_ADMIN_USERNAME;
    const password = process.env.TEST_ADMIN_PASSWORD;
    assert.ok(username && password, 'TEST_ADMIN_USERNAME dan TEST_ADMIN_PASSWORD wajib diisi');
    const agent = request.agent(app.getHttpServer());
    const login = await agent.post('/api/login').send({ username, password });
    assert.equal(login.statusCode, 200);
    const session = await agent.get('/api/session');
    assert.equal(session.statusCode, 200);
    assert.equal(session.body.user.username, username);
    const logout = await agent.post('/api/logout');
    assert.equal(logout.statusCode, 200);
    const afterLogout = await agent.get('/api/session');
    assert.equal(afterLogout.statusCode, 401);
  });

  test.after(async () => {
    if (app) await app.close();
  });
}
