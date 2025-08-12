/**
 * Environment configuration for the weather MCP server
 */
export interface EnvironmentConfig {
  nvmApiKey: string;
  nvmAgentId: string;
  nvmEnvironment: string;
}

/**
 * Load environment configuration with validation
 */
export function loadEnvironmentConfig(): EnvironmentConfig {
  const nvmApiKey = process.env.NVM_SERVER_API_KEY;
  const nvmAgentId = process.env.NVM_AGENT_ID;
  const nvmEnvironment = process.env.NVM_ENV || "staging_sandbox";

  if (!nvmApiKey) {
    throw new Error(
      "NVM_API_KEY is required to run the MCP server with payments protection"
    );
  }

  if (!nvmAgentId) {
    throw new Error("NVM_AGENT_ID is required for payments integration");
  }

  return {
    nvmApiKey,
    nvmAgentId,
    nvmEnvironment,
  };
}
