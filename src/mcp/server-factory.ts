/**
 * Server factory to build a pre-configured MCP server (tools/resources/prompts registered)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EnvironmentName, Payments } from "@nevermined-io/payments";
import { ServerConfig } from "../config/server-config.js";
import { EnvironmentConfig } from "../config/environment.js";
import {
  weatherToolHandler,
  weatherToolConfig,
  weatherToolCreditsCalculator,
} from "./handlers/weather-tool.handler.js";
import {
  createWeatherResourceTemplate,
  weatherResourceConfig,
  weatherResourceHandler,
} from "./handlers/weather-resource.handler.js";
import {
  weatherPromptHandler,
  weatherPromptConfig,
} from "./handlers/weather-prompt.handler.js";

/**
 * Build a server creator function once at startup, and use it per-session to get a new MCP server instance.
 */
export function buildWeatherServerFactory(
  serverConfig: ServerConfig,
  envConfig: EnvironmentConfig
) {
  // Pre-create Payments client and configure MCP paywall once
  const payments = Payments.getInstance({
    nvmApiKey: envConfig.nvmApiKey,
    environment: envConfig.nvmEnvironment as EnvironmentName,
  });
  payments.mcp.configure({
    agentId: envConfig.nvmAgentId,
    serverName: serverConfig.serverName,
  });

  const resourceTemplate = createWeatherResourceTemplate();

  return function createServerInstance(): McpServer {
    const server = new McpServer({
      name: serverConfig.serverName,
      version: serverConfig.version,
    });

    // Protected tool with paywall
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

    // Protected resource, alternative calling with attach()
    const { registerResource } = payments.mcp.attach(server);
    registerResource(
      "weather.today",
      resourceTemplate,
      weatherResourceConfig,
      weatherResourceHandler,
      { credits: weatherToolCreditsCalculator }
    );

    // Protected prompt with paywall (0 credits by default)
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
  };
}
