/**
 * Entry point for the Weather MCP server
 */
import { WeatherMcpApp } from "./app.js";

/**
 * Start the Weather MCP application
 */
function main() {
  try {
    const app = new WeatherMcpApp();
    app.start();
  } catch (error) {
    console.error("Failed to start Weather MCP server:", error);
    process.exit(1);
  }
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
