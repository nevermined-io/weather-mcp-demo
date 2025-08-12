/**
 * Weather service: geocoding and current forecast using Open-Meteo.
 * All functions use the built-in fetch available in Node.js >= 18.
 */

export type TodayWeather = {
  city: string;
  country: string | null;
  latitude: number;
  longitude: number;
  timezone: string;
  updatedAt: string;
  tmaxC: number | null;
  tminC: number | null;
  precipitationMm: number | null;
  weatherCode: number | null;
  weatherText: string | null;
};

export class CityNotFoundError extends Error {
  constructor(public readonly city: string) {
    super(`City not found: ${city}`);
    this.name = "CityNotFoundError";
  }
}

export class DownstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DownstreamError";
  }
}

export function sanitizeCity(rawCity: string): string {
  const trimmed = rawCity.trim();
  if (trimmed.length < 2 || trimmed.length > 80) {
    throw new Error("City must be between 2 and 80 characters long");
  }
  return trimmed;
}

export async function geocodeCity(city: string): Promise<{
  name: string;
  country: string | null;
  latitude: number;
  longitude: number;
  timezone: string | null;
}> {
  const q = sanitizeCity(city);
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", q);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");

  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new DownstreamError("Failed to reach Open-Meteo geocoding API");
  }

  if (!res.ok) {
    throw new DownstreamError(`Geocoding API returned HTTP ${res.status}`);
  }

  const data = (await res.json()) as any;
  if (!data || !Array.isArray(data.results) || data.results.length === 0) {
    throw new CityNotFoundError(q);
  }
  const first = data.results[0];
  return {
    name: String(first.name),
    country: first.country ? String(first.country) : null,
    latitude: Number(first.latitude),
    longitude: Number(first.longitude),
    timezone: first.timezone ? String(first.timezone) : null,
  };
}

export function weatherCodeToText(
  code: number | null | undefined
): string | null {
  if (code === null || code === undefined || Number.isNaN(code)) return null;
  const mapping: Record<number, string> = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow fall",
    73: "Moderate snow fall",
    75: "Heavy snow fall",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
  };
  return mapping[code] ?? "Unknown";
}

export async function getTodayWeather(city: string): Promise<TodayWeather> {
  const geo = await geocodeCity(city);

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(geo.latitude));
  url.searchParams.set("longitude", String(geo.longitude));
  url.searchParams.set("current_weather", "true");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set(
    "daily",
    "temperature_2m_max,temperature_2m_min,precipitation_sum"
  );

  let res: Response;
  const start = Date.now();
  try {
    res = await fetch(url);
  } catch (err) {
    throw new DownstreamError("Failed to reach Open-Meteo forecast API");
  }
  const latencyMs = Date.now() - start;
  // eslint-disable-next-line no-console
  console.log(`[open-meteo] forecast latency ${latencyMs}ms for ${geo.name}`);

  if (!res.ok) {
    throw new DownstreamError(`Forecast API returned HTTP ${res.status}`);
  }

  const data = (await res.json()) as any;
  const tz: string = data.timezone ?? geo.timezone ?? "unknown";
  const daily = data.daily ?? {};
  const tmax: number | null =
    Array.isArray(daily.temperature_2m_max) &&
    daily.temperature_2m_max.length > 0
      ? Number(daily.temperature_2m_max[0])
      : null;
  const tmin: number | null =
    Array.isArray(daily.temperature_2m_min) &&
    daily.temperature_2m_min.length > 0
      ? Number(daily.temperature_2m_min[0])
      : null;
  const precip: number | null =
    Array.isArray(daily.precipitation_sum) && daily.precipitation_sum.length > 0
      ? Number(daily.precipitation_sum[0])
      : null;
  const current = data.current_weather ?? {};
  const code: number | null =
    typeof current.weathercode === "number"
      ? Number(current.weathercode)
      : null;

  const result: TodayWeather = {
    city: geo.name,
    country: geo.country,
    latitude: geo.latitude,
    longitude: geo.longitude,
    timezone: tz,
    updatedAt: new Date().toISOString(),
    tmaxC: tmax,
    tminC: tmin,
    precipitationMm: precip,
    weatherCode: code,
    weatherText: weatherCodeToText(code),
  };

  return result;
}
