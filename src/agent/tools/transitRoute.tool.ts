import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { OpenRouteService, TransportMode } from "../../services/openRouteService";

/**
 * LangChain Tool: get_transit_route
 * Calls the OpenRouteService (mock) to get a transit route between two coordinate pairs.
 */
export const transitRouteTool = new DynamicStructuredTool({
  name: "get_transit_route",
  description:
    "Calculates a transit route between two geographic points. " +
    "Use this for the main leg of the journey (train, bus, metro). " +
    "Origin and destination must be [longitude, latitude] pairs obtained from geocode_place.",
  schema: z.object({
    origin: z
      .array(z.number())
      .describe("Origin coordinates as [longitude, latitude] array, e.g. [3.07, 50.63]"),
    destination: z
      .array(z.number())
      .describe("Destination coordinates as [longitude, latitude] array, e.g. [3.12, 50.60]"),
    mode: z
      .enum(["driving", "cycling", "public-transport", "foot-walking"])
      .default("public-transport")
      .describe("The transport mode. Use 'public-transport' for train/bus/metro."),
  }),
  func: async ({ origin, destination, mode }) => {
    try {
      const result = await OpenRouteService.getRoute(
        origin as [number, number],
        destination as [number, number],
        mode as TransportMode
      );
      return JSON.stringify({ success: true, route: result });
    } catch (err) {
      const error = err as Error;
      return JSON.stringify({ success: false, error: error.message });
    }
  },
});
