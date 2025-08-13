/**
 * Main application class for Weather MCP server
 */
import express from "express";
import dotenv from "dotenv";
import { ServerConfig, createServerConfig } from "./config/server-config.js";
import {
  EnvironmentConfig,
  loadEnvironmentConfig,
} from "./config/environment.js";
import { SessionManager } from "./server/high-level/session-manager.js";
import { setupHighLevelMcpRoutes } from "./server/high-level/mcp.routes.js";
import { buildHighLevelServerFactory } from "./server/high-level/server-factory.js";

// Load environment variables
dotenv.config();

/**
 * Weather MCP Application
 */
export class WeatherMcpApp {
  private app: express.Application;
  private sessionManager: SessionManager;
  private serverConfig: ServerConfig;
  private envConfig: EnvironmentConfig;
  private createServerInstance!: () => any;

  constructor() {
    this.serverConfig = createServerConfig();
    this.envConfig = loadEnvironmentConfig();
    this.sessionManager = new SessionManager(this.serverConfig);
    this.app = express();

    this.setupMiddleware();
    // Build server factory once at startup
    this.createServerInstance = buildHighLevelServerFactory(
      this.serverConfig,
      this.envConfig
    );
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
  }

  private setupRoutes(): void {
    setupHighLevelMcpRoutes(
      this.app,
      this.sessionManager,
      this.createServerInstance
    );

    // Health check endpoint
    this.app.get("/healthz", (_req, res) => {
      res.status(200).json({ ok: true });
    });
  }

  /**
   * Start the server
   */
  public start(): void {
    this.app.listen(this.serverConfig.port, () => {
      console.log(
        `weather-mcp listening on http://localhost:${this.serverConfig.port}`
      );
    });
  }

  /**
   * Get Express app (for testing)
   */
  public getApp(): express.Application {
    return this.app;
  }
}
