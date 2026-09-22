import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { GeocodingService } from "../../services/geocoding";

/**
 * LangChain Tool: geocode_place
 * Converts a human-readable place name into geographic coordinates.
 */
export const geocodeTool = new DynamicStructuredTool({
  name: "geocode_place",
  description:
    "Converts a human-readable place name or address into geographic coordinates (latitude and longitude). " +
    "Use this tool for EVERY named location before calling any routing or bike tool.",
  schema: z.object({
    place: z.string().describe("The name of the place or address to geocode, e.g. 'Lille Flandres', 'Université de Lille'"),
  }),
  func: async ({ place }) => {
    try {
      const result = await GeocodingService.geocode(place);
      return JSON.stringify({
        success: true,
        place,
        lat: result.lat,
        lng: result.lng,
        displayName: result.displayName,
        source: result.source,
      });
    } catch (err) {
      const error = err as Error;
      return JSON.stringify({ success: false, error: error.message });
    }
  },
});
