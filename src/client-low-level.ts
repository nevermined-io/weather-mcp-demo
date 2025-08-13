/**
 * Minimal low-level client using fetch to call JSON-RPC endpoints directly.
 * It negotiates access via Nevermined: ensures plan subscription and obtains
 * an agent access token to be sent as Authorization header.
 */
import dotenv from "dotenv";
dotenv.config();
import { Payments } from "@nevermined-io/payments";

/**
 * Entrypoint for the low-level client.
 * - Reads endpoint, city, planId, agentId and API key from the environment/argv
 * - Ensures subscription (orders plan when needed)
 * - Obtains an agent access token and performs a JSON-RPC call
 */
async function main() {
  const endpoint =
    process.env.MCP_LOW_ENDPOINT || "http://localhost:3000/mcp-low";
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

  // 1) Initialize handshake (MCP-style)
  const initPayload = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
    },
  };

  const initRes = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify(initPayload),
  });

  const initData = await initRes.json();
  if ((initData as any)?.error) {
    console.error("Initialize error:", JSON.stringify(initData, null, 2));
    process.exit(1);
  } else {
    console.log("Initialized:", JSON.stringify(initData, null, 2));
  }

  // 2) Tool call
  const payload = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "weather.today", arguments: { city } },
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  console.log("LowLevel result:", JSON.stringify(data, null, 2));

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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
