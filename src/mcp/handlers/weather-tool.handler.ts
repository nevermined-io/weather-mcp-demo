/**
 * Weather tool handler
 */
import { z } from "zod";
import {
  getTodayWeather,
  sanitizeCity,
  TodayWeather,
} from "../../services/weather.service.js";
import type { CreditsContext } from "@nevermined-io/payments/mcp";

/**
 * Safely extract city from the handler args within the CreditsContext.
 */
function getCityFromArgs(args: unknown): string | null {
  if (
    args &&
    typeof args === "object" &&
    args !== null &&
    "city" in (args as any)
  ) {
    const possible = (args as any).city;
    if (typeof possible === "string") return possible;
  }
  return null;
}

/**
 * Params shape for weather tool input (Zod raw shape as required by registerTool)
 */
export const weatherToolParams = {
  city: z.string().min(2).max(80),
};

/**
 * Configuration for weather tool
 */
export const weatherToolConfig = {
  title: "Today's Weather",
  description: "Get today's weather summary for a city",
  inputSchema: weatherToolParams,
};

/**
 * Base weather tool handler (before paywall protection)
 */
export async function weatherToolHandler({ city }: { city: string }) {
  const sanitized = sanitizeCity(city);
  const weather: TodayWeather = await getTodayWeather(sanitized);

  const text =
    `Weather for ${weather.city}, ${weather.country ?? ""} (tz: ${
      weather.timezone
    })\n` +
    `High: ${weather.tmaxC ?? "n/a"}°C, Low: ${weather.tminC ?? "n/a"}°C, ` +
    `Precipitation: ${weather.precipitationMm ?? "n/a"}mm, ` +
    `Conditions: ${weather.weatherText ?? "n/a"}`;

  return {
    content: [
      { type: "text" as const, text },
      {
        type: "resource_link" as const,
        uri: `weather://today/${encodeURIComponent(weather.city)}`,
        name: `weather today ${weather.city}`,
        mimeType: "application/json",
        description: "Raw JSON for today's weather",
      },
    ],
  };
}

/**
 * Dynamic credits calculator for the weather tool.
 * Uses handler context to derive a deterministic small cost (1..10).
 * - If city is present in args, uses its length modulo 10 as base.
 * - Otherwise falls back to a random value between 1 and 10.
 * @param ctx Context provided by the payments library (args, result, request info).
 * @returns Credits to burn as bigint.
 */
/**
 * Credits policy for the weather tool.
 * @param ctx CreditsContext provided by the payments library.
 * - ctx.args: original handler arguments
 * - ctx.result: handler result
 * - ctx.request: metadata (authHeader, logicalUrl, toolName)
 */
export function weatherToolCreditsCalculator(_ctx: CreditsContext): bigint {
  return BigInt(5 + Math.floor(Math.random() * 10));
}
