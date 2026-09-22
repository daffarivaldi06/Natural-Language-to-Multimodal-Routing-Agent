import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { config } from "../../config";
import { cacheGet, cacheSet } from "../../cache/redis";

interface BikeDockRow {
  id: string;
  name: string;
  available_bikes: number;
  total_slots: number;
  provider: string;
  dist_meters: number;
}

/**
 * LangChain Tool: find_nearby_bikes
 * Performs a PostGIS ST_DWithin spatial query to find bike docks
 * within a given radius of the alighting stop.
 *
 * Results are cached in Redis for 60 seconds (config.cache.bikeTtlSeconds)
 * to avoid hammering the DB on repeated identical requests.
 */
export const bikeAvailabilityTool = new DynamicStructuredTool({
  name: "find_nearby_bikes",
  description:
    "Finds available shared bikes (Nextbike docks) near a given location using a spatial database query. " +
    "Use this for the last-mile bike leg after the main transit route ends. " +
    "Pass the coordinates of the alighting station from the transit route result.",
  schema: z.object({
    lat: z.number().describe("Latitude of the search center point"),
    lng: z.number().describe("Longitude of the search center point"),
    radiusMeters: z
      .number()
      .min(50)
      .max(2000)
      .default(1000)
      .describe("Search radius in meters (default 1000m, max 2000m)"),
  }),
  func: async ({ lat, lng, radiusMeters }) => {
    // ── DEBUG: log every invocation so we can verify the agent is calling this tool ──
    console.log(`[BikeAvailability] 🔍 Tool called with lat=${lat}, lng=${lng}, radiusMeters=${radiusMeters}`);

    const cacheKey = `bike:${lat.toFixed(4)}:${lng.toFixed(4)}:${radiusMeters}`;

    // Check Redis cache first
    const cached = await cacheGet<BikeDockRow[]>(cacheKey);
    if (cached) {
      console.log(`[BikeAvailability] ✅ Cache HIT for key ${cacheKey} — returning ${cached.length} docks`);
      return JSON.stringify({ success: true, docks: cached, cached: true });
    }

    try {
      // PostGIS spatial query using ST_DWithin (uses GIST index) and
      // ST_Distance for ordering results by proximity.
      const docks = await prisma.$queryRaw<BikeDockRow[]>`
        SELECT
          id,
          name,
          available_bikes,
          total_slots,
          provider,
          ROUND(
            ST_Distance(
              location::geography,
              ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography
            )::numeric,
            2
          ) AS dist_meters
        FROM bike_docks
        WHERE
          ST_DWithin(
            location::geography,
            ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography,
            ${radiusMeters}::float8
          )
          AND available_bikes > 0
        ORDER BY dist_meters ASC
        LIMIT 5
      `;

      console.log(`[BikeAvailability] ✅ Found ${docks.length} dock(s) within ${radiusMeters}m of (${lat}, ${lng})`);
      if (docks.length === 0) {
        console.warn(`[BikeAvailability] ⚠️  Zero results — consider retrying with a larger radius!`);
      } else {
        docks.forEach((d) =>
          console.log(`   🚲 ${d.name} — ${d.available_bikes} bikes available, ${d.dist_meters}m away`)
        );
      }

      // Cache the result
      await cacheSet(cacheKey, docks, config.cache.bikeTtlSeconds);

      return JSON.stringify({
        success: true,
        docks,
        cached: false,
        radiusMeters,
        searchCenter: { lat, lng },
      });
    } catch (err) {
      const error = err as Error;
      console.error("[BikeAvailability] ❌ PostGIS query error:", error.message);
      return JSON.stringify({ success: false, error: error.message });
    }
  },
});
