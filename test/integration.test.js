const test = require('node:test');

const integrationEnabled = process.env.RUN_INTEGRATION_TESTS === '1';
const writeIntegrationEnabled = process.env.RUN_INTEGRATION_WRITE === '1';
const nestIntegrationEnabled = process.env.RUN_NEST_INTEGRATION === '1';
const loginTestEnabled = process.env.RUN_LOGIN_TEST === '1';

test('integration test membutuhkan RUN_INTEGRATION_TESTS=1', { skip: integrationEnabled }, () => {
  // Integration test database sengaja tidak berjalan default agar test lokal
  // tidak pernah menulis atau membaca database production secara tidak sengaja.
});

if (integrationEnabled) {
  const request = require('supertest');
  const { createApp } = require('../backend/app');
  const app = createApp();

  test('session tanpa login mengembalikan 401', async () => {
    const response = await request(app).get('/api/session');
    if (response.statusCode !== 401) {
      throw new Error(`Expected 401, received ${response.statusCode}`);
    }
  });

  test('endpoint read pipa, polygon, dan marker merespons', async () => {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Integration test tidak boleh dijalankan dengan NODE_ENV=production');
    }
    for (const path of ['/api/pipa', '/api/polygon', '/api/marker']) {
      const response = await request(app).get(path);
      if (response.statusCode !== 200) {
        throw new Error(`${path} returned ${response.statusCode}`);
      }
    }
  });

  test('endpoint GIS menerima filter bbox/zoom dan statistik seleksi', async () => {
    const pipa = await request(app).get('/api/pipa?bbox=-7,106,-6,107&zoom=12');
    const polygon = await request(app).get('/api/polygon?bbox=-7,106,-6,107&zoom=12');
    const selection = await request(app)
      .post('/api/selection/stats')
      .send({
        geometry: {
          type: 'Polygon',
          coordinates: [[[106, -7], [107, -7], [107, -6], [106, -6], [106, -7]]]
        }
      });

    for (const [name, response] of [['pipa bbox', pipa], ['polygon bbox', polygon], ['selection stats', selection]]) {
      if (response.statusCode !== 200) {
        throw new Error(`${name} returned ${response.statusCode}: ${JSON.stringify(response.body)}`);
      }
    }
  });

  test('CRUD integration membutuhkan flag write dan akun admin test', {
    skip: !writeIntegrationEnabled
  }, async () => {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('CRUD integration test tidak boleh dijalankan dengan NODE_ENV=production');
    }
    const username = process.env.TEST_ADMIN_USERNAME;
    const password = process.env.TEST_ADMIN_PASSWORD;
    if (!username || !password) {
      throw new Error('Set TEST_ADMIN_USERNAME dan TEST_ADMIN_PASSWORD untuk CRUD integration test');
    }

    const agent = request.agent(app);
    const login = await agent.post('/api/login').send({ username, password });
    if (login.statusCode !== 200) throw new Error(`Login test admin gagal: ${login.statusCode}`);

    let markerId;
    let polygonId;
    let pipaId;
    try {
      const marker = await agent.post('/api/marker/create').send({
        tipe: 'acc', coords: [-6.2, 106.8], dc_id: `TEST-${Date.now()}`,
        keterangan: 'integration-test', zona: 'test', lokasi: 'test', elevation: 0
      });
      if (marker.statusCode !== 200) throw new Error(`Create marker gagal: ${marker.statusCode}`);
      markerId = marker.body.ogr_fid || marker.body.id;
      const markerUpdate = await agent.put(`/api/marker/update/acc/${markerId}`).send({
        coords: [-6.2001, 106.8001], dc_id: `TEST-UPDATED-${Date.now()}`,
        keterangan: 'integration-test-updated', zona: 'test', lokasi: 'test', elevation: 1
      });
      if (markerUpdate.statusCode !== 200) throw new Error(`Update marker gagal: ${markerUpdate.statusCode}`);

      const polygon = await agent.post('/api/polygon/create').send({
        coords: [[-6.2, 106.8], [-6.2, 106.8002], [-6.2002, 106.8002]],
        nosamw: 'TESTPOLY01', nosambckup: 'itest'
      });
      if (polygon.statusCode !== 200) throw new Error(`Create polygon gagal: ${polygon.statusCode}`);
      polygonId = polygon.body.ogr_fid;
      const polygonUpdate = await agent.put(`/api/polygon/update/${polygonId}`).send({
        coords: [[-6.2, 106.8], [-6.2, 106.8003], [-6.2003, 106.8003]],
        nosamw: 'TESTPOLY02', nosambckup: 'itest'
      });
      if (polygonUpdate.statusCode !== 200) throw new Error(`Update polygon gagal: ${polygonUpdate.statusCode}`);

      const pipa = await agent.post('/api/pipa/create').send({
        coords: [[-6.2, 106.8], [-6.2003, 106.8003]], dc_id: `TEST-${Date.now()}`,
        jenis: 'itest', keterangan: 'itest', lokasi: 'test',
        status: 'test', diameter: 25, roughness: 1, zona: 'test'
      });
      if (pipa.statusCode !== 200) throw new Error(`Create pipa gagal: ${pipa.statusCode}`);
      pipaId = pipa.body.ogr_fid;
      const pipaUpdate = await agent.put(`/api/pipa/update/${pipaId}`).send({
        coords: [[-6.2, 106.8], [-6.2004, 106.8004]], dc_id: `TEST-UPDATED-${Date.now()}`,
        jenis: 'itest2', diameter: 25
      });
      if (pipaUpdate.statusCode !== 200) throw new Error(`Update pipa gagal: ${pipaUpdate.statusCode}`);
    } finally {
      if (pipaId) await agent.delete(`/api/pipa/delete/${pipaId}`);
      if (polygonId) await agent.delete(`/api/polygon/delete/${polygonId}`);
      if (markerId) await agent.delete(`/api/marker/delete/acc/${markerId}`);
      await agent.post('/api/logout');
    }
  });

  test('NestJS marker endpoint memiliki parity dasar dengan Express', {
    skip: !nestIntegrationEnabled
  }, async () => {
    const { createNestApp } = require('../dist/backend-nest/main');
    const nestApp = await createNestApp();
    nestApp.useLogger([]);
    await nestApp.init();
    try {
      const expressResponse = await request(app).get('/api/marker');
      const nestResponse = await request(nestApp.getHttpServer()).get('/api/marker');
      if (expressResponse.statusCode !== 200 || nestResponse.statusCode !== 200) {
        throw new Error(`Marker parity status Express=${expressResponse.statusCode}, Nest=${nestResponse.statusCode}`);
      }
      if (!Array.isArray(expressResponse.body) || !Array.isArray(nestResponse.body)) {
        throw new Error('Response marker harus berupa array');
      }
      for (const item of nestResponse.body.slice(0, 3)) {
        if (!item.id || !item.tipe || !item.geometry || !Array.isArray(item.coords)) {
          throw new Error('Shape response marker NestJS tidak sesuai kontrak');
        }
      }
    } finally {
      await nestApp.close();
    }
  });

  test('NestJS polygon dan selection memiliki parity dasar dengan Express', {
    skip: !nestIntegrationEnabled
  }, async () => {
    const { createNestApp } = require('../dist/backend-nest/main');
    const nestApp = await createNestApp();
    await nestApp.init();
    try {
      const polygon = await request(app).get('/api/polygon?bbox=-7,106,-6,107&zoom=12');
      const nestPolygon = await request(nestApp.getHttpServer()).get('/api/polygon?bbox=-7,106,-6,107&zoom=12');
      const body = { geometry: { type: 'Polygon', coordinates: [[[106, -7], [107, -7], [107, -6], [106, -6], [106, -7]]] } };
      const selection = await request(app).post('/api/selection/stats').send(body);
      const nestSelection = await request(nestApp.getHttpServer()).post('/api/selection/stats').send(body);
      if (polygon.statusCode !== 200 || nestPolygon.statusCode !== 200 || selection.statusCode !== 200 || nestSelection.statusCode !== 201) {
        throw new Error(`Polygon/selection parity status Express=${polygon.statusCode}/${selection.statusCode}, Nest=${nestPolygon.statusCode}/${nestSelection.statusCode}`);
      }
      if (!Array.isArray(nestPolygon.body) || typeof nestSelection.body.pointCount !== 'number') {
        throw new Error('Shape response polygon/selection NestJS tidak sesuai kontrak');
      }
    } finally {
      await nestApp.close();
    }
  });

  test('NestJS pipa endpoint memiliki parity dasar dengan Express', {
    skip: !nestIntegrationEnabled
  }, async () => {
    const { createNestApp } = require('../dist/backend-nest/main');
    const nestApp = await createNestApp();
    await nestApp.init();
    try {
      const expressResponse = await request(app).get('/api/pipa?bbox=-7,106,-6,107&zoom=12');
      const nestResponse = await request(nestApp.getHttpServer()).get('/api/pipa?bbox=-7,106,-6,107&zoom=12');
      if (expressResponse.statusCode !== 200 || nestResponse.statusCode !== 200) {
        throw new Error(`Pipa parity status Express=${expressResponse.statusCode}, Nest=${nestResponse.statusCode}`);
      }
      if (!Array.isArray(nestResponse.body)) throw new Error('Response pipa NestJS harus berupa array');
    } finally {
      await nestApp.close();
    }
  });

  test('NestJS auth dan CRUD marker berjalan dengan session', {
    skip: !nestIntegrationEnabled || !writeIntegrationEnabled
  }, async () => {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('NestJS CRUD integration test tidak boleh dijalankan dengan NODE_ENV=production');
    }
    const username = process.env.TEST_ADMIN_USERNAME;
    const password = process.env.TEST_ADMIN_PASSWORD;
    if (!username || !password) {
      throw new Error('Set TEST_ADMIN_USERNAME dan TEST_ADMIN_PASSWORD untuk NestJS CRUD test');
    }

    const { createNestApp } = require('../dist/backend-nest/main');
    const nestApp = await createNestApp();
    nestApp.useLogger([]);
    await nestApp.init();
    const agent = request.agent(nestApp.getHttpServer());
    let markerId;
    let polygonId;
    let pipaId;
    try {
      const login = await agent.post('/api/login').send({ username, password });
      if (login.statusCode !== 200) throw new Error(`NestJS login gagal: ${login.statusCode}`);
      const session = await agent.get('/api/session');
      if (session.statusCode !== 200) throw new Error(`NestJS session gagal: ${session.statusCode}`);

      const marker = await agent.post('/api/marker/create').send({
        tipe: 'acc', coords: [-6.2, 106.8], dc_id: `NEST-TEST-${Date.now()}`,
        keterangan: 'nestjs-integration-test', zona: 'test', lokasi: 'test', elevation: 0
      });
      if (marker.statusCode !== 201 && marker.statusCode !== 200) {
        throw new Error(`NestJS create marker gagal: ${marker.statusCode}`);
      }
      markerId = marker.body.ogr_fid || marker.body.id;
      if (!markerId) throw new Error('NestJS create marker tidak mengembalikan id');

      const polygon = await agent.post('/api/polygon/create').send({
        coords: [[-6.2, 106.8], [-6.2, 106.8002], [-6.2002, 106.8002]],
        nosamw: 'NESTPOLY01', nosambckup: 'itest'
      });
      if (polygon.statusCode !== 201 && polygon.statusCode !== 200) {
        throw new Error(`NestJS create polygon gagal: ${polygon.statusCode}`);
      }
      polygonId = polygon.body.ogr_fid;
      const polygonUpdate = await agent.put(`/api/polygon/update/${polygonId}`).send({
        coords: [[-6.2, 106.8], [-6.2, 106.8003], [-6.2003, 106.8003]],
        nosamw: 'NESTPOLY02', nosambckup: 'itest'
      });
      if (polygonUpdate.statusCode !== 200) throw new Error(`NestJS update polygon gagal: ${polygonUpdate.statusCode}`);

      const pipa = await agent.post('/api/pipa/create').send({
        coords: [[-6.2, 106.8], [-6.2002, 106.8002]], dc_id: 'NESTPIPA',
        jenis: 'itest', diameter: 25, zona: 'test', lokasi: 'test'
      });
      if (pipa.statusCode !== 201 && pipa.statusCode !== 200) {
        throw new Error(`NestJS create pipa gagal: ${pipa.statusCode}`);
      }
      pipaId = pipa.body.ogr_fid || pipa.body.id;
      if (!pipaId) throw new Error('NestJS create pipa tidak mengembalikan id');
      const pipaUpdate = await agent.put(`/api/pipa/update/${pipaId}`).send({
        coords: [[-6.2, 106.8], [-6.2003, 106.8003]], dc_id: 'NESTPIP2',
        jenis: 'itest2', diameter: 32, zona: 'test', lokasi: 'test'
      });
      if (pipaUpdate.statusCode !== 200) throw new Error(`NestJS update pipa gagal: ${pipaUpdate.statusCode}`);
    } finally {
      if (pipaId) await agent.delete(`/api/pipa/delete/${pipaId}`);
      if (polygonId) await agent.delete(`/api/polygon/delete/${polygonId}`);
      if (markerId) await agent.delete(`/api/marker/delete/acc/${markerId}`);
      await agent.post('/api/logout');
      await nestApp.close();
    }
  });
}

if (loginTestEnabled) {
  const request = require('supertest');
  const { createApp } = require('../backend/app');
  const app = createApp();

  test('login credential test', async () => {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Login test tidak boleh dijalankan dengan NODE_ENV=production');
    }
    const username = process.env.TEST_ADMIN_USERNAME;
    const password = process.env.TEST_ADMIN_PASSWORD;
    if (!username || !password) {
      throw new Error('TEST_ADMIN_USERNAME atau TEST_ADMIN_PASSWORD kosong');
    }
    const response = await request(app).post('/api/login').send({ username, password });
    if (response.statusCode !== 200) {
      throw new Error(`Login gagal untuk user ${username}: ${response.statusCode} ${JSON.stringify(response.body)}`);
    }
  });
}
