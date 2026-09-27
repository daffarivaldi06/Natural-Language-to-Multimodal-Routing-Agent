import crypto from "crypto";
import { runRoutingAgent } from "../../agent";
import { cacheGet, cacheSet } from "../../cache/redis";
import { prisma } from "../../db/prisma";
import { config } from "../../config";
import { RoutingResult, RouteLeg } from "./route.types";
import { GeocodingService } from "../../services/geocoding";

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

/**
 * Enriches the RoutingResult by attaching accurate spatial coordinates (lat/lng)
 * to every leg origin and destination.
 * ⚡ Optimized: Fetches coordinates in parallel and deduplicates queries using an in-memory cache.
 */
async function enrichRouteCoordinates(result: RoutingResult): Promise<RoutingResult> {
  if (!result || !result.legs || result.legs.length === 0) {
    return result;
  }

  // Collect all unique locations that need geocoding
  const uniqueLocations = new Set<string>();
  for (const leg of result.legs) {
    if (!leg.originCoords && leg.from) uniqueLocations.add(leg.from);
    if (!leg.destinationCoords && leg.to) uniqueLocations.add(leg.to);
  }

  // Resolve all unique locations concurrently
  const geocodedMap = new Map<string, { lat: number; lng: number }>();
  await Promise.all(
    Array.from(uniqueLocations).map(async (place) => {
      const geo = await GeocodingService.geocode(place);
      geocodedMap.set(place, { lat: geo.lat, lng: geo.lng });
    })
  );

  // Enrich each leg with the resolved coordinates
  for (const leg of result.legs) {
    if (!leg.originCoords && leg.from && geocodedMap.has(leg.from)) {
      leg.originCoords = geocodedMap.get(leg.from);
    }
    if (!leg.destinationCoords && leg.to && geocodedMap.has(leg.to)) {
      leg.destinationCoords = geocodedMap.get(leg.to);
    }
  }

  return result;
}

export async function processRoutingQuery(
  query: string,
  userId: string
): Promise<{ result: RoutingResult; cached: boolean; cacheKey: string }> {
  const cacheKey = buildCacheKey(query);

  // ── 1. Check Redis cache ──
  const cached = await cacheGet<RoutingResult>(cacheKey);
  if (cached) {
    console.log(`[RouteService] Cache HIT for key: ${cacheKey}`);
    const enrichedCached = await enrichRouteCoordinates(cached);
    return { result: { ...enrichedCached, cachedAt: new Date().toISOString() }, cached: true, cacheKey };
  }

  // ── 2. Run the LangChain agent ──
  console.log(`[RouteService] Cache MISS. Running agent for query: "${query}"`);
  const agentResult = await runRoutingAgent(query);

  // ── 3. Parse structured JSON from agent output ──
  let routingResult = extractJsonFromAgentOutput(agentResult.output);

  if (!routingResult) {
    // Fallback: wrap the raw text output in a minimal result
    routingResult = {
      origin: "Origin",
      destination: "Destination",
      legs: [],
      totalEstimatedDurationSeconds: 0,
      totalDistanceMeters: 0,
      agentThought: agentResult.output,
    };
  }

  // ── 4. Spatial Coordinate Enrichment (Guarantee lat/lng on every leg) ──
  routingResult = await enrichRouteCoordinates(routingResult);

  // ── 5. Store in Redis ──
  await cacheSet(cacheKey, routingResult, config.cache.routeTtlSeconds);

  // ── 6. Persist to PostgreSQL route_cache (audit log) ──
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
