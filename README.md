## Weather MCP (Streamable HTTP, TypeScript)

Minimal MCP server exposing a `weather.today(city)` tool, a `weather://today/{city}` resource and a `weather.ensureCity` prompt. Ready for future Nevermined Authorization integration.

### Requirements

- Node.js >= 18
- Yarn (Berry or Classic)

### Install

```bash
yarn install
```

### Develop

```bash
yarn dev
```

### Build

```bash
yarn build
```

### Start (built)

```bash
yarn start
```

### Client demo

```bash
# default city Madrid
yarn client

# custom city
yarn client Paris
```

### Nevermined auth (initial integration)

Client obtains an access token with its `NVM_API_KEY` and sends it as `Authorization: Bearer ...`. The server requires `Authorization` and performs a lightweight validation (custom JSON‑RPC error `-32003` if unauthorized).

Server env:

```bash
export NVM_API_KEY=...            # Server key (builder/agent owner)
export NVM_AGENT_ID=weather-agent # Logical agent id used in validation (or your real ID)
export NVM_ENV=staging_sandbox    # optional
yarn dev
```

Client env:

```bash
export MCP_ENDPOINT=http://localhost:3000/mcp
export NVM_API_KEY=...            # Subscriber key
export NVM_PLAN_ID=...            # Plan that grants access
export NVM_AGENT_ID=...           # Agent id associated to the plan
yarn client Madrid
```

If auth is missing/invalid, the tool returns a JSON‑RPC error with code `-32003`.

### MCP Inspector (over HTTP)

```bash
yarn inspector
```

This runs `yarn dlx @modelcontextprotocol/inspector connect http://localhost:3000/mcp`.

### Environment

- `PORT` (default 3000)
- `ALLOWED_HOSTS` for DNS-rebind protection (default `127.0.0.1,localhost`)

### Endpoints

- `POST /mcp` — JSON-RPC requests (initialize handled here; server-side sessions)
- `GET /mcp` — SSE stream for server notifications
- `DELETE /mcp` — session termination
- `GET /healthz` — simple health check

### Acceptance checklist

- List Tools shows `weather.today`
- Calling `weather.today` with `{ "city": "Madrid" }` returns a text summary and a `resource_link` to `weather://today/Madrid`
- Reading that resource returns JSON with the `TodayWeather` fields

### Notes

- DNS-rebind protection is enabled; `ALLOWED_HOSTS` defaults to `127.0.0.1,localhost` and their `:PORT` variants.
- Inspector requests do not include `Authorization` headers; use the client demo for auth tests.


