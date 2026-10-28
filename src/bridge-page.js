function getBridgePage() {
  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8"><title>Steam bridge</title></head>',
    '<body><script>',
    '(() => {',
    "  const debug = new URLSearchParams(window.location.search).get('debug') === '1';",
    "  const show = (message) => { if (debug) document.body.textContent = message; };",
    "  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));",
    "  const job = params.get('job');",
    "  const nonce = params.get('q');",
    "  const nonceValid = typeof nonce === 'string' && /^[A-Za-z0-9._~-]{1,128}$/.test(nonce);",
    "  if (job !== 'steam_hours' || !nonceValid) { show('No valid Steam hours job.'); return; }",
    "  const ids = (params.get('ids') || '').split(',').map(value => value.trim()).filter(Boolean);",
    "  const games = (params.get('games') || '').split(',').map(value => value.trim()).filter(Boolean);",
    "  const validId = value => /^[0-9]{17}$/.test(value);",
    "  const validGames = new Set(['cs2', 'r6', 'ow2', 'mr']);",
    "  const errorTitle = () => { document.title = 'STEAMHOURS1:' + nonce + ':' + JSON.stringify({ok:false,error:'bridge_error'}); };",
    "  if (!ids.length || ids.some(id => !validId(id)) || !games.length || games.some(game => !validGames.has(game))) { errorTitle(); return; }",
    "  fetch('/api/steam-hours', { method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({ids, games}) })",
    "    .then(response => { if (!response.ok) throw new Error('api_error'); return response.json(); })",
    "    .then(payload => { document.title = 'STEAMHOURS1:' + nonce + ':' + JSON.stringify(payload); })",
    "    .catch(() => { errorTitle(); });",
    '})();',
    '</script></body></html>'
  ].join('\n');
}

module.exports = { getBridgePage };
