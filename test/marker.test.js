const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getMarkerTable,
  isValidCoordinates,
  coordinatesToWkt
} = require('../backend/utils/marker');

test('marker type hanya menerima tabel yang di-whitelist', () => {
  assert.equal(getMarkerTable('acc'), 'gis_acc');
  assert.equal(getMarkerTable('valve'), 'gis_valve');
  assert.equal(getMarkerTable('users'), undefined);
});

test('koordinat marker harus berupa pasangan angka', () => {
  assert.equal(isValidCoordinates([-6.2, 106.8]), true);
  assert.equal(isValidCoordinates(['-6.2', '106.8']), true);
  assert.equal(isValidCoordinates([-6.2]), false);
  assert.equal(isValidCoordinates(['invalid', 106.8]), false);
});

test('koordinat dikonversi ke WKT lat/lng yang benar', () => {
  assert.equal(coordinatesToWkt([-6.2, 106.8]), 'POINT(106.8 -6.2)');
  assert.equal(coordinatesToWkt(['-6.2', '106.8']), 'POINT(106.8 -6.2)');
  assert.equal(coordinatesToWkt([null, 106.8]), null);
});
