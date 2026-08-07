const test = require('node:test');
const assert = require('node:assert/strict');
const { createPipaRouter } = require('../backend/routes/pipa');
const { createPolygonRouter, createSelectionRouter } = require('../backend/routes/polygon');

function routesOf(router) {
  return router.stack
    .filter(layer => layer.route)
    .flatMap(layer => Object.keys(layer.route.methods).map(method => `${method.toUpperCase()} ${layer.route.path}`));
}

test('router pipa mendaftarkan seluruh endpoint tanpa collision', () => {
  const routes = routesOf(createPipaRouter({ query() {} }, () => {}));
  assert.deepEqual(routes, [
    'GET /',
    'POST /create',
    'PUT /update/:id',
    'DELETE /delete/:id',
    'GET /option',
    'GET /:id'
  ]);
});

test('router polygon dan selection mendaftarkan endpoint utama', () => {
  const polygonRoutes = routesOf(createPolygonRouter({ query() {} }, () => {}));
  const selectionRoutes = routesOf(createSelectionRouter({ query() {} }));
  assert.deepEqual(polygonRoutes, [
    'GET /',
    'GET /:id',
    'POST /create',
    'PUT /update/:id',
    'DELETE /delete/:id'
  ]);
  assert.deepEqual(selectionRoutes, ['POST /stats']);
});
