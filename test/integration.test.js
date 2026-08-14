const test = require('node:test');

const integrationEnabled = process.env.RUN_INTEGRATION_TESTS === '1';

test('integration test membutuhkan RUN_INTEGRATION_TESTS=1', { skip: integrationEnabled }, () => {
  // Integration test database sengaja tidak berjalan default agar test lokal
  // tidak pernah menulis atau membaca database production secara tidak sengaja.
});

if (integrationEnabled) {
  test('integration test belum diaktifkan tanpa konfigurasi database test', () => {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Integration test tidak boleh dijalankan dengan NODE_ENV=production');
    }
    throw new Error('Set DATABASE_URL ke database test/staging sebelum mengaktifkan integration test');
  });
}
