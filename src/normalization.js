const { GAME_APP_IDS } = require('./validation');

function emptyResult(publicProfile) {
  return {
    hours: publicProfile ? 0 : null,
    public: publicProfile,
    owned: publicProfile ? false : null
  };
}

function normalizeSteamResponse(body, games) {
  const response = body && body.response;
  const publicProfile = Boolean(response && (
    Object.prototype.hasOwnProperty.call(response, 'game_count') ||
    Array.isArray(response.games)
  ));
  const ownedGames = new Map();
  if (publicProfile && Array.isArray(response.games)) {
    for (const game of response.games) {
      if (game && Number.isInteger(game.appid)) ownedGames.set(game.appid, game);
    }
  }

  const result = {};
  for (const gameKey of games) {
    const game = ownedGames.get(GAME_APP_IDS[gameKey]);
    if (!publicProfile) {
      result[gameKey] = emptyResult(false);
    } else if (!game) {
      result[gameKey] = emptyResult(true);
    } else {
      const minutes = Number(game.playtime_forever);
      result[gameKey] = {
        hours: Number.isFinite(minutes) && minutes >= 0 ? Math.floor(minutes / 60) : 0,
        public: true,
        owned: true
      };
    }
  }
  return result;
}

module.exports = { normalizeSteamResponse };
