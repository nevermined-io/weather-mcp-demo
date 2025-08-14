## **Protecting an MCP Server with Nevermined Payments (TypeScript)**

This step-by-step guide will walk you through protecting a Model Context Protocol (MCP) server using the `@nevermined-io/payments` library. We’ll start with a simple server built with the official MCP SDK for TypeScript and progressively integrate the **Nevermined paywall** to protect tools, resources, and prompts — including **credit calculation and burning per call**.

The guide is based on the example project `weather-mcp-ts` and the MCP integration included in `@nevermined-io/payments`.

---

### **What is MCP?**

As Large Language Models (LLMs) and AI agents become more sophisticated, their greatest limitation is their isolation. By default, they lack access to real-time information, private data sources, or the ability to perform actions in the outside world. The Model Context Protocol (MCP) was designed to solve this problem by creating a standardized communication layer for AI.

Think of MCP as a universal language that allows any AI agent to ask a server, "What can you do?" and "How can I use your capabilities?". It turns a closed-off model into an agent that can interact with the world through a secure and discoverable interface. An MCP server essentially publishes a "menu" of its services, which can include:

*   **Tools**: These are concrete actions the agent can request, like sending an email, querying a database, or fetching a weather forecast. The agent provides specific arguments (e.g., `city="Paris"`) and the server executes the action.
*   **Resources**: These are stable pointers to data, identified by a URI. While a tool call might give a human-readable summary, a resource link (`weather://today/Paris`) provides the raw, structured data (like a JSON object) that an agent can parse and use for further tasks.
*   **Prompts**: These are pre-defined templates that help guide an agent's behavior, ensuring it requests information in the correct format or follows a specific interaction pattern.

---

### **Why integrate MCP with Nevermined Payments?**

While MCP provides a powerful standard for *what* an AI agent can do, it doesn't specify *who* is allowed to do it or *how* those services are paid for. This is where Nevermined Payments comes in. By integrating Nevermined, you can transform your open MCP server into a secure, monetizable platform.

The core idea is to place a "paywall" in front of your MCP handlers. This paywall acts as a gatekeeper, intercepting every incoming request to a tool, resource, or prompt. Before executing your logic, it checks the user's `Authorization` header to verify they have a valid subscription and sufficient credits through the Nevermined protocol. If they don't, the request is blocked. If they do, the request proceeds, and after your handler successfully completes, the paywall automatically deducts the configured number of credits.

This integration allows you to build a sustainable business model around your AI services. You can offer different subscription tiers (plans), charge dynamically based on usage, and maintain a complete audit trail of every transaction, all without cluttering your core application logic with complex payment code.

---

### **Step-by-step tutorial**

In this tutorial, we will embark on a practical journey to build a secure, monetizable MCP server. Our starting point will be a standard, unprotected server built with the MCP SDK—a common scenario for developers who have already created useful AI tools and now wish to commercialize them. From there, we will layer on the security and monetization capabilities of Nevermined Payments step by step.

We will focus on the server-side integration, showing you how to instantiate the `payments-py` library, configure it for MCP, and wrap your existing tool handlers with the `withPaywall` decorator to enforce access control. We'll also cover how to set up both fixed and dynamic credit costs for your tools. By the end, you'll have a clear blueprint for protecting any MCP-based service.

---

## **0) Requirements**

*   Node.js >= 18
*   MCP SDK (`@modelcontextprotocol/sdk`)
*   `@nevermined-io/payments` (Nevermined SDK)
*   Express.js

Install:

```bash
yarn add express @modelcontextprotocol/sdk @nevermined-io/payments zod
yarn add -D typescript ts-node @types/express
```

Environment variables (server side):

```bash
export NVM_API_KEY=...            # Builder/agent owner API key
export NVM_AGENT_ID=did:nv:...    # Agent ID registered in Nevermined
export NVM_ENV=sandbox            # or live
```

For testing as a **subscriber**:

```bash
export NVM_API_KEY=...            # Subscriber's API key
export NVM_PLAN_ID=...            # Subscription plan ID
export NVM_AGENT_ID=did:nv:...    # Agent ID linked to plan
```

---

## **1) Create a minimal High-Level MCP server**

This first snippet sets up a minimal MCP server using the official SDK. It exposes a single tool, `weather.today`, without a paywall. The MCP SDK uses a server factory pattern to create new instances for each client session. We'll start with this to verify the basic plumbing.

