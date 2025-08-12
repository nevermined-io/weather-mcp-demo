/**
 * Weather prompt handler
 */
import { z } from "zod";
import { sanitizeCity } from "../../services/weather.service.js";

/**
 * Prompt configuration
 */
export const weatherPromptConfig = {
  title: "Ensure city provided",
  description: "Guide to call weather.today with a city",
  argsSchema: { city: z.string().min(2).max(80) },
};

/**
 * Weather prompt handler
 */
export function weatherPromptHandler({ city }: { city: string }) {
  return {
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Please call the tool weather.today with { "city": "${sanitizeCity(
            city
          )}" }`,
        },
      },
    ],
  };
}
