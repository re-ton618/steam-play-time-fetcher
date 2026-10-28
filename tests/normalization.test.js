const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSteamResponse } = require('../src/normalization');

test('normalizes public Steam response and floors minutes to hours', () => {
  assert.deepEqual(normalizeSteamResponse({ response: { game_count: 1, games: [{ appid: 730, playtime_forever: 1380 }] } }, ['cs2', 'r6']), {
    cs2: { hours: 23, public: true, owned: true },
    r6: { hours: 0, public: true, owned: false }
  });
});

test('normalizes private and unavailable Steam response', () => {
  assert.deepEqual(normalizeSteamResponse({ response: {} }, ['cs2']), {
    cs2: { hours: null, public: false, owned: null }
  });
});

test('handles missing response and missing games compactly', () => {
  assert.deepEqual(normalizeSteamResponse({}, ['mr']), {
    mr: { hours: null, public: false, owned: null }
  });
  assert.deepEqual(normalizeSteamResponse({ response: { game_count: 0, games: [] } }, ['mr']), {
    mr: { hours: 0, public: true, owned: false }
  });
});
