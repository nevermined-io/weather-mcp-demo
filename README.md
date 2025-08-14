[![banner](https://raw.githubusercontent.com/nevermined-io/assets/main/images/logo/banner_logo.png)](https://nevermined.io)

## Weather MCP (High-Level and Low-Level servers)

Minimal MCP server exposing a `weather.today(city)` tool, a `weather://today/{city}` resource and a `weather.ensureCity` prompt. Includes both a High-Level server (SDK `McpServer` + Streamable HTTP) and a Low-Level server (manual JSON‑RPC routing) to demonstrate Nevermined Payments integration.

### About this demo

This repository is a reference/demo project used to test and validate the Model Context Protocol (MCP) integration inside Nevermined's TypeScript SDK `@nevermined-io/payments`. It showcases how to protect MCP tools, resources and prompts with the paywall, both in a High‑Level (SDK `McpServer` + Streamable HTTP) server and a Low‑Level JSON‑RPC server. It is intended for examples, local experimentation and integration tests, not as production‑ready code.

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

### Client demo (High-Level)

```bash
# default city Madrid
yarn client

# custom city
yarn client Paris
### Client demo (Low-Level)

```bash
# default city Madrid
yarn tsx src/client-low-level.ts

# custom city
yarn tsx src/client-low-level.ts Paris
```

```

### Nevermined auth

Client obtains an access token with its `NVM_API_KEY` and sends it as `Authorization: Bearer ...`. The server requires `Authorization` and performs a lightweight validation (custom JSON‑RPC error `-32003` if unauthorized).

Server env:

```bash
export NVM_SERVER_API_KEY=...     # Server key (builder/agent owner)
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

Low-Level client env:

```bash
export MCP_LOW_ENDPOINT=http://localhost:3000/mcp-low
export NVM_API_KEY=...
yarn tsx src/client-low-level.ts Madrid
```

### MCP Inspector (over HTTP)

```bash
yarn inspector
```

This runs `yarn dlx @modelcontextprotocol/inspector connect http://localhost:3000/mcp`.

### Environment

- `PORT` (default 3000)
- `ALLOWED_HOSTS` for DNS-rebind protection (default `127.0.0.1,localhost`)

### Endpoints (High-Level)

- `POST /mcp` — JSON-RPC requests (initialize handled here; server-side sessions)
- `GET /mcp` — SSE stream for server notifications
- `DELETE /mcp` — session termination
- `GET /healthz` — simple health check

### Endpoints (Low-Level)

- `POST /mcp-low` — Minimal JSON-RPC with manual routing and Authorization header passthrough
- `GET /healthz-low` — simple health check

### Acceptance checklist

- List Tools shows `weather.today`
- Calling `weather.today` with `{ "city": "Madrid" }` returns a text summary and a `resource_link` to `weather://today/Madrid`
- Reading that resource returns JSON with the `TodayWeather` fields

### Notes

- DNS-rebind protection is enabled; `ALLOWED_HOSTS` defaults to `127.0.0.1,localhost` and their `:PORT` variants.
- Inspector requests do not include `Authorization` headers; use the client demo for auth tests.

## Tutorial: Protecting an MCP server with Nevermined (Paywall + Credits Burn)

This guide shows how to protect your MCP tools with Nevermined so that only subscribed users can access them, and how to burn credits after each call.

### 1) Install and configure

```bash
yarn add @nevermined-io/payments
```

Server environment:

```bash
export NVM_API_KEY=...            # Builder/agent owner API key
export NVM_AGENT_ID=did:nv:...    # Your agent id registered in Nevermined
export NVM_ENV=staging_sandbox    # or production
```

Client (subscriber) will use its own `NVM_API_KEY` to obtain an access token and send it as `Authorization: Bearer ...`.

### 2) Initialize Nevermined in your MCP server

```ts
import { Payments } from '@nevermined-io/payments'

const nvmApiKey = process.env.NVM_API_KEY!
const environment = process.env.NVM_ENV || 'staging_sandbox'
const payments = Payments.getInstance({ nvmApiKey, environment })

// Configure paywall defaults once
payments.mcp.configure({ agentId: process.env.NVM_AGENT_ID!, serverName: 'my-mcp' })
```

### 3) Wrap your tool handler with the paywall (works in both servers)

```ts
// Your original tool handler
async function myHandler(args: any) {
  // ... your logic
  return { content: [{ type: 'text', text: 'Hello World' }] }
}

// Protect it with paywall (single call). Burn 1 credit per call
const protectedHandler = payments.mcp.withPaywall(myHandler, { credits: 1n })

// High-Level
server.registerTool('my.namespace.tool', { inputSchema: { /* zod */ } }, protectedHandler)

// Low-Level
const tools = new Map([[ 'my.namespace.tool', protectedHandler ]])
```

What the paywall does:

- Extracts `Authorization` from the MCP HTTP headers automatically.
- Validates access with Nevermined (`startProcessingRequest`).
- If unauthorized, responds with a JSON‑RPC error `-32003` (and suggests plans when possible).
- Runs your handler.
- Burns credits via `redeemCreditsFromRequest` based on the `credits` option.

### 4) Client side

Use the Nevermined client to obtain an access token and pass it as `Authorization` to your MCP transport.

```ts
import { Payments } from '@nevermined-io/payments'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const subsPayments = Payments.getInstance({ nvmApiKey: process.env.NVM_API_KEY!, environment: 'staging_sandbox' })
const { accessToken } = await subsPayments.agents.getAgentAccessToken(process.env.NVM_PLAN_ID!, process.env.NVM_AGENT_ID!)

const transport = new StreamableHTTPClientTransport(new URL('http://localhost:3000/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
})
```

### 5) Error semantics

- Missing token → JSON‑RPC `-32003` (“Authorization required”).
- Invalid/not subscribed → JSON‑RPC `-32003` (“Payment required”, optionally with plan suggestions).
- Network/other errors → JSON‑RPC `-32002`.

### 6) Advanced

- Customize `credits` to a function that receives a context `{ args, result, request }` and returns a bigint.
- Use `payments.mcp.decorateTool` to register and protect in one step.

### Example: dynamic credits and resource burning

- Dynamic credits on tool calls (e.g., random 1..10 credits per call):

```ts
const handler = payments.mcp.withPaywall(myHandler, {
  credits: () => BigInt(1 + Math.floor(Math.random() * 10)),
})
```

- Burn 1 credit for resource reads (weather-today):

```ts
server.registerResource(
  'weather-today',
  new ResourceTemplate('weather://today/{city}', { list: undefined }),
  { title: "Today's Weather Resource", mimeType: 'application/json' },
  async (uri, { city }, extra) => {
    const headers = extra?.requestInfo?.headers ?? {}
    const raw = headers['authorization'] ?? headers['Authorization']
    const authHeader = Array.isArray(raw) ? raw[0] : raw
    if (!authHeader) throw { code: -32003, message: 'Authorization required' }
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader
    const logicalUrl = `mcp://weather-mcp/resources/weather-today?city=${encodeURIComponent(String(city))}`
    const agentId = process.env.NVM_AGENT_ID!

    const start = await payments.requests.startProcessingRequest(agentId, token, logicalUrl, 'GET')
    if (!start?.balance?.isSubscriber) throw { code: -32003, message: 'Payment required' }

    const weather = await getTodayWeather(String(city))
    await payments.requests.redeemCreditsFromRequest(start.agentRequestId, token, 1n)
    return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(weather) }] }
  }
)
```