```typescript
// server.ts
import { McpServer, Tool, ResourceTemplate } from "@modelcontextprotocol/sdk/server";
import { z } from "zod";

export function createMcpServer() {
    const server = new McpServer({
        name: "weather-mcp-ts",
        version: "0.1.0",
        protocolVersion: "2024-11-05",
    });

    server.registerTool(
        "weather.today",
        {
            title: "Today's Weather",
            inputSchema: z.object({ city: z.string() }),
        },
        async (args) => {
            return {
                content: [{ type: "text", text: `Weather for ${args.city}: Sunny, 25C.` }],
            };
        }
    );
    return server;
}
```

---

## **2) Initialize Nevermined Payments**

Now, let's initialize the Nevermined Payments SDK. This requires your builder/agent owner API key and the environment.

```typescript
// payments-setup.ts
import { Payments } from "@nevermined-io/payments";
import dotenv from "dotenv";

dotenv.config();

const nvmApiKey = process.env.NVM_API_KEY!;
const environment = (process.env.NVM_ENV || "sandbox") as any;

const payments = Payments.getInstance({ nvmApiKey, environment });

// Configure MCP defaults once
payments.mcp.configure({
    agentId: process.env.NVM_AGENT_ID!,
    serverName: "weather-mcp-ts",
});
```

---

## **3) Wrap handlers with the paywall**

The `withPaywall` decorator checks authentication, executes your logic, and burns credits.

First, we define our core business logic in a handler. This function returns a standard MCP `content` object.

```typescript
// handlers.ts
import { ToolHandler } from "@modelcontextprotocol/sdk/server";

export const weatherToolHandler: ToolHandler = async (args) => {
    const city = (args as any).city || "Madrid";
    return {
        content: [
            { type: "text", text: `Weather for ${city}: Sunny, 25C.` },
            {
                type: "resource_link",
                uri: `weather://today/${city}`,
                name: `weather today ${city}`,
                mimeType: "application/json",
            },
        ],
    };
};
```

Now, we wrap this handler using `payments.mcp.withPaywall`. The key difference from the non-protected version is that the `extra` object, containing request headers, is passed automatically by the MCP server to the handler. The paywall uses this to extract the `Authorization` token.

```typescript
// server-factory.ts
import { McpServer, Tool, ResourceTemplate } from "@modelcontextprotocol/sdk/server";
import { z } from "zod";
import { Payments } from "@nevermined-io/payments";
import { weatherToolHandler } from "./handlers";

// Assume payments instance is configured as in payments-setup.ts
const payments = Payments.getInstance({
  nvmApiKey: process.env.NVM_API_KEY!,
  environment: (process.env.NVM_ENV || "sandbox") as any,
});
payments.mcp.configure({
  agentId: process.env.NVM_AGENT_ID!,
  serverName: "weather-mcp-ts",
});

const protectedWeatherHandler = payments.mcp.withPaywall(
    weatherToolHandler,
    { credits: 1n } // 1 credit per call (use BigInt or function that calculates credits based on context)
);

export function createMcpServerWithPaywall() {
    const server = new McpServer(/* ... */);
    
    server.registerTool(
        "weather.today",
        {
            title: "Today's Weather",
            inputSchema: z.object({ city: z.string() }),
        },
        protectedWeatherHandler // Use the wrapped handler
    );
    return server;
}
```

---

## **4) Dynamic credit calculation**

For more flexible pricing, you can provide a function for the `credits` option. This function receives a context object containing the request arguments, the handler's result, and the `extra` metadata.

```typescript
// dynamic-credits.ts
import { withPaywall } from "@nevermined-io/payments/dist/mcp";
import { weatherToolHandler } from "./handlers";

const dynamicCreditsHandler = withPaywall(
    weatherToolHandler,
    {
        credits: (ctx) => {
            const city = (ctx.args as any).city || "";
            return city.length <= 5 ? 1n : 2n; // 1 credit for short names, 2 for long
        },
    }
);
```

---

## **5) Protecting Resources & Prompts**

The same `withPaywall` pattern applies to resources and prompts. The `extra` object is passed to resource handlers as the third argument.

```typescript
// protected-resource.ts
import { ResourceHandler } from "@modelcontextprotocol/sdk/server";
import { withPaywall } from "@nevermined-io/payments/dist/mcp";

const myResourceHandler: ResourceHandler = async (uri, variables, extra) => {
    // ... logic to return resource contents
    return { contents: [] };
};

