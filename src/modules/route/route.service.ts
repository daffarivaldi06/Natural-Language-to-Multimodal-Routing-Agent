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
 */
async function enrichRouteCoordinates(result: RoutingResult): Promise<RoutingResult> {
  if (!result || !result.legs || result.legs.length === 0) {
    return result;
  }

  // Enrich each leg with coordinates if missing
  for (let i = 0; i < result.legs.length; i++) {
    const leg = result.legs[i];

    if (!leg.originCoords && leg.from) {
      const geo = await GeocodingService.geocode(leg.from);
      leg.originCoords = { lat: geo.lat, lng: geo.lng };
    }

    if (!leg.destinationCoords && leg.to) {
      const geo = await GeocodingService.geocode(leg.to);
      leg.destinationCoords = { lat: geo.lat, lng: geo.lng };
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
