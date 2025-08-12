/**
 * MCP HTTP routes
 */
import { Request, Response } from "express";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { SessionManager } from "../transport/session-manager.js";

/**
 * Handle POST /mcp - client->server requests
 */
function createPostHandler(
  sessionManager: SessionManager,
  createServerInstance: () => any
) {
  return async (req: Request, res: Response) => {
    try {
      const sessionId = req.header("mcp-session-id") ?? undefined;
      let transport;

      // Debug logging
      try {
        const sample =
          typeof req.body === "string" ? req.body : JSON.stringify(req.body);
        console.log("[mcp POST] body snippet:", sample?.slice(0, 200));
      } catch {
        // Ignore logging errors
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

/**
 * Handle GET /mcp - SSE server->client notifications
 */
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

/**
 * Handle DELETE /mcp - terminate session
 */
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

/**
 * Setup MCP routes on Express app
 */
export function setupMcpRoutes(
  app: any,
  sessionManager: SessionManager,
  createServerInstance: () => any
) {
  app.post("/mcp", createPostHandler(sessionManager, createServerInstance));
  app.get("/mcp", createGetHandler(sessionManager));
  app.delete("/mcp", createDeleteHandler(sessionManager));
}
