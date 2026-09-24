import dotenv from "dotenv";
dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config = {
  port: parseInt(process.env.PORT ?? "3000", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",

  database: {
    url: requireEnv("DATABASE_URL"),
  },

  redis: {
    url: requireEnv("REDIS_URL"),
  },

  jwt: {
    secret: requireEnv("JWT_SECRET"),
    expiresIn: process.env.JWT_EXPIRES_IN ?? "1h",
  },

  google: {
    apiKey: requireEnv("GOOGLE_API_KEY"),

    model: "gemini-3-flash-preview",
    // model: "gemini-2.5-flash",
    // model: "gemini-3.5-flash-lite",

    /** Hard cap: free tier allows 15 RPM max; we use 10 for safety margin */
    maxRpm: 15,
    /**
     * LangGraph recursionLimit — each tool call round-trip counts as 2 steps.
     * For a 4-leg journey: 2 geocodes + 4 transit tool calls = ~12 steps minimum.
     * Set to 25 to give ample room without infinite loops.
     */
    maxIterations: 25,
  },

  cache: {
    /** Route result TTL: 5 minutes */
    routeTtlSeconds: 300,
    /** Bike availability TTL: 60 seconds (volatile real-time data) */
    bikeTtlSeconds: 60,
  },
};
