import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { prisma } from "../../db/prisma";

/**
 * Row returned from the transit_lines table via $queryRaw.
 * Typed manually because Prisma doesn't natively model PostGIS geometry columns.
 */
interface TransitLineRow {
  id: string;
  line_id: string;
  line_name: string;
  operator: string;
  mode: string;
  origin_stop: string;
  destination_stop: string;
  duration_seconds: number;
  distance_meters: number;
  sequence: number;
}

/**
 * LangChain Tool: find_transit_connections
 *
 * Queries the `transit_lines` table to find direct transit connections
 * between named stops. Supports bus, metro, tram, and train (TER) lines.
 *
 * Use this tool for EVERY leg of a named-stop transit journey.
 * Chain calls by using `destination_stop` from one result as the
 * `origin_stop` for the next call.
 *
 * Uses prisma.$queryRaw to safely handle PostGIS geometry columns.
 */
export const transitConnectionsTool = new DynamicStructuredTool({
  name: "find_transit_connections",
  description:
    "Finds direct transit line connections (bus, metro, tram, train/TER) between two named stops. " +
    "Use this tool for EVERY leg of a multi-modal transit journey. " +
    "Chain calls: the destination_stop from one result becomes the origin_stop for the next call. " +
    "Supports operators: Ilévia (bus, metro, tram) and SNCF (TER train). " +
    "Parameters: origin_stop and destination_stop are the exact stop names.",
  schema: z.object({
    origin_stop: z
      .string()
      .describe(
        "The exact name of the departure stop, e.g. 'Stadium Lille Métropole', 'Pont de Bois', 'Lille Flandres', 'Valenciennes'"
      ),
    destination_stop: z
      .string()
      .describe(
        "The exact name of the arrival stop, e.g. 'Pont de Bois', 'Lille Flandres', 'Valenciennes', 'Université (UPHF)'"
      ),
    mode: z
      .enum(["bus", "metro", "tram", "train", "any"])
      .default("any")
      .describe("Filter by transport mode, or 'any' to search all modes."),
  }),
  func: async ({ origin_stop, destination_stop, mode }) => {
    // ── OBSERVABILITY: Step-by-step tool execution log ────────────────────────
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[Tool Execution] find_transit_connections invoked`);
    console.log(`   Origin:      ${origin_stop}`);
    console.log(`   Destination: ${destination_stop}`);
    console.log(`   Mode filter: ${mode}`);
    console.log('='.repeat(60));
    // Previously:
    // console.log(`[TransitConnections] 🔍 Tool called: "${origin_stop}" → "${destination_stop}" (mode: ${mode})`);

    try {
      let rows: TransitLineRow[];

      // Use $queryRaw for all queries to safely handle geometry columns.
      // We query by text stop names (not geometry) so no casting is needed.
      if (mode === "any") {
        rows = await prisma.$queryRaw<TransitLineRow[]>`
          SELECT
            id, line_id, line_name, operator, mode,
            origin_stop, destination_stop,
            duration_seconds, distance_meters, sequence
          FROM transit_lines
          WHERE
            LOWER(origin_stop) = LOWER(${origin_stop})
            AND LOWER(destination_stop) = LOWER(${destination_stop})
          ORDER BY sequence ASC, duration_seconds ASC
          LIMIT 5
        `;
      } else {
        rows = await prisma.$queryRaw<TransitLineRow[]>`
          SELECT
            id, line_id, line_name, operator, mode,
            origin_stop, destination_stop,
            duration_seconds, distance_meters, sequence
          FROM transit_lines
          WHERE
            LOWER(origin_stop) = LOWER(${origin_stop})
            AND LOWER(destination_stop) = LOWER(${destination_stop})
            AND LOWER(mode) = LOWER(${mode})
          ORDER BY sequence ASC, duration_seconds ASC
          LIMIT 5
        `;
      }

      console.log(
        `[DB] Found ${rows.length} possible connection(s) for this leg.`
      );
      console.log(
        `[TransitConnections] ✅ Found ${rows.length} connection(s) for "${origin_stop}" → "${destination_stop}"`
      );

      if (rows.length === 0) {
        // Try a broader fuzzy search by origin only to help the agent understand
        // what stops are reachable from this origin.
        const nearbyRows = await prisma.$queryRaw<TransitLineRow[]>`
          SELECT DISTINCT destination_stop, line_name, operator, mode
          FROM transit_lines
          WHERE LOWER(origin_stop) LIKE LOWER(${"%" + origin_stop.split(" ").slice(0, 2).join(" ") + "%"})
          LIMIT 10
        `;

        return JSON.stringify({
          success: false,
          message: `No direct connection found from "${origin_stop}" to "${destination_stop}" (mode: ${mode}). ` +
            `Try checking available connections from this stop.`,
          availableDestinationsFromOrigin: nearbyRows,
        });
      }

      rows.forEach((r) =>
        console.log(
          `   🚌 ${r.line_name} (${r.operator}) — ${r.mode.toUpperCase()} — ${r.duration_seconds}s / ${r.distance_meters}m`
        )
      );

      return JSON.stringify({
        success: true,
        connections: rows,
        count: rows.length,
      });
    } catch (err) {
      const error = err as Error;
      console.error("[TransitConnections] ❌ DB query error:", error.message);
      return JSON.stringify({ success: false, error: error.message });
    }
  },
});
