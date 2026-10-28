# Steam Hours Bridge

A lightweight, self-hosted Node.js HTTP bridge for a Deadlock Panorama HUD mod. It serves the hidden bridge page and the normalized Steam playtime API from the same origin. It does **not** contain a Panorama client or build a Deadlock VPK.

## Installation

Node.js 18 or newer is required (Node 20 is recommended).

```sh
npm install
cp .env.example .env
# Edit .env and set STEAM_WEB_API_KEY.
# On Node 20+, load it with:
node --env-file=.env src/server.js
# Or export variables in your shell and run:
npm start
```

The service listens on `PORT` (default `3000`). Node does not automatically load `.env` on older Node versions; use your process manager or shell to provide those variables. Do not commit `.env` or the Steam key.

## Environment variables

- `PORT`: HTTP port, default `3000`.
- `STEAM_WEB_API_KEY`: private Steam Web API key. Required unless mock mode is enabled.
- `MAX_PLAYERS`: maximum player IDs per request, default `12`.
- `MAX_GAMES`: maximum game keys per request, default `4`.
- `STEAM_REQUEST_CONCURRENCY`: maximum simultaneous Steam calls, default `3`.
- `STEAM_REQUEST_TIMEOUT_MS`: timeout per Steam call, default `8000`.
- `MAX_TITLE_BYTES`: conservative title-size budget, default `8192`.
- `MAX_BODY_BYTES`: POST body limit, default `16384`.
- `RATE_LIMIT_PER_MINUTE`: simple per-IP API limit, default `60`.
- `MOCK_STEAM_API`: set to `true` only for non-production development. It is never read from a URL.

## Local development and tests

```sh
npm run dev
npm test
```

Tests use fixtures and mocked fetch functions; they never make real Steam requests.

## Container usage

```sh
docker build -t steam-hours-bridge .
docker run --rm -p 3000:3000 \
  -e STEAM_WEB_API_KEY=replace_me \
  steam-hours-bridge
```

Pass configuration with environment variables or an environment file. The image runs as the unprivileged `node` user.

## Reverse proxy requirements

Terminate HTTPS at the reverse proxy and forward requests to the Node process. Preserve the URL fragment behavior: fragments are not sent to the proxy or server, so the browser must load `/` and process the hash locally. Proxy `/` and `/api/steam-hours` to the same upstream without rewriting the API path. Do not cache API responses or the bridge HTML, and do not inject scripts into the page. If adding CORS for development, configure an explicit origin; this service does not need CORS for normal same-origin use.

## Bridge URL and hash protocol

Example:

```text
https://example.com/?r=48291#job=steam_hours&q=48291&ids=76561198000000001&games=cs2,r6,ow2,mr
```

The page requires `job=steam_hours`. `q` is an alphanumeric request nonce (up to 128 characters), `ids` is a comma-separated list of decimal 17-digit SteamID64 values, and `games` is a comma-separated list of supported keys. The page POSTs the IDs and games to the same-origin API and sets the title to:

```text
STEAMHOURS1:<nonce>:<compact-json>
```

For example, a successful title payload is `{"ok":true,"players":{"76561198000000001":{"cs2":{"hours":23,"public":true,"owned":true}}}}`. If the API fails and a valid nonce exists, the page sets `STEAMHOURS1:<nonce>:{"ok":false,"error":"bridge_error"}`. Invalid or absent jobs do nothing; a debug message is displayed only with `?debug=1`.

## HTTP API

`POST /api/steam-hours` accepts:

```json
{"ids":["76561198000000001"],"games":["cs2","r6","ow2","mr"]}
```

`GET /api/steam-hours?ids=76561198000000001,76561198000000002&games=cs2,r6,ow2,mr` is equivalent. Responses are compact JSON. A player/game result has `hours` (whole hours rounded down), `public`, and `owned`:

- Public and owned: `{"hours":23,"public":true,"owned":true}`
- Public but not owned: `{"hours":0,"public":true,"owned":false}`
- Private/unavailable: `{"hours":null,"public":false,"owned":null}`

Individual upstream failures do not fail the entire request: they appear in an `errors` object while successful players remain in `players`.

## Supported games

| Key | Steam app ID |
|---|---:|
| `cs2` | `730` |
| `r6` | `359550` |
| `ow2` | `2357570` |
| `mr` | `2767030` |

The backend calls Steam's `IPlayerService/GetOwnedGames/v0001/` endpoint with `include_appinfo=0` and `include_played_free_games=1`. It never accepts an upstream URL from callers.

## Private profiles and mock mode

Steam returns an empty `response` for private or unavailable profiles. Those players receive `public:false`, `hours:null`, and `owned:null` for every requested game. A valid public profile with no matching game receives `public:true`, `hours:0`, and `owned:false`.

For deterministic local testing, set `MOCK_STEAM_API=true` and keep `NODE_ENV` different from `production`. Fixture IDs are `76561198000000001` and `76561198000000002`; unknown fixture IDs simulate a private profile. Production mode always disables mock mode.

## Security considerations

The Steam API key is read only from `process.env.STEAM_WEB_API_KEY`, sent only in a backend-to-Steam request, and is never included in HTML, browser JavaScript, API output, or logs. Requests have bounded body/player/game limits, timeout-bounded upstream calls, bounded concurrency, no retries, no arbitrary proxying, and a simple in-memory IP limiter. Use HTTPS, protect the endpoint with your reverse proxy if it is not intended to be public, and rotate the key if it is exposed.

The title budget uses compact JSON, omits raw Steam responses and profile metadata, and substitutes `{"ok":false,"error":"title_too_large"}` when a normalized response cannot fit the configured budget.

## Troubleshooting

- `steam_api_error`: check the key, outbound HTTPS access, and Steam API availability.
- `steam_timeout`: increase `STEAM_REQUEST_TIMEOUT_MS` only when appropriate.
- `invalid_request`: use decimal 17-digit SteamID64 values and the four supported game keys.
- Empty title: verify the URL has a valid hash, `job=steam_hours`, and a nonce; fragments are processed in the browser and are not visible to a reverse proxy.
- Mock results unexpectedly disabled: do not use `NODE_ENV=production` with `MOCK_STEAM_API=true`.
