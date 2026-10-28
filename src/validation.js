const GAME_APP_IDS = Object.freeze({
  cs2: 730,
  r6: 359550,
  ow2: 2357570,
  mr: 2767030
});

function positiveInteger(value, fallback, minimum = 1) {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number >= minimum ? number : fallback;
}

function validateSteamId(value) {
  return typeof value === 'string' && /^[0-9]{17}$/.test(value);
}

function uniqueStrings(values) {
  return [...new Set(values)];
}

function parseList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(',');
  return [];
}

function validateRequest(input, options = {}) {
  const maxPlayers = positiveInteger(options.maxPlayers, 12);
  const maxGames = positiveInteger(options.maxGames, 4);
  const ids = uniqueStrings(parseList(input && input.ids)
    .map((id) => typeof id === 'string' ? id.trim() : id)
    .filter((id) => id !== ''));
  const games = uniqueStrings(parseList(input && input.games)
    .map((game) => typeof game === 'string' ? game.trim() : game)
    .filter((game) => game !== ''));
  const errors = {};

  if (!ids.length) errors.ids = 'at_least_one_id_required';
  else if (ids.some((id) => !validateSteamId(id))) errors.ids = 'invalid_steam_id';
  else if (ids.length > maxPlayers) errors.ids = 'too_many_players';

  if (!games.length) errors.games = 'at_least_one_game_required';
  else if (games.some((game) => !Object.hasOwn(GAME_APP_IDS, game))) errors.games = 'invalid_game';
  else if (games.length > maxGames) errors.games = 'too_many_games';

  if (Object.keys(errors).length) {
    const error = new Error('invalid_request');
    error.statusCode = 400;
    error.details = errors;
    throw error;
  }
  return { ids, games };
}

module.exports = { GAME_APP_IDS, validateSteamId, validateRequest, positiveInteger };
