const http = require('node:http');
const { validateRequest, positiveInteger } = require('./validation');
const { fetchPlayerResults } = require('./steam');
const { DEFAULT_MAX_TITLE_BYTES } = require('./protocol');
const { getBridgePage } = require('./bridge-page');

const API_PATH = '/api/steam-hours';

function loadConfig(env = process.env) {
  return {
    port: positiveInteger(env.PORT, 3000),
    maxPlayers: positiveInteger(env.MAX_PLAYERS, 12),
    maxGames: positiveInteger(env.MAX_GAMES, 4),
    concurrency: positiveInteger(env.STEAM_REQUEST_CONCURRENCY, 3),
    timeoutMs: positiveInteger(env.STEAM_REQUEST_TIMEOUT_MS, 8000),
    maxTitleBytes: positiveInteger(env.MAX_TITLE_BYTES, DEFAULT_MAX_TITLE_BYTES),
    maxBodyBytes: positiveInteger(env.MAX_BODY_BYTES, 16384),
    rateLimit: positiveInteger(env.RATE_LIMIT_PER_MINUTE, 60)
  };
}

function jsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(body);
}

function titleSafePayload(payload, maxTitleBytes) {
  const reservedPrefixBytes = Buffer.byteLength('STEAMHOURS1:' + 'x'.repeat(128) + ':');
  return Buffer.byteLength(JSON.stringify(payload)) + reservedPrefixBytes <= maxTitleBytes
    ? payload
    : { ok: false, error: 'title_too_large' };
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    let tooLarge = false;
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > maxBytes) {
        tooLarge = true;
        return;
      }
      if (!tooLarge) body += chunk;
    });
    req.on('end', () => {
      if (tooLarge) {
        const error = new Error('request_too_large');
        error.statusCode = 413;
        reject(error);
      } else resolve(body);
    });
    req.on('error', reject);
  });
}

function makeRateLimiter(limit) {
  const requests = new Map();
  return (address) => {
    const now = Date.now();
    const current = requests.get(address);
    if (!current || now - current.started >= 60_000) {
      requests.set(address, { started: now, count: 1 });
      return true;
    }
    current.count += 1;
    return current.count <= limit;
  };
}

function createServer(options = {}) {
  const env = options.env || process.env;
  const config = { ...loadConfig(env), ...(options.config || {}) };
  const fetchImpl = options.fetchImpl;
  const bridgePage = options.bridgePage || getBridgePage(config.maxTitleBytes);
  const allowRequest = makeRateLimiter(config.rateLimit);
  const steamOptions = { env, fetchImpl, timeoutMs: config.timeoutMs, concurrency: config.concurrency };

  return http.createServer(async (req, res) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    let requestUrl;
    try {
      requestUrl = new URL(req.url || '/', 'http://localhost');
    } catch {
      jsonResponse(res, 400, { ok: false, error: 'invalid_url' });
      return;
    }
    const clientAddress = req.socket.remoteAddress || 'unknown';

    if (requestUrl.pathname === '/' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(bridgePage);
      return;
    }
    if (requestUrl.pathname !== API_PATH || !['GET', 'POST'].includes(req.method)) {
      jsonResponse(res, 404, { ok: false, error: 'not_found' });
      return;
    }
    if (!allowRequest(clientAddress)) {
      jsonResponse(res, 429, { ok: false, error: 'rate_limited' });
      return;
    }

    try {
      let input;
      if (req.method === 'GET') {
        input = { ids: requestUrl.searchParams.get('ids'), games: requestUrl.searchParams.get('games') };
      } else {
        const rawBody = await readBody(req, config.maxBodyBytes);
        try {
          input = JSON.parse(rawBody || '{}');
        } catch {
          const error = new Error('invalid_json');
          error.statusCode = 400;
          throw error;
        }
      }
      const request = validateRequest(input, config);
      const payload = await fetchPlayerResults(request.ids, request.games, steamOptions);
      jsonResponse(res, 200, titleSafePayload(payload, config.maxTitleBytes));
    } catch (error) {
      const status = error.statusCode || 500;
      let payload;
      if (status === 400 && error.details) payload = { ok: false, error: 'invalid_request', details: error.details };
      else if (status === 413) payload = { ok: false, error: 'request_too_large' };
      else if (status === 400) payload = { ok: false, error: 'invalid_json' };
      else payload = { ok: false, error: 'bridge_error' };
      jsonResponse(res, status, payload);
    }
  });
}

if (require.main === module) {
  const config = loadConfig();
  createServer().listen(config.port, () => {
    console.log(`Steam hours bridge listening on port ${config.port}`);
  });
}

module.exports = { createServer, loadConfig, titleSafePayload, readBody };
