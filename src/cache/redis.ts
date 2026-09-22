import Redis from "ioredis";
import { config } from "../config";

// Singleton Redis client
let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    redisClient.on("connect", () =>
      console.log("[Redis] Connected to Redis server")
    );
    redisClient.on("error", (err) =>
      console.error("[Redis] Connection error:", err)
    );
    redisClient.on("ready", () => console.log("[Redis] Client ready"));
  }
  return redisClient;
}

/**
 * Get a cached value by key.
 * Returns null on cache miss or parse error.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const redis = getRedisClient();
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error("[Redis] cacheGet error:", err);
    return null;
  }
}

/**
 * Set a value in cache with a TTL in seconds.
 */
export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number
): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    console.error("[Redis] cacheSet error:", err);
    // Non-fatal: proceed without caching
  }
}

/**
 * Delete a cached key.
 */
export async function cacheDel(key: string): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.del(key);
  } catch (err) {
    console.error("[Redis] cacheDel error:", err);
  }
}
