/**
 * Integration Test: Multi-leg Transit Route (Stadium Lille Métropole → UPHF)
 *
 * Tests the FULL HTTP stack end-to-end:
 *   Auth middleware → Route controller → RouteService → Agent (mocked) → Redis cache → Response
 *
 * The LLM agent is mocked to return a deterministic 4-leg response, making
 * the test fast, reliable, and independent of Gemini API quota.
 *
 * For live LLM testing, use the manual PowerShell commands in the README.
 *
 * Prerequisites:
 *   1. npm run docker:up        (Postgres + Redis must be running)
 *   2. npm run migrate:deploy   (schema applied)
 *   3. npm run seed             (users + GTFS data loaded)
 *
 * Run with: npm test
 */

// ── Set test environment BEFORE any app imports ────────────────────────────────
process.env.NODE_ENV = "test";

// ── Mock the agent module BEFORE importing app ────────────────────────────────
// jest.mock must be at the top level; the factory runs before all imports.
jest.mock("../../agent", () => ({
  runRoutingAgent: jest.fn(),
}));

import supertest from "supertest";
import app from "../../app";
import { prisma } from "../../db/prisma";
import { getRedisClient } from "../../cache/redis";
import { runRoutingAgent } from "../../agent";

// ── Expected 4-leg response the mocked agent will return ──────────────────────
const MOCK_AGENT_OUTPUT = `
Here is the optimal 4-leg transit route from Stadium Lille Métropole to UPHF:

\`\`\`json
{
  "origin": "Stadium Lille Métropole",
  "destination": "Université (UPHF)",
  "legs": [
    {
      "mode": "bus",
      "from": "Stadium Lille Métropole",
      "to": "Pont de Bois",
      "line": "Bus L6",
      "operator": "Ilévia",
      "durationSeconds": 900,
      "distanceMeters": 4200
    },
    {
      "mode": "metro",
      "from": "Pont de Bois",
      "to": "Lille Flandres",
      "line": "Metro Line 2 (direction Eurasanté)",
      "operator": "Ilévia",
      "durationSeconds": 1320,
      "distanceMeters": 8700
    },
    {
      "mode": "train",
      "from": "Lille Flandres",
      "to": "Valenciennes",
      "line": "TER Hauts-de-France",
      "operator": "SNCF",
      "durationSeconds": 2700,
      "distanceMeters": 51000
    },
    {
      "mode": "tram",
      "from": "Valenciennes",
      "to": "Université (UPHF)",
      "line": "Tram T1",
      "operator": "Keolis Valenciennes",
      "durationSeconds": 1080,
      "distanceMeters": 5200
    }
  ],
  "bikeOptions": [],
  "totalEstimatedDurationSeconds": 6000,
  "totalDistanceMeters": 69100
}
\`\`\`
`;

// ── Config ────────────────────────────────────────────────────────────────────
const TEST_EMAIL    = "user@routing.local";
const TEST_PASSWORD = "User1234!";
const TRANSIT_QUERY = "Find the best transit route from Stadium Lille Métropole to the UPHF campus in Valenciennes.";

const EXPECTED_MODES     = ["bus", "metro", "train", "tram"] as const;
const EXPECTED_LEG_COUNT = 4;

// ── Shared state ──────────────────────────────────────────────────────────────
let authToken: string;
let routeResult: Record<string, unknown>;
const mockRunAgent = runRoutingAgent as jest.MockedFunction<typeof runRoutingAgent>;

// ── Lifecycle ─────────────────────────────────────────────────────────────────
beforeAll(async () => {
  // Configure the mock to return our deterministic 4-leg response
  mockRunAgent.mockResolvedValue({
    output: MOCK_AGENT_OUTPUT,
    intermediateSteps: [],
  });
});

afterAll(async () => {
  // Clean up the route_cache row inserted during the test
  try {
    await prisma.routeCache.deleteMany({ where: { query: TRANSIT_QUERY } });
  } catch { /* ignore */ }
  await prisma.$disconnect();
  await getRedisClient().quit();
});

