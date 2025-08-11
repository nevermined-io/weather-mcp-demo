/**
 * @file Express-based MCP server using Streamable HTTP transport.
 * Prepares for future Nevermined authorization by stubbing an Authorization middleware.
 */

import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
dotenv.config();
import { randomUUID } from "node:crypto";
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  getTodayWeather,
  CityNotFoundError,
  DownstreamError,
  sanitizeCity,
  TodayWeather,
} from "./weather.js";
import { Payments } from "@nevermined-io/payments";

// --- Configuration ---
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const BASE_ALLOWED_HOSTS = (process.env.ALLOWED_HOSTS || "127.0.0.1,localhost")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
// Include host:port variants for DNS-rebind protection since Host header often includes the port
const ALLOWED_HOSTS = Array.from(
  new Set(BASE_ALLOWED_HOSTS.flatMap((h) => [h, `${h}:${PORT}`]))
);

// --- Express app ---
const app = express();
app.use(express.json({ limit: "1mb" }));

// Authorization middleware (stub for Nevermined integration)
app.use((req: Request, _res: Response, next: NextFunction) => {
  const auth = req.header("authorization") || null;
  // Attach for potential per-session usage in handlers later
  (req as any).nvmAuth = auth;
  // Minimal logging only; do not log tokens in production
  if (auth) {
    console.log(`[auth] Authorization header present (length=${auth.length})`);
  }
  next();
});

// Session map of transports
const transports = new Map<string, StreamableHTTPServerTransport>();

/**
 * Create and wire a new MCP server instance for a session.
 */
async function createWeatherServer(): Promise<McpServer> {
  const server = new McpServer({ name: "weather-mcp", version: "0.1.0" });

  // Tool: weather.today
  server.registerTool(
    "weather.today",
    {
      title: "Today's Weather",
      description: "Get today's weather summary for a city",
      inputSchema: { city: z.string().min(2).max(80) },
    },
    async ({ city }, extra) => {
      try {
        const sanitized = sanitizeCity(city);

        /**
         * Basic Authorization gate using Authorization header.
         * Extracts the authorization header from the extra parameter, if available.
         * Throws an error if the authorization header is missing.
         */
        // Extract Authorization from RequestHandlerExtra.requestInfo.headers
        const headers = extra?.requestInfo?.headers ?? {};
        const rawAuth = (headers["authorization"] ??
          (headers as any)["Authorization"]) as string | string[] | undefined;
        const authHeader: string | undefined = Array.isArray(rawAuth)
          ? rawAuth[0]
          : rawAuth;
        if (!authHeader) {
          throw { code: -32003, message: "Authorization required" };
        }

        // Placeholder: server-side Payments instance for future validation/metering
        const nvmApiKey =
          process.env.NVM_API_KEY || process.env.NVM_SERVER_API_KEY;
        const environment = (process.env.NVM_ENV || "staging_sandbox") as any;
        if (nvmApiKey) {
          try {
            // Optional lightweight validation: treat MCP tool call as POST to a logical endpoint
            const payments = Payments.getInstance({ nvmApiKey, environment });
            const agentId = process.env.NVM_AGENT_ID || "weather-agent";
            const requestedUrl = `mcp://weather-mcp/tools/weather.today?city=${encodeURIComponent(
              sanitized
            )}`;
            const method = "POST";
            const validation = await payments.requests.isValidRequest(
              agentId,
              authHeader,
              requestedUrl,
              method
            );
            if (!validation.isValidRequest) {
              throw {
                code: -32003,
                message: "Unauthorized: invalid access token",
              };
            }
          } catch (e) {
            // Surface 402-like semantics as custom JSON-RPC error
            throw e;
          }
        }

        const weather: TodayWeather = await getTodayWeather(sanitized);
        const text =
          `Weather for ${weather.city}, ${weather.country ?? ""} (tz: ${
            weather.timezone
          })\n` +
          `High: ${weather.tmaxC ?? "n/a"}°C, Low: ${
            weather.tminC ?? "n/a"
          }°C, ` +
          `Precipitation: ${weather.precipitationMm ?? "n/a"}mm, ` +
          `Conditions: ${weather.weatherText ?? "n/a"}`;

        return {
          content: [
            { type: "text" as const, text },
            {
              type: "resource_link" as const,
              uri: `weather://today/${encodeURIComponent(weather.city)}`,
              name: `weather today ${weather.city}`,
              mimeType: "application/json",
              description: "Raw JSON for today's weather",
            },
          ],
        };
      } catch (err) {
        if (err instanceof CityNotFoundError) {
          // JSON-RPC custom error code -32004
          throw {
            code: -32004,
            message: err.message,
            data: { city },
          };
        }
        if (err instanceof DownstreamError) {
          throw {
            code: -32002,
            message: err.message,
          };
        }
        if (
          typeof err === "object" &&
          err &&
          (err as any).code &&
          (err as any).message
        ) {
          throw err as any;
        }
        throw {
          code: -32002,
          message: "Unexpected error fetching weather",
        };
      }
    }
  );

  // Resource: weather://today/{city}
  server.registerResource(
    "weather-today",
    new ResourceTemplate("weather://today/{city}", { list: undefined }),
    {
      title: "Today's Weather Resource",
      description: "JSON for today's weather by city",
      mimeType: "application/json",
    },
    async (uri, { city }) => {
      try {
        const cityParam: string = Array.isArray(city) ? city[0] : city;
        const decodedCity = (() => {
          try {
            return decodeURIComponent(cityParam);
          } catch {
            return cityParam;
          }
        })();
        const sanitized = sanitizeCity(decodedCity);
        const weather = await getTodayWeather(sanitized);
        return {
          contents: [
            {
              uri: uri.href,
              text: JSON.stringify(weather),
              mimeType: "application/json",
            },
          ],
        };
      } catch (err) {
        if (err instanceof CityNotFoundError) {
          throw {
            code: -32004,
            message: err.message,
            data: { city },
          };
        }
        if (err instanceof DownstreamError) {
          throw { code: -32002, message: err.message };
        }
        throw { code: -32002, message: "Unexpected error fetching resource" };
      }
    }
  );

  // Prompt: weather.ensureCity
  server.registerPrompt(
    "weather.ensureCity",
    {
      title: "Ensure city provided",
      description: "Guide to call weather.today with a city",
      argsSchema: { city: z.string().min(2).max(80) },
    },
    ({ city }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Please call the tool weather.today with { "city": "${sanitizeCity(
              city
            )}" }`,
          },
        },
      ],
    })
  );

  return server;
}

