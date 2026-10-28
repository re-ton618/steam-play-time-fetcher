const { normalizeSteamResponse } = require('./normalization');

const DEFAULT_TIMEOUT_MS = 8000;
const MOCK_FIXTURES = Object.freeze({
  '76561198000000001': [
    { appid: 730, playtime_forever: 1380 },
    { appid: 359550, playtime_forever: 72240 },
    { appid: 2357570, playtime_forever: 24720 },
    { appid: 2767030, playtime_forever: 5220 }
  ],
  '76561198000000002': [
    { appid: 730, playtime_forever: 60 },
    { appid: 2767030, playtime_forever: 5220 }
  ]
});

function isMockEnabled(env = process.env) {
  return String(env.MOCK_STEAM_API || '').toLowerCase() === 'true' && env.NODE_ENV !== 'production';
}

function mockResponse(steamId) {
  const games = MOCK_FIXTURES[steamId];
  return games
    ? { response: { game_count: games.length, games: games.map((game) => ({ ...game })) } }
    : { response: {} };
}

async function fetchSteamGames(steamId, options = {}) {
  const env = options.env || process.env;
  if (isMockEnabled(env)) return mockResponse(steamId);
  const apiKey = env.STEAM_WEB_API_KEY;
  if (!apiKey) {
    const error = new Error('missing_steam_api_key');
    error.code = 'steam_api_error';
    throw error;
  }
  const timeoutMs = Number.isInteger(options.timeoutMs)
    ? options.timeoutMs
    : Number.parseInt(env.STEAM_REQUEST_TIMEOUT_MS, 10) || DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    const error = new Error('fetch_unavailable');
    error.code = 'steam_api_error';
    throw error;
  }
  let url;
  try {
    url = new URL('https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/');
    url.search = new URLSearchParams({
      key: apiKey,
      steamid: steamId,
      format: 'json',
      include_appinfo: '0',
      include_played_free_games: '1'
    });
  } catch (error) {
    error.code = 'steam_api_error';
    throw error;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response || !response.ok) {
      const error = new Error('steam_http_error');
      error.code = 'steam_api_error';
      throw error;
    }
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError' || controller.signal.aborted) {
      const timeoutError = new Error('steam_request_timeout');
      timeoutError.code = 'steam_timeout';
      throw timeoutError;
    }
    if (!error.code) error.code = 'steam_api_error';
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function mapWithConcurrency(items, limit, worker) {
  const results = Array.from({ length: items.length });
  let next = 0;
  async function consume() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, consume));
  return results;
}

async function fetchPlayerResults(ids, games, options = {}) {
  const concurrency = Math.max(
    1,
    Number.parseInt(options.concurrency || process.env.STEAM_REQUEST_CONCURRENCY, 10) || 3
  );
  const outcomes = await mapWithConcurrency(ids, concurrency, async (id) => {
    try {
      const response = await fetchSteamGames(id, options);
      return { id, result: normalizeSteamResponse(response, games) };
    } catch (error) {
      return { id, error: error.code || 'steam_api_error' };
    }
  });
  const players = {};
  const errors = {};
  for (const outcome of outcomes) {
    if (outcome.result) players[outcome.id] = outcome.result;
    else errors[outcome.id] = outcome.error;
  }
  const result = { ok: true, players };
  if (Object.keys(errors).length) result.errors = errors;
  return result;
}

module.exports = { fetchSteamGames, fetchPlayerResults, mapWithConcurrency, mockResponse, isMockEnabled };
