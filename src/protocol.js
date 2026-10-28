const DEFAULT_MAX_TITLE_BYTES = 8192;
const NONCE_PATTERN = /^[A-Za-z0-9._~-]{1,128}$/;
const SUPPORTED_GAMES = new Set(['cs2', 'r6', 'ow2', 'mr']);

function parseHash(hash) {
  const params = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const job = params.get('job');
  const nonce = params.get('q');
  const ids = (params.get('ids') || '').split(',').map((value) => value.trim()).filter(Boolean);
  const games = (params.get('games') || '').split(',').map((value) => value.trim()).filter(Boolean);
  return { job, nonce, ids, games };
}

function isValidNonce(nonce) {
  return typeof nonce === 'string' && NONCE_PATTERN.test(nonce);
}

function makeTitle(nonce, payload, maxTitleBytes = DEFAULT_MAX_TITLE_BYTES) {
  if (!isValidNonce(nonce)) throw new Error('invalid_nonce');
  const prefix = `STEAMHOURS1:${nonce}:`;
  const json = JSON.stringify(payload);
  if (Buffer.byteLength(prefix + json, 'utf8') > maxTitleBytes) {
    const compact = JSON.stringify({ ok: false, error: 'title_too_large' });
    if (Buffer.byteLength(prefix + compact, 'utf8') > maxTitleBytes) throw new Error('title_too_large');
    return prefix + compact;
  }
  return prefix + json;
}

module.exports = { parseHash, isValidNonce, makeTitle, SUPPORTED_GAMES, DEFAULT_MAX_TITLE_BYTES };
