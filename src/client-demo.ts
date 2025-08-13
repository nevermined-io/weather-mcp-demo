/**
 * @file Minimal MCP client to test the streamable HTTP server.
 */
import dotenv from "dotenv";
dotenv.config();

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

  const payments = nvmApiKey
    ? Payments.getInstance({ nvmApiKey, environment })
    : undefined;

  let authHeader: string | undefined;
  let beforeBalance: bigint | undefined;
  if (payments && planId && agentId) {
    try {
      let bal = await payments.plans.getPlanBalance(planId);
      beforeBalance = BigInt(bal.balance || 0);
      const isSubscriber = !!bal?.isSubscriber;
      if (!isSubscriber || beforeBalance === 0n) {
        console.log(
          "Ordering plan because there is no balance or not subscribed..."
        );
        await payments.plans.orderPlan(planId);
      } else {
        console.log(
          `Before balance: ${beforeBalance.toString()} (subscriber: ${isSubscriber})`
        );
      }
    } catch (e) {
      console.warn("Unable to get balance. Attempting to order plan...", e);
      try {
        await payments.plans.orderPlan(planId);
        const bal = await payments.plans.getPlanBalance(planId);
        beforeBalance = BigInt(bal.balance || 0);
        console.log(
          `Before balance: ${beforeBalance.toString()} (subscriber: ${
            bal?.isSubscriber
          })`
        );
      } catch (e2) {
        console.error("Order plan failed:", e2);
      }
    }

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
    name: process.env.RAW ? "weather.today.raw" : "weather.today",
    arguments: { city },
  });

  if ((result as any)?.isError || (result as any)?.error) {
    console.error("Tool error:", JSON.stringify(result, null, 2));
  }

  // Print text content if present
  if (Array.isArray(result.content)) {
    const textItem = result.content.find(
      (c: any) => c && typeof c === "object" && c.type === "text"
    ) as { type: "text"; text: string } | undefined;
    if (textItem)
      console.log(
        "Tool text:",
        typeof textItem.text === "string"
          ? textItem.text
          : JSON.stringify(textItem.text)
      );
    else console.log("Tool: no text content returned");
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
    console.log("\nResource read uri:", link.uri);
    const first = Array.isArray(res.contents) ? res.contents[0] : undefined;
    if (first?.text) console.log("Resource JSON:", first.text);
  }

  // Try direct resource read as well to validate credits burn in resource handler
  try {
    const directUri = `weather://today/${encodeURIComponent(city)}`;
    const res2 = await client.readResource({ uri: directUri });
    const first2 = Array.isArray(res2.contents) ? res2.contents[0] : undefined;
    console.log("Direct resource read uri:", directUri);
    if (first2?.text) console.log("Direct Resource JSON:", first2.text);
  } catch (e) {
    console.error("Direct resource read error:", e);
  }

  // After balances
  if (payments && planId) {
    try {
      const after = await payments.plans.getPlanBalance(planId);
      const afterBalance = BigInt(after.balance || 0);
      console.log(`After balance: ${afterBalance.toString()}`);
      if (beforeBalance !== undefined) {
        const delta = beforeBalance - afterBalance;
        console.log(`Credits burned (approx): ${delta.toString()}`);
      }
    } catch {}
  }

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
