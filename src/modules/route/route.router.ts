import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { auth } from "../../middleware/auth";
import { rbac } from "../../middleware/rbac";
import { processRoutingQuery } from "./route.service";
import { config } from "../../config";

export const routeRouter = Router();

/**
 * HTTP-level rate limiter: 10 requests per minute per IP.
 * Complements the LLM-level RPM limiter in the agent.
 * Free-tier Gemini limit: 15 RPM → we cap at 10 for safety.
 */
const routeLimiter = rateLimit({
  windowMs: 60 * 1000,       // 1 minute window
  max: config.google.maxRpm, // 10 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  // Bypass the rate limiter entirely during automated testing
  skip: () => config.nodeEnv === "test",
  message: {
    error: "Too Many Requests",
    message: `Rate limit exceeded: max ${config.google.maxRpm} routing requests per minute. Please wait and retry.`,
    retryAfterSeconds: 60,
  },
});

const routeQuerySchema = z.object({
  query: z
    .string()
    .min(10, "Query must be at least 10 characters")
    .max(500, "Query must not exceed 500 characters"),
});

/**
 * POST /api/v1/route
 * Accepts a natural language travel query and returns a multimodal itinerary.
 * Requires: valid JWT (USER or ADMIN role)
 * Rate limited: 10 RPM per IP
 */
routeRouter.post(
  "/",
  auth,
  rbac("USER"),
  routeLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = routeQuerySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Validation Error",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { query } = parsed.data;
    const userId = req.user!.userId;

    try {
      const { result, cached, cacheKey } = await processRoutingQuery(query, userId);

      res.setHeader("X-Cache", cached ? "HIT" : "MISS");
      res.setHeader("X-Cache-Key", cacheKey.substring(0, 16) + "...");

      res.status(200).json({
        success: true,
        query,
        result,
        meta: {
          cached,
          model: config.google.model,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err: unknown) {
      const error = err as Error;
      console.error("[RouteController] Agent error:", error);

      // Check for quota exceeded
      if (error.message?.includes("quota") || error.message?.includes("429")) {
        res.status(429).json({
          error: "LLM Quota Exceeded",
          message: "Google Gemini API rate limit reached. Please try again in a moment.",
        });
        return;
      }

      res.status(500).json({
        error: "Routing Failed",
        message: error.message ?? "An unexpected error occurred during route planning.",
      });
    }
  }
);
