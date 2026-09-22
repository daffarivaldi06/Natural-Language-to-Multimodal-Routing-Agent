import app from "./app";
import { config } from "./config";
import { prisma } from "./db/prisma";
import { getRedisClient } from "./cache/redis";

async function bootstrap() {
  try {
    // Verify DB connection
    await prisma.$connect();
    console.log("[Bootstrap] PostgreSQL connected");

    // Verify Redis connection
    const redis = getRedisClient();
    await redis.ping();
    console.log("[Bootstrap] Redis connected");

    // Start HTTP server
    const server = app.listen(config.port, () => {
      console.log(`
╔════════════════════════════════════════════════════════════╗
║  🚀 Natural Language to Multimodal Routing Agent           ║
║  ──────────────────────────────────────────────────────── ║
║  Server:   http://localhost:${config.port}                        ║
║  Model:    ${config.google.model}                  ║
║  RPM Cap:  ${config.google.maxRpm} requests/minute                         ║
║  Env:      ${config.nodeEnv}                                  ║
╚════════════════════════════════════════════════════════════╝
      `);
    });

    // Safeguard: increase timeout to 120s so multi-leg LLM queries
    // (which can take 30-60s) don't drop the socket connection.
    server.setTimeout(120_000);
    console.log("[Bootstrap] HTTP server timeout set to 120s");

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`\n[Bootstrap] ${signal} received. Shutting down gracefully...`);
      server.close(async () => {
        await prisma.$disconnect();
        const redis = getRedisClient();
        await redis.quit();
        console.log("[Bootstrap] All connections closed. Exiting.");
        process.exit(0);
      });
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (err) {
    console.error("[Bootstrap] Fatal startup error:", err);
    process.exit(1);
  }
}

bootstrap();
