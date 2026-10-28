const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../src/server');
const { fetchPlayerResults, fetchSteamGames, isMockEnabled } = require('../src/steam');

async function withServer(options, callback) {
  const server = createServer({
    env: { MOCK_STEAM_API: 'true', NODE_ENV: 'development', ...options?.env },
    config: { rateLimit: 100, ...(options?.config || {}) },
    fetchImpl: options?.fetchImpl
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('mock mode is deterministic and disabled in production', () => {
  assert.equal(isMockEnabled({ MOCK_STEAM_API: 'true', NODE_ENV: 'development' }), true);
  assert.equal(isMockEnabled({ MOCK_STEAM_API: 'true', NODE_ENV: 'production' }), false);
});

test('POST API returns deterministic mock data and private profiles', async () => {
  await withServer({}, async (base) => {
    const response = await fetch(`${base}/api/steam-hours`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: ['76561198000000001', '76561198000000099'], games: ['cs2', 'r6'] })
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.players['76561198000000001'].cs2.hours, 23);
    assert.deepEqual(payload.players['76561198000000099'].cs2, { hours: null, public: false, owned: null });
  });
});

test('GET API accepts comma-separated lists', async () => {
  await withServer({}, async (base) => {
    const response = await fetch(`${base}/api/steam-hours?ids=76561198000000001&games=cs2`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).players['76561198000000001'].cs2.owned, true);
  });
});

test('API rejects invalid requests and oversize bodies', async () => {
  await withServer({ config: { maxPlayers: 1, maxBodyBytes: 20 } }, async (base) => {
    const invalid = await fetch(`${base}/api/steam-hours`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"ids":[]}'
    });
    assert.equal(invalid.status, 400);
    const tooLarge = await fetch(`${base}/api/steam-hours`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(100)
    });
    assert.equal(tooLarge.status, 413);
  });
});

test('individual Steam failures are reported without failing other players', async () => {
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    if (url.searchParams.get('steamid').endsWith('002')) throw new Error('network');
    return { ok: true, json: async () => ({ response: { game_count: 1, games: [{ appid: 730, playtime_forever: 60 }] } }) };
  };
  const result = await fetchPlayerResults(['76561198000000001', '76561198000000002'], ['cs2'], {
    env: { STEAM_WEB_API_KEY: 'server-only' }, fetchImpl, concurrency: 1
  });
  assert.equal(calls, 2);
  assert.equal(result.players['76561198000000001'].cs2.hours, 1);
  assert.equal(result.errors['76561198000000002'], 'steam_api_error');
});

test('Steam request timeout aborts the request', async () => {
  const fetchImpl = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    });
  });
  await assert.rejects(
    fetchSteamGames('76561198000000001', { env: { STEAM_WEB_API_KEY: 'server-only' }, fetchImpl, timeoutMs: 5 }),
    (error) => error.code === 'steam_timeout'
  );
});
