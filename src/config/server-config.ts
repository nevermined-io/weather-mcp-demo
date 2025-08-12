/**
 * Server configuration constants and utilities
 */
export interface ServerConfig {
  port: number;
  allowedHosts: string[];
  serverName: string;
  version: string;
}

/**
 * Create server configuration from environment variables
 */
export function createServerConfig(): ServerConfig {
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  const baseAllowedHosts = (process.env.ALLOWED_HOSTS || "127.0.0.1,localhost")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Include host:port variants for DNS-rebind protection
  const allowedHosts = Array.from(
    new Set(baseAllowedHosts.flatMap((h) => [h, `${h}:${port}`]))
  );

  return {
    port,
    allowedHosts,
    serverName: "weather-mcp",
    version: "0.1.0",
  };
}
