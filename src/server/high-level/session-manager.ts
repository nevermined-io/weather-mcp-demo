/**
 * Session management for MCP transports (High-Level: Streamable HTTP)
 */
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ServerConfig } from "../../config/server-config.js";

/**
 * Manages MCP transport sessions
 */
export class SessionManager {
  private transports = new Map<string, StreamableHTTPServerTransport>();

  constructor(private config: ServerConfig) {}

  /**
   * Create a new transport with session management
   */
  createTransport(): StreamableHTTPServerTransport {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableDnsRebindingProtection: true,
      allowedHosts: this.config.allowedHosts,
      onsessioninitialized: (sessionId: string) => {
        this.transports.set(sessionId, transport);
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        this.transports.delete(transport.sessionId);
      }
    };

    return transport;
  }

  /**
   * Get existing transport by session ID
   */
  getTransport(sessionId: string): StreamableHTTPServerTransport | undefined {
    return this.transports.get(sessionId);
  }

  /**
   * Check if session exists
   */
  hasSession(sessionId: string): boolean {
    return this.transports.has(sessionId);
  }

  /**
   * Remove transport from session map
   */
  removeTransport(sessionId: string): boolean {
    return this.transports.delete(sessionId);
  }
}
