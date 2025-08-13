/**
 * Build a low-level MCP-like server using Payments low-level registry.
 * This bypasses @modelcontextprotocol high-level server and lets us wire JSON-RPC manually.
 */
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

export function buildLowLevelServerFactory(
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

  // Protect handlers and expose local maps for the router
  const protectedTool = payments.mcp.withPaywall(weatherToolHandler, {
    kind: "tool",
    name: "weather.today",
    credits: weatherToolCreditsCalculator,
  });
  const protectedResource = payments.mcp.withPaywall(weatherResourceHandler, {
    kind: "resource",
    name: "weather.today",
    credits: weatherToolCreditsCalculator,
  });
  const protectedPrompt = payments.mcp.withPaywall(weatherPromptHandler, {
    kind: "prompt",
    name: "weather.ensureCity",
    credits: 0n,
  });

  const tools = new Map<string, any>([["weather.today", protectedTool]]);
  const resources = new Map<string, any>([
    ["weather.today", protectedResource],
  ]);
  const prompts = new Map<string, any>([
    ["weather.ensureCity", protectedPrompt],
  ]);

  return {
    serverName: serverConfig.serverName,
    tools,
    resources,
    prompts,
    authenticateMeta: (extra: any, method: string) =>
      payments.mcp.authenticateMeta(extra, method),
    resourceTemplates: new Map([
      ["weather.today", createWeatherResourceTemplate()],
    ]),
    toolConfigs: new Map([["weather.today", weatherToolConfig]]),
    resourceConfigs: new Map([["weather.today", weatherResourceConfig]]),
    promptConfigs: new Map([["weather.ensureCity", weatherPromptConfig]]),
  };
}
