const test = require('node:test');

const integrationEnabled = process.env.RUN_INTEGRATION_TESTS === '1';

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
}
