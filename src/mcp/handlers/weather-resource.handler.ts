/**
 * Weather resource handler
 */
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  getTodayWeather,
  sanitizeCity,
} from "../../services/weather.service.js";

/**
 * Resource configuration
 */
export const weatherResourceConfig = {
  title: "Today's Weather Resource",
  description: "JSON for today's weather by city",
  mimeType: "application/json",
};

/**
 * Create weather resource template
 */
export function createWeatherResourceTemplate() {
  return new ResourceTemplate("weather://today/{city}", { list: undefined });
}

/**
 * Base resource handler (no payments). Signature required by MCP:
 * (uri: URL, variables: Record<string, string|string[]>) => ResourceResult
 */
export async function weatherResourceHandler(
  uri: URL,
  variables: Record<string, string | string[]>
) {
  const cityParamRaw = variables?.city;
  const cityParam: string = Array.isArray(cityParamRaw)
    ? cityParamRaw[0]
    : (cityParamRaw as string);
  const decodedCity = (() => {
    try {
      return decodeURIComponent(cityParam);
    } catch {
      return cityParam;
    }
  })();
  const sanitized = sanitizeCity(decodedCity);
  const weather = await getTodayWeather(sanitized);
  return {
    contents: [
      {
        uri: uri.href,
        text: JSON.stringify(weather),
        mimeType: "application/json",
      },
    ],
  };
}
