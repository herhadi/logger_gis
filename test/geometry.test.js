const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isValidLineCoordinates,
  isValidPolygonCoordinates,
  coordinatesToLineWkt,
  coordinatesToPolygonWkt
} = require('../backend/utils/geometry');

test('validasi geometry line dan polygon', () => {
  assert.equal(isValidLineCoordinates([[-6.2, 106.8], [-6.3, 106.9]]), true);
  assert.equal(isValidPolygonCoordinates([[-6.2, 106.8], [-6.3, 106.9], [-6.4, 106.8]]), true);
  assert.equal(isValidLineCoordinates([[-6.2, 106.8]]), false);
  assert.equal(isValidPolygonCoordinates([[-6.2, 106.8], [-6.3, 106.9]]), false);
});

test('konversi geometry ke WKT menukar urutan lat/lng', () => {
  assert.equal(
    coordinatesToLineWkt([[-6.2, 106.8], [-6.3, 106.9]]),
    'LINESTRING(106.8 -6.2, 106.9 -6.3)'
  );
  assert.equal(
    coordinatesToPolygonWkt([[-6.2, 106.8], [-6.3, 106.9], [-6.4, 106.8]]),
    'POLYGON((106.8 -6.2, 106.9 -6.3, 106.8 -6.4, 106.8 -6.2))'
  );
});
