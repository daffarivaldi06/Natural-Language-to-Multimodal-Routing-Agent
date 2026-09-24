import express, { Application, Request, Response, NextFunction } from "express";
import { config } from "./config";
import { authRouter } from "./modules/auth/auth.router";
import { routeRouter } from "./modules/route/route.router";
import { getRedisClient } from "./cache/redis";
import { prisma } from "./db/prisma";

const app: Application = express();

// ── CORS Middleware ───────────────────────────────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

// ── Global Middleware ─────────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Security headers
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

// ── Health Check ─────────────────────────────────────────────────────────────
app.get("/health", async (_req: Request, res: Response) => {
  let dbStatus = "ok";
  let redisStatus = "ok";

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = "error";
  }

  try {
    const redis = getRedisClient();
    await redis.ping();
  } catch {
    redisStatus = "error";
  }

  const healthy = dbStatus === "ok" && redisStatus === "ok";
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "healthy" : "degraded",
    services: { database: dbStatus, redis: redisStatus },
    model: config.google.model,
    rpmLimit: config.google.maxRpm,
    timestamp: new Date().toISOString(),
  });
});

// ── API Routes ────────────────────────────────────────────────────────────────
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/route", routeRouter);

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not Found", message: "The requested endpoint does not exist." });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[Global Error Handler]", err);
  res.status(500).json({
    error: "Internal Server Error",
    message: config.nodeEnv === "development" ? err.message : "An unexpected error occurred.",
  });
});

export default app;
