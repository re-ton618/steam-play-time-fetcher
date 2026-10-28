const test = require('node:test');
const assert = require('node:assert/strict');
const { GAME_APP_IDS, validateSteamId, validateRequest } = require('../src/validation');

test('validates SteamID64 values and removes duplicate IDs', () => {
  assert.equal(validateSteamId('76561198000000001'), true);
  assert.equal(validateSteamId('123'), false);
  assert.deepEqual(validateRequest({ ids: ['76561198000000001', '76561198000000001'], games: ['cs2'] }), {
    ids: ['76561198000000001'], games: ['cs2']
  });
});

test('validates supported game keys and maps app IDs', () => {
  assert.deepEqual(GAME_APP_IDS, { cs2: 730, r6: 359550, ow2: 2357570, mr: 2767030 });
  assert.throws(() => validateRequest({ ids: ['76561198000000001'], games: ['bad'] }), /invalid_request/);
});

test('enforces player and game limits', () => {
  assert.throws(() => validateRequest({ ids: ['76561198000000001', '76561198000000002'], games: ['cs2'] }, { maxPlayers: 1 }), /invalid_request/);
  assert.throws(() => validateRequest({ ids: ['76561198000000001'], games: ['cs2', 'r6'] }, { maxGames: 1 }), /invalid_request/);
});