// ── Test Suite ────────────────────────────────────────────────────────────────
describe(
  "Transit Route Integration: Stadium Lille Métropole → UPHF Valenciennes",
  () => {
    beforeAll(async () => {
      // Step 1 — Authenticate
      const loginRes = await supertest(app)
        .post("/api/v1/auth/login")
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
        .set("Content-Type", "application/json")
        .expect(200);

      expect(loginRes.body).toHaveProperty("token");
      authToken = loginRes.body.token as string;
      console.log("\n✅ Authenticated as user@routing.local");

      // Step 2 — Send the routing query (agent is mocked → fast)
      console.log(`🔍 Sending transit query:\n   "${TRANSIT_QUERY}"`);
      const routeRes = await supertest(app)
        .post("/api/v1/route")
        .send({ query: TRANSIT_QUERY })
        .set("Content-Type", "application/json")
        .set("Authorization", `Bearer ${authToken}`)
        .timeout(15_000)
        .expect(200);

      expect(routeRes.body).toHaveProperty("success", true);
      routeResult = routeRes.body.result as Record<string, unknown>;

      console.log("\n📦 Agent response (mocked):");
      console.log(JSON.stringify(routeResult, null, 2));
    }, 30_000);

    // ── Assertion 0: Mock was actually called ──────────────────────────────
    test("runRoutingAgent was called exactly once with the transit query", () => {
      expect(mockRunAgent).toHaveBeenCalledTimes(1);
      expect(mockRunAgent).toHaveBeenCalledWith(TRANSIT_QUERY);
    });

    // ── Assertion 1: Response shape ────────────────────────────────────────
    test("response has correct shape with origin, destination, legs", () => {
      expect(routeResult).toBeDefined();
      expect(routeResult).toHaveProperty("origin");
      expect(routeResult).toHaveProperty("destination");
      expect(routeResult).toHaveProperty("legs");
      expect(Array.isArray(routeResult.legs)).toBe(true);
    });

    // ── Assertion 2: Exactly 4 legs ────────────────────────────────────────
    test(`result contains exactly ${EXPECTED_LEG_COUNT} legs`, () => {
      const legs = routeResult.legs as unknown[];
      expect(legs).toHaveLength(EXPECTED_LEG_COUNT);
    });

    // ── Assertion 3: Correct mode sequence ────────────────────────────────
    test("legs follow mode sequence: bus → metro → train → tram", () => {
      const legs = routeResult.legs as Array<{ mode: string }>;
      expect(legs.map((l) => l.mode)).toEqual(EXPECTED_MODES);
    });

    // ── Assertion 4: Non-zero durations ───────────────────────────────────
    test("each leg has durationSeconds > 0", () => {
      const legs = routeResult.legs as Array<{ durationSeconds: number; mode: string }>;
      legs.forEach((leg, i) => {
        expect(leg.durationSeconds).toBeGreaterThan(0);
        console.log(`  Leg ${i + 1} (${leg.mode}): ${leg.durationSeconds}s`);
      });
    });

    // ── Assertion 5: Duration sum ─────────────────────────────────────────
    test("totalEstimatedDurationSeconds equals sum of all leg durations", () => {
      const legs = routeResult.legs as Array<{ durationSeconds: number }>;
      const legSum = legs.reduce((acc, l) => acc + l.durationSeconds, 0);
      expect(routeResult.totalEstimatedDurationSeconds).toBe(legSum);
    });

    // ── Assertion 6: Leg 1 is Bus from Stadium ────────────────────────────
    test("Leg 1 is a bus leg originating at Stadium Lille Métropole", () => {
      const legs = routeResult.legs as Array<{ mode: string; from: string }>;
      expect(legs[0].mode).toBe("bus");
      expect(legs[0].from.toLowerCase()).toMatch(/stadium/i);
    });

    // ── Assertion 7: Leg 4 arrives at UPHF ───────────────────────────────
    test("Leg 4 is a tram leg arriving at Université (UPHF)", () => {
      const legs = routeResult.legs as Array<{ mode: string; to: string }>;
      expect(legs[3].mode).toBe("tram");
      expect(legs[3].to.toLowerCase()).toMatch(/uphf|universit/i);
    });

    // ── Assertion 8: Result is cached in Redis ────────────────────────────
    test("second identical query returns cached result (X-Cache: HIT)", async () => {
      const cachedRes = await supertest(app)
        .post("/api/v1/route")
        .send({ query: TRANSIT_QUERY })
        .set("Content-Type", "application/json")
        .set("Authorization", `Bearer ${authToken}`)
        .timeout(10_000)
        .expect(200);

      expect(cachedRes.headers["x-cache"]).toBe("HIT");
      // Agent should NOT have been called a second time
      expect(mockRunAgent).toHaveBeenCalledTimes(1);
    });
  }
);
