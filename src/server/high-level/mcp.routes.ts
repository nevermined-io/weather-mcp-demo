/**
 * MCP HTTP routes (High-Level Server)
 */
import { Request, Response } from "express";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { SessionManager } from "./session-manager.js";

// Methods from MCP protocol whose responses can leak server capabilities.
// We gate them requiring Authorization header presence before delegating.
const GATED_METHODS = new Set(["tools/list", "resources/list", "prompts/list"]);

function extractAuthHeader(req: Request): string | undefined {
  // Express normalizes header names to lowercase
  const header = req.header("authorization") || req.header("Authorization");
  return header || undefined;
}

function shouldGateRequest(body: any): boolean {
  if (!body || typeof body !== "object") return false;
  const method = (body as any).method;
  return (
    typeof method === "string" &&
    (GATED_METHODS.has(method) || method === "initialize")
  );
}

function createPostHandler(
  sessionManager: SessionManager,
  createServerInstance: () => any
) {
  return async (req: Request, res: Response) => {
    try {
      const sessionId = req.header("mcp-session-id") ?? undefined;
      let transport;

      try {
        const sample =
          typeof req.body === "string" ? req.body : JSON.stringify(req.body);
        console.log("[mcp POST] body snippet:", sample?.slice(0, 200));
      } catch {}

      // Authorization gating for MCP initialize and list operations
      if (shouldGateRequest(req.body)) {
        const auth = extractAuthHeader(req);
        if (!auth) {
          res.status(200).json({
            jsonrpc: "2.0",
            error: {
              code: -32003,
              message: "Payment required: missing Authorization header",
            },
            id: req.body?.id ?? null,
          });
          return;
        }
      }

      if (sessionId && sessionManager.hasSession(sessionId)) {
        transport = sessionManager.getTransport(sessionId);
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = sessionManager.createTransport();
        const server = createServerInstance();
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
  };
}

function createGetHandler(sessionManager: SessionManager) {
  return async (req: Request, res: Response) => {
    try {
      const sessionId = req.header("mcp-session-id") ?? undefined;
      if (!sessionId || !sessionManager.hasSession(sessionId)) {
        res.status(400).send("Invalid or missing session ID");
        return;
      }
      const transport = sessionManager.getTransport(sessionId)!;
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
  };
}

function createDeleteHandler(sessionManager: SessionManager) {
  return async (req: Request, res: Response) => {
    try {
      const sessionId = req.header("mcp-session-id") ?? undefined;
      if (!sessionId || !sessionManager.hasSession(sessionId)) {
        res.status(400).send("Invalid or missing session ID");
        return;
      }
      const transport = sessionManager.getTransport(sessionId)!;
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
  };
}

export function setupHighLevelMcpRoutes(
  app: any,
  sessionManager: SessionManager,
  createServerInstance: () => any,
  authenticateMeta?: (extra: any, method: string) => Promise<any>
) {
  app.post(
    "/mcp",
    (req: Request, res: Response, next: any) => {
      // If it's a meta operation, perform full authentication here for consistency with paywalled calls
      try {
        const body: any = req.body;
        const method = body?.method;
        const gated =
          typeof method === "string" &&
          (GATED_METHODS.has(method) || method === "initialize");
        if (!gated || !authenticateMeta) return next();
        const extra = { requestInfo: { headers: req.headers as any } };
        authenticateMeta(extra, method)
          .then(() => next())
          .catch((err: any) => {
            res.status(200).json({
              jsonrpc: "2.0",
              error: {
                code: err?.code ?? -32003,
                message: err?.message || "Payment required",
              },
              id: body?.id ?? null,
            });
          });
      } catch {
        next();
      }
    },
    createPostHandler(sessionManager, createServerInstance)
  );
  app.get("/mcp", createGetHandler(sessionManager));
  app.delete("/mcp", createDeleteHandler(sessionManager));
}
