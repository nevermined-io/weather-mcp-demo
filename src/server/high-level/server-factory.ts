/**
 * Server factory to build a pre-configured MCP server (High-Level)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EnvironmentName, Payments } from "@nevermined-io/payments";
import { ServerConfig } from "../../config/server-config.js";
import { EnvironmentConfig } from "../../config/environment.js";
import {
  weatherToolHandler,
  weatherToolConfig,
  weatherToolCreditsCalculator,
} from "../../mcp/handlers/weather-tool.handler.js";
import {
  createWeatherResourceTemplate,
  weatherResourceConfig,
  weatherResourceHandler,
} from "../../mcp/handlers/weather-resource.handler.js";
import {
  weatherPromptHandler,
  weatherPromptConfig,
} from "../../mcp/handlers/weather-prompt.handler.js";

export function buildHighLevelServerFactory(
  serverConfig: ServerConfig,
  envConfig: EnvironmentConfig
) {
  const payments = Payments.getInstance({
    nvmApiKey: envConfig.nvmApiKey,
    environment: envConfig.nvmEnvironment as EnvironmentName,
  });
  payments.mcp.configure({
    agentId: envConfig.nvmAgentId,
    serverName: serverConfig.serverName,
  });

  const resourceTemplate = createWeatherResourceTemplate();

  function createServerInstance(): McpServer {
    const server = new McpServer({
      name: serverConfig.serverName,
      version: serverConfig.version,
    });

    const protectedWeatherHandler = payments.mcp.withPaywall(
      weatherToolHandler,
      {
        kind: "tool",
        name: "weather.today",
        credits: weatherToolCreditsCalculator,
      }
    );
    server.registerTool(
      "weather.today",
      weatherToolConfig,
      protectedWeatherHandler
    );

    const { registerResource } = payments.mcp.attach(server);
    registerResource(
      "weather.today",
      resourceTemplate,
      weatherResourceConfig,
      weatherResourceHandler,
      { credits: weatherToolCreditsCalculator }
    );

    const protectedPromptHandler = payments.mcp.withPaywall(
      weatherPromptHandler,
      {
        kind: "prompt",
        name: "weather.ensureCity",
        credits: 0n,
      }
    );
    server.registerPrompt(
      "weather.ensureCity",
      weatherPromptConfig,
      protectedPromptHandler
    );

    return server;
  }

  const authenticateMeta = async (extra: any, method: string) => {
    const mcpAny = payments.mcp as any;
    if (mcpAny && typeof mcpAny.authenticateMeta === "function") {
      return mcpAny.authenticateMeta(extra, method);
    }
    // Fallback: just ensure Authorization is present to avoid exposing meta without token
    const hasAuth = !!(
      extra &&
      extra.requestInfo &&
      extra.requestInfo.headers &&
      (extra.requestInfo.headers.authorization ||
        (extra.requestInfo.headers as any).Authorization)
    );
    if (!hasAuth) {
      throw Object.assign(new Error("Authorization required"), {
        code: -32003,
      });
    }
    return { ok: true } as any;
  };

  return { createServerInstance, authenticateMeta };
}
