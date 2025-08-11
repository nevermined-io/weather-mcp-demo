import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function main() {
  const endpoint = process.env.MCP_ENDPOINT || "http://localhost:3000/mcp";
  const city = process.argv[2] || "Madrid";

  const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
    requestInit: { headers: { Authorization: "Bearer INVALID_TOKEN" } },
  });
  const client = new McpClient({ name: "test-invalid", version: "0.1.0" });

  await client.connect(transport);
  try {
    const result = await client.callTool({
      name: "weather.today",
      arguments: { city },
    });
    console.log("UNEXPECTED SUCCESS:", result);
  } catch (err) {
    console.error("EXPECTED ERROR:", err);
  }
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
