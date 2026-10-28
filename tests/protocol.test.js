const test = require('node:test');
const assert = require('node:assert/strict');
const { parseHash, isValidNonce, makeTitle } = require('../src/protocol');

test('parses bridge hash parameters', () => {
  assert.deepEqual(parseHash('#job=steam_hours&q=48291&ids=76561198000000001,76561198000000001&games=cs2,r6'), {
    job: 'steam_hours', nonce: '48291', ids: ['76561198000000001', '76561198000000001'], games: ['cs2', 'r6']
  });
});

test('rejects invalid jobs and preserves a valid nonce', () => {
  assert.equal(parseHash('#job=other&q=abc').job, 'other');
  assert.equal(isValidNonce('48291'), true);
  assert.equal(isValidNonce('bad nonce'), false);
  assert.equal(makeTitle('48291', { ok: true }), 'STEAMHOURS1:48291:{"ok":true}');
});

test('protects compact title size', () => {
  assert.equal(makeTitle('n', { ok: true }, 8192).startsWith('STEAMHOURS1:n:'), true);
  assert.equal(makeTitle('n', { data: 'x'.repeat(100) }, 80), 'STEAMHOURS1:n:{"ok":false,"error":"title_too_large"}');
});
