import crypto from "crypto";
import { runRoutingAgent } from "../../agent";
import { cacheGet, cacheSet } from "../../cache/redis";
import { prisma } from "../../db/prisma";
import { config } from "../../config";
import { RoutingResult } from "./route.types";

/**
 * Generates a deterministic SHA-256 cache key from the normalized query string.
 * Normalizing prevents cache misses due to whitespace/case differences.
 */
function buildCacheKey(query: string): string {
  const normalized = query.toLowerCase().trim().replace(/\s+/g, " ");
  return `route:${crypto.createHash("sha256").update(normalized).digest("hex")}`;
}

/**
 * Extracts the JSON itinerary block from the agent's text output.
 * The agent is prompted to always wrap JSON in ```json ... ``` fences.
 */
function extractJsonFromAgentOutput(output: string): RoutingResult | null {
  const jsonFenceRegex = /```json\s*([\s\S]*?)\s*```/;
  const match = jsonFenceRegex.exec(output);
  if (match?.[1]) {
    try {
      return JSON.parse(match[1]) as RoutingResult;
    } catch {
      return null;
    }
  }
  return null;
}

export async function processRoutingQuery(
  query: string,
  userId: string
): Promise<{ result: RoutingResult; cached: boolean; cacheKey: string }> {
  const cacheKey = buildCacheKey(query);

  // ── 1. Check Redis cache ──────────────────────────────────────────────────
  const cached = await cacheGet<RoutingResult>(cacheKey);
  if (cached) {
    console.log(`[RouteService] Cache HIT for key: ${cacheKey}`);
    return { result: { ...cached, cachedAt: new Date().toISOString() }, cached: true, cacheKey };
  }

  // ── 2. Run the LangChain agent ────────────────────────────────────────────
  console.log(`[RouteService] Cache MISS. Running agent for query: "${query}"`);
  const agentResult = await runRoutingAgent(query);

  // ── 3. Parse structured JSON from agent output ────────────────────────────
  let routingResult = extractJsonFromAgentOutput(agentResult.output);

  if (!routingResult) {
    // Fallback: wrap the raw text output in a minimal result
    routingResult = {
      origin: "Unknown",
      destination: "Unknown",
      legs: [],
      totalEstimatedDurationSeconds: 0,
      totalDistanceMeters: 0,
      agentThought: agentResult.output,
    };
  }

  // ── 4. Store in Redis ─────────────────────────────────────────────────────
  await cacheSet(cacheKey, routingResult, config.cache.routeTtlSeconds);

  // ── 5. Persist to PostgreSQL route_cache (audit log) ─────────────────────
  try {
    const expiresAt = new Date(Date.now() + config.cache.routeTtlSeconds * 1000);
    await prisma.routeCache.upsert({
      where: { queryHash: cacheKey },
      create: {
        queryHash: cacheKey,
        query,
        result: routingResult as object,
        userId,
        expiresAt,
      },
      update: {
        result: routingResult as object,
        expiresAt,
      },
    });
  } catch (dbErr) {
    // Non-fatal: log but don't fail the request
    console.error("[RouteService] Failed to persist route cache to DB:", dbErr);
  }

  return { result: routingResult, cached: false, cacheKey };
}
