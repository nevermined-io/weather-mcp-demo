/**
 * Low-level server bootstrap (Express + Payments low-level registry)
 * NOTE: This sits alongside the high-level server and uses a different route (/mcp-low)
 */
import express from "express";
import dotenv from "dotenv";
import {
  createServerConfig,
  ServerConfig,
} from "../../config/server-config.js";
import {
  loadEnvironmentConfig,
  EnvironmentConfig,
} from "../../config/environment.js";
import { buildLowLevelServerFactory } from "./server-factory.js";
import { createLowLevelRouter } from "./router.js";

dotenv.config();

export class WeatherMcpLowLevelApp {
  private app: express.Application;
  private serverConfig: ServerConfig;
  private envConfig: EnvironmentConfig;

  constructor() {
    this.serverConfig = createServerConfig();
    this.envConfig = loadEnvironmentConfig();
    this.app = express();
    this.app.use(express.json());

    const { tools, resources, prompts, authenticateMeta } =
      buildLowLevelServerFactory(this.serverConfig, this.envConfig);
    this.app.post(
      "/mcp-low",
      createLowLevelRouter({ tools, resources, prompts, authenticateMeta })
    );

    this.app.get("/healthz-low", (_req, res) =>
      res.status(200).json({ ok: true })
    );
  }

  public start(): void {
    this.app.listen(this.serverConfig.port, () => {
      console.log(
        `weather-mcp (low-level) listening on http://localhost:${this.serverConfig.port}`
      );
    });
  }
}

function main() {
  try {
    const app = new WeatherMcpLowLevelApp();
    app.start();
  } catch (error) {
    console.error("Failed to start Weather MCP low-level server:", error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