const protectedResource = withPaywall(myResourceHandler, { credits: 1n });
```
---

## **Alternative Registration with `attach`**

While `withPaywall` is useful for protecting individual handlers, it can become repetitive if you have many tools, resources, and prompts. The `payments.mcp.attach` method provides a more declarative and streamlined alternative.

**Why use `attach`?**

-   **Conciseness**: It combines registration and protection into a single, clean method call, reducing boilerplate.
-   **Declarative Style**: You define your tools and their protection options in one place, making your server's capabilities easier to read and manage.
-   **Consistency**: It ensures that all registered handlers are wrapped with the same paywall logic, reducing the chance of errors.

The `attach` method takes your `McpServer` instance and returns an object with `registerTool`, `registerResource`, and `registerPrompt` methods. These new methods have the same signature as the original ones, but they also accept an additional `options` parameter for the paywall (e.g., `credits`).

Here is how you can refactor the `createMcpServerWithPaywall` function to use `attach`:

```typescript
// server-factory-with-attach.ts
import { McpServer } from "@modelcontextprotocol/sdk/server";
import { z } from "zod";
import { Payments } from "@nevermined-io/payments";
import { weatherToolHandler } from "./handlers";

// Assume payments instance is configured
const payments = Payments.getInstance(/*...*/);
payments.mcp.configure(/*...*/);

export function createMcpServerWithAttach() {
    const server = new McpServer(/* ... */);
    const protectedRegistrar = payments.mcp.attach(server);

    // Use the new registrar to register and protect in one step
    protectedRegistrar.registerTool(
        "weather.today",
        {
            title: "Today's Weather",
            inputSchema: z.object({ city: z.string() }),
        },
        weatherToolHandler, // Pass the original handler
        { credits: (ctx) => ctx.args.yourCreditsVariable * 3) }
    );

    // You can continue to register other tools, resources, etc.
    // protectedRegistrar.registerResource(...)

    return server;
}
```

As you can see, this approach is much cleaner. You provide the original, unprotected handler, and `protectedRegistrar` takes care of wrapping it with the paywall and registering it on the server instance.

---

## **Alternative: Custom Low‑Level MCP server**

If you prefer full control, you can implement a low-level JSON-RPC router. Here, you are responsible for parsing the request, routing it, and manually passing the `extra` object to the protected handler. The `extra` object should contain the request headers.

This example shows a minimal router using Express.js.

```typescript
// low-level-server.ts
import express from "express";
import { Payments } from "@nevermined-io/payments";
import { weatherToolHandler } from "./handlers";

// Assume payments is configured
const payments = Payments.getInstance(/*...*/);
payments.mcp.configure(/*...*/);

const protectedHandler = payments.mcp.withPaywall(weatherToolHandler, { credits: 1n });

const app = express();
app.use(express.json());

app.post("/mcp-low", async (req, res) => {
    const { method, params, id } = req.body;

    if (method === "tools/call" && params.name === "weather.today") {
        try {
            const result = await protectedHandler(params.arguments, {
                requestInfo: { headers: req.headers },
            });
            res.json({ jsonrpc: "2.0", id, result });
        } catch (e: any) {
            res.status(500).json({
                jsonrpc: "2.0",
                id,
                error: { code: e.code || -32000, message: e.message },
            });
        }
    } else {
        res.status(404).json({
            jsonrpc: "2.0",
            id,
            error: { code: -32601, message: "Method not found" },
        });
    }
});

app.listen(3000);
```

---

## **6) Client: getting access & calling**

**6.1 Get `accessToken`:**

```typescript
// get-token.ts
import { Payments } from "@nevermined-io/payments";

async function getAccessToken() {
    const payments = Payments.getInstance({
        nvmApiKey: process.env.NVM_API_KEY!,
        environment: (process.env.NVM_ENV || "sandbox") as any,
    });

    const { accessToken } = await payments.agents.getAgentAccessToken(
        process.env.NVM_PLAN_ID!,
        process.env.NVM_AGENT_ID!
    );
    return accessToken;
}
```

**6.2 Call a tool (High-Level SDK Client):**

The MCP SDK client simplifies the process. You provide the `Authorization` header when creating the transport.

```typescript
// client-sdk.ts
import { Client as McpClient } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp";

async function callWithSdk(accessToken: string) {
    const transport = new StreamableHTTPClientTransport(
        new URL("http://localhost:3000/mcp"),
        {
            requestInit: {
                headers: { Authorization: `Bearer ${accessToken}` },
            },
        }
    );

    const client = new McpClient({ name: "my-client" });
    await client.connect(transport);

    const result = await client.callTool({
        name: "weather.today",
        arguments: { city: "London" },
    });

    console.log(result);
    await client.close();
}
```

---

## **Error handling**

*   **No token / Invalid token** → `-32003` (“Authorization required” or “Payment required”)
*   **Other server errors** → `-32002`

---

