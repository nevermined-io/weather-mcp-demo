/**
 * @file Minimal MCP client to test the streamable HTTP server.
 */

import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Payments } from "@nevermined-io/payments";

async function main() {
  const endpoint = process.env.MCP_ENDPOINT || "http://localhost:3000/mcp";
  const city = process.argv[2] || "Madrid";
  const planId = process.env.NVM_PLAN_ID || process.argv[3];
  const agentId = process.env.NVM_AGENT_ID || process.argv[4];
  const nvmApiKey = process.env.NVM_API_KEY;
  const environment = (process.env.NVM_ENV || "staging_sandbox") as any;

  let authHeader: string | undefined;
  if (nvmApiKey && planId && agentId) {
    const payments = Payments.getInstance({ nvmApiKey, environment });
    const creds = await payments.agents.getAgentAccessToken(planId, agentId);
    authHeader = `Bearer ${creds.accessToken}`;
  }

  const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
    requestInit: authHeader
      ? { headers: { Authorization: authHeader } }
      : undefined,
  });
  const client = new McpClient({
    name: "weather-mcp-client",
    version: "0.1.0",
  });

  await client.connect(transport);

  // List tools
  const tools = await client.listTools();
  console.log(
    "Tools:",
    tools.tools.map((t) => t.name)
  );

  // Call weather.today
  console.log(`\nCalling weather.today for city: ${city}`);
  const result = await client.callTool({
    name: "weather.today",
    arguments: { city },
  });

  // Print the first element of result.content, handling unknown type safely
  if (Array.isArray(result.content) && result.content.length > 0) {
    console.log("Tool result content[0]:", JSON.stringify(result.content[0]));
  } else {
    console.log("Tool result content[0]: No content returned.");
  }

  /**
   * If a resource link is present in the result content, read it.
   * @type {{ type: "resource_link"; uri: string } | undefined}
   */
  let link: { type: "resource_link"; uri: string } | undefined = undefined;
  if (Array.isArray(result.content)) {
    link = result.content.find(
      (c: unknown): c is { type: "resource_link"; uri: string } =>
        typeof c === "object" &&
        c !== null &&
        (c as any).type === "resource_link" &&
        typeof (c as any).uri === "string"
    );
  }

  if (link) {
    const res = await client.readResource({ uri: link.uri });
    console.log("\nResource read:", res);
  }

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
