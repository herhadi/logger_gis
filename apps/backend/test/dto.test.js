const test = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { MarkerDto } = require('../dist/marker/marker.dto');
const { PipaDto } = require('../dist/pipa/pipa.dto');
const { PolygonDto } = require('../dist/polygon/polygon.dto');
const { LoginDto } = require('../dist/auth/auth.dto');
const { SessionAuthGuard } = require('../dist/auth/session-auth.guard');

async function errors(Type, payload) {
  return validate(plainToInstance(Type, payload));
}

test('DTO marker menerima payload dasar dan menolak tipe invalid', async () => {
  assert.equal((await errors(MarkerDto, { tipe: 'acc', coords: [-6.2, 106.8] })).length, 0);
  assert.ok((await errors(MarkerDto, { tipe: 123, coords: 'invalid' })).length > 0);
});

test('DTO pipa dan polygon mewajibkan array koordinat', async () => {
  assert.equal((await errors(PipaDto, { coords: [[-6.2, 106.8], [-6.3, 106.9]] })).length, 0);
  assert.equal((await errors(PolygonDto, { coords: [[-6.2, 106.8], [-6.3, 106.9], [-6.4, 106.8]] })).length, 0);
  assert.ok((await errors(PipaDto, { coords: 'invalid' })).length > 0);
  assert.ok((await errors(PolygonDto, { coords: null })).length > 0);
});

test('DTO login mewajibkan username dan password', async () => {
  assert.equal((await errors(LoginDto, { username: 'admin', password: 'secret' })).length, 0);
  assert.ok((await errors(LoginDto, { username: '', password: 'secret' })).length > 0);
  assert.ok((await errors(LoginDto, { username: 'admin', password: 123 })).length > 0);
});

test('SessionAuthGuard menolak session kosong dan menerima user', () => {
  const guard = new SessionAuthGuard();
  const context = session => ({ switchToHttp: () => ({ getRequest: () => ({ session }) }) });
  assert.throws(() => guard.canActivate(context(null)), /Silakan login terlebih dahulu/);
  assert.equal(guard.canActivate(context({ user: { id: 1, role: 'admin' } })), true);
});
