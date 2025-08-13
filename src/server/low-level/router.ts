/**
 * Minimal JSON-RPC router for the low-level server.
 * It expects that the HTTP layer injects Authorization in req.headers and passes it into extra.headers.
 */
import { Request, Response } from "express";
import { buildExtraFromHttpRequest } from "@nevermined-io/payments/mcp";

export function createLowLevelRouter(registry: {
  tools: Map<string, any>;
  resources: Map<string, any>;
  prompts: Map<string, any>;
  authenticateMeta?: (extra: any, method: string) => Promise<any>;
}) {
  return async function handle(req: Request, res: Response) {
    try {
      if (req.method !== "POST") {
        res
          .status(405)
          .json({ error: { code: -32600, message: "Only POST is supported" } });
        return;
      }

      const body = req.body;
      if (!body || typeof body !== "object") {
        res
          .status(400)
          .json({ error: { code: -32600, message: "Invalid request" } });
        return;
      }

      // Gate MCP initialize and list operations requiring Authorization header
      const gatedMethods = new Set([
        "initialize",
        "tools/list",
        "resources/list",
        "prompts/list",
      ]);
      const method = (body as any).method as string | undefined;
      const extra = buildExtraFromHttpRequest(req);
      if (
        typeof method === "string" &&
        gatedMethods.has(method) &&
        registry.authenticateMeta
      ) {
        try {
          await registry.authenticateMeta(extra, method);
        } catch (err: any) {
          res.status(200).json({
            jsonrpc: "2.0",
            error: {
              code: err?.code ?? -32003,
              message: err?.message || "Payment required",
            },
            id: (body as any).id ?? null,
          });
          return;
        }
      }

      if (body.method === "initialize") {
        // Return a minimal initialize response compatible with MCP
        res.json({
          jsonrpc: "2.0",
          id: body.id ?? null,
          result: {
            protocolVersion: "2024-11-05",
            serverInfo: { name: "weather-mcp-low", version: "0.1.0" },
            capabilities: {
              tools: true,
              prompts: true,
              resources: true,
            },
          },
        });
        return;
      }

      if (body.method === "tools/call" && body.params?.name) {
        const handler = registry.tools.get(body.params.name);
        if (!handler) {
          res
            .status(404)
            .json({ error: { code: -32601, message: "Tool not found" } });
          return;
        }
        const result = await handler(body.params.arguments ?? {}, extra);
        res.json({ jsonrpc: "2.0", result, id: body.id ?? null });
        return;
      }

      if (body.method === "resources/read" && body.params?.uri) {
        const name = "weather.today"; // Example mapping; real impl should map uri->resource name
        const handler = registry.resources.get(name);
        if (!handler) {
          res
            .status(404)
            .json({ error: { code: -32601, message: "Resource not found" } });
          return;
        }
        const url = new URL(body.params.uri);
        const result = await handler(url, {}, extra);
        res.json({ jsonrpc: "2.0", result, id: body.id ?? null });
        return;
      }

      if (body.method === "prompts/call" && body.params?.name) {
        const handler = registry.prompts.get(body.params.name);
        if (!handler) {
          res
            .status(404)
            .json({ error: { code: -32601, message: "Prompt not found" } });
          return;
        }
        const result = await handler(body.params.arguments ?? {}, extra);
        res.json({ jsonrpc: "2.0", result, id: body.id ?? null });
        return;
      }

      res
        .status(400)
        .json({ error: { code: -32601, message: "Method not found" } });
    } catch (err: any) {
      console.error("Low-level router error:", err);
      res
        .status(500)
        .json({ error: { code: -32603, message: err?.message || "Internal" } });
    }
  };
}