// Utility to create a transport with session management and DNS rebind protection
function createTransport(): StreamableHTTPServerTransport {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableDnsRebindingProtection: true,
    allowedHosts: ALLOWED_HOSTS,
    onsessioninitialized: (sessionId: string) => {
      transports.set(sessionId, transport);
    },
  });
  transport.onclose = () => {
    if (transport.sessionId) transports.delete(transport.sessionId);
  };
  return transport;
}

// POST /mcp: client->server requests (includes initialize)
app.post("/mcp", async (req: Request, res: Response) => {
  try {
    const sessionId = req.header("mcp-session-id") ?? undefined;
    let transport: StreamableHTTPServerTransport | undefined;

    // Minimal debug to inspect initialization/body shape
    try {
      const sample =
        typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      console.log("[mcp POST] body snippet:", sample?.slice(0, 200));
    } catch {}

    if (sessionId && transports.has(sessionId)) {
      transport = transports.get(sessionId);
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = createTransport();
      const server = await createWeatherServer();
      await server.connect(transport);
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: No valid session ID provided",
        },
        id: null,
      });
      return;
    }

    await transport!.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("Error handling MCP POST:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// GET /mcp: SSE server->client notifications
app.get("/mcp", async (req: Request, res: Response) => {
  try {
    const sessionId = req.header("mcp-session-id") ?? undefined;
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
  } catch (err) {
    console.error("Error handling MCP GET:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// DELETE /mcp: terminate session
app.delete("/mcp", async (req: Request, res: Response) => {
  try {
    const sessionId = req.header("mcp-session-id") ?? undefined;
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
  } catch (err) {
    console.error("Error handling MCP DELETE:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// Optional health check
app.get("/healthz", (_req: Request, res: Response) => {
  res.status(200).json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`weather-mcp listening on http://localhost:${PORT}`);
});
