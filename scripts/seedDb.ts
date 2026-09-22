/**
 * Database Seed Script
 * Run: npx ts-node scripts/seedDb.ts
 *
 * Seeds the PostGIS database with mock data:
 * - 5 transit stations (train, metro, tram)
 * - 8 bike docks
 * - 1 admin user + 1 regular user
 */
import dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient({ log: ["error"] });

async function main() {
  console.log("🌱 Starting database seed...\n");

  // ── Enable PostGIS (idempotent) ───────────────────────────────────────────
  await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS postgis;`;
  console.log("✅ PostGIS extension enabled");

  // ── Transit Stations ───────────────────────────────────────────────────────
  const stations = [
    { name: "Lille Flandres", type: "train", lng: 3.0697, lat: 50.6367 },
    { name: "Lille Europe", type: "train", lng: 3.0753, lat: 50.6388 },
    { name: "République - Beaux Arts", type: "metro", lng: 3.0619, lat: 50.6320 },
    { name: "Cormontaigne", type: "tram", lng: 3.0776, lat: 50.6258 },
    { name: "Porte des Postes", type: "metro", lng: 3.0591, lat: 50.6109 },
  ];

  for (const s of stations) {
    await prisma.$executeRaw`
      INSERT INTO transit_stations (id, name, type, city, location)
      VALUES (
        gen_random_uuid(),
        ${s.name},
        ${s.type},
        'Lille',
        ST_SetSRID(ST_MakePoint(${s.lng}::float8, ${s.lat}::float8), 4326)
      )
      ON CONFLICT DO NOTHING
    `;
  }
  console.log(`✅ Seeded ${stations.length} transit stations`);

  // ── Bike Docks ────────────────────────────────────────────────────────────
  // Clear existing docks for a clean re-seed
  await prisma.$executeRaw`TRUNCATE TABLE bike_docks;`;

  const docks = [
    // ── Near Lille Flandres station ──────────────────────────────────────────
    { name: "Nextbike - Lille Flandres",      bikes: 5, slots: 12, lng: 3.0700, lat: 50.6370 },
    { name: "Nextbike - Flandres Parvis",     bikes: 4, slots: 10, lng: 3.0715, lat: 50.6358 },

    // ── Near Grand Palais de Lille ───────────────────────────────────────────
    { name: "Nextbike - Grand Palais Est",    bikes: 6, slots: 14, lng: 3.0742, lat: 50.6420 },
    { name: "Nextbike - Grand Palais Ouest",  bikes: 4, slots: 12, lng: 3.0710, lat: 50.6415 },
    { name: "Nextbike - Zenith Lille",        bikes: 3, slots: 10, lng: 3.0755, lat: 50.6425 },

    // ── Euralille / Vieux Lille area ─────────────────────────────────────────
    { name: "Nextbike - Euralille",           bikes: 6, slots: 14, lng: 3.0745, lat: 50.6380 },
    { name: "Nextbike - Vieux Lille",         bikes: 3, slots: 8,  lng: 3.0628, lat: 50.6418 },

    // ── City centre & other zones ────────────────────────────────────────────
    { name: "Nextbike - République",          bikes: 3, slots: 10, lng: 3.0625, lat: 50.6325 },
    { name: "Nextbike - Wazemmes Marché",     bikes: 4, slots: 10, lng: 3.0525, lat: 50.6255 },
    { name: "Nextbike - Cormontaigne",        bikes: 2, slots: 8,  lng: 3.0780, lat: 50.6260 },
    { name: "Nextbike - CHU",                 bikes: 3, slots: 10, lng: 3.0495, lat: 50.6118 },

    // ── University campus ────────────────────────────────────────────────────
    { name: "Nextbike - Campus Cité Scientifique", bikes: 7, slots: 15, lng: 3.1320, lat: 50.6090 },
    { name: "Nextbike - Campus Pont de Bois",      bikes: 4, slots: 10, lng: 3.1340, lat: 50.6072 },
  ];

  for (const d of docks) {
    await prisma.$executeRaw`
      INSERT INTO bike_docks (id, name, available_bikes, total_slots, provider, location)
      VALUES (
        gen_random_uuid(),
        ${d.name},
        ${d.bikes},
        ${d.slots},
        'Nextbike',
        ST_SetSRID(ST_MakePoint(${d.lng}::float8, ${d.lat}::float8), 4326)
      )
      ON CONFLICT DO NOTHING
    `;
  }
  console.log(`✅ Seeded ${docks.length} bike docks`);

  // ── Users ─────────────────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash("Admin1234!", 12);
  const userHash = await bcrypt.hash("User1234!", 12);

  await prisma.user.upsert({
    where: { email: "admin@routing.local" },
    update: {},
    create: {
      email: "admin@routing.local",
      passwordHash: adminHash,
      role: "ADMIN",
    },
  });

  await prisma.user.upsert({
    where: { email: "user@routing.local" },
    update: {},
    create: {
      email: "user@routing.local",
      passwordHash: userHash,
      role: "USER",
    },
  });

  console.log("✅ Seeded 2 users:");
  console.log("   📧 admin@routing.local  | 🔑 Admin1234!  | Role: ADMIN");
  console.log("   📧 user@routing.local   | 🔑 User1234!   | Role: USER");

  // ── Transit Lines (Mock GTFS) ──────────────────────────────────────────────
  await prisma.$executeRaw`TRUNCATE TABLE transit_lines;`;

  const transitLines = [
    { line_id: "ILEVIA-L6", line_name: "Bus L6", operator: "Ilévia", mode: "bus",
      origin_stop: "Stadium Lille Métropole", destination_stop: "Pont de Bois",
      origin_lng: 3.1306, origin_lat: 50.6117, dest_lng: 3.1167, dest_lat: 50.5861,
      duration_seconds: 900, distance_meters: 4200, sequence: 1 },
    { line_id: "ILEVIA-M2", line_name: "Metro Line 2 (direction Eurasanté)", operator: "Ilévia", mode: "metro",
      origin_stop: "Pont de Bois", destination_stop: "Lille Flandres",
      origin_lng: 3.1167, origin_lat: 50.5861, dest_lng: 3.0697, dest_lat: 50.6367,
      duration_seconds: 1320, distance_meters: 8700, sequence: 2 },
    { line_id: "SNCF-TER-LV", line_name: "TER Hauts-de-France", operator: "SNCF", mode: "train",
      origin_stop: "Lille Flandres", destination_stop: "Valenciennes",
      origin_lng: 3.0697, origin_lat: 50.6367, dest_lng: 3.5237, dest_lat: 50.3580,
      duration_seconds: 2700, distance_meters: 51000, sequence: 3 },
    { line_id: "KEOLIS-T1", line_name: "Tram T1", operator: "Keolis Valenciennes", mode: "tram",
      origin_stop: "Valenciennes", destination_stop: "Université (UPHF)",
      origin_lng: 3.5237, origin_lat: 50.3580, dest_lng: 3.5183, dest_lat: 50.3246,
      duration_seconds: 1080, distance_meters: 5200, sequence: 4 },
    // Return directions
    { line_id: "ILEVIA-L6-R", line_name: "Bus L6", operator: "Ilévia", mode: "bus",
      origin_stop: "Pont de Bois", destination_stop: "Stadium Lille Métropole",
      origin_lng: 3.1167, origin_lat: 50.5861, dest_lng: 3.1306, dest_lat: 50.6117,
      duration_seconds: 900, distance_meters: 4200, sequence: 1 },
    { line_id: "ILEVIA-M2-R", line_name: "Metro Line 2 (direction Deux Gares)", operator: "Ilévia", mode: "metro",
      origin_stop: "Lille Flandres", destination_stop: "Pont de Bois",
      origin_lng: 3.0697, origin_lat: 50.6367, dest_lng: 3.1167, dest_lat: 50.5861,
      duration_seconds: 1320, distance_meters: 8700, sequence: 1 },
  ];

  for (const tl of transitLines) {
    await prisma.$executeRaw`
      INSERT INTO transit_lines (
        id, line_id, line_name, operator, mode,
        origin_stop, destination_stop,
        origin_coords, destination_coords,
        duration_seconds, distance_meters, sequence
      ) VALUES (
        gen_random_uuid(), ${tl.line_id}, ${tl.line_name}, ${tl.operator}, ${tl.mode},
        ${tl.origin_stop}, ${tl.destination_stop},
        ST_SetSRID(ST_MakePoint(${tl.origin_lng}::float8, ${tl.origin_lat}::float8), 4326),
        ST_SetSRID(ST_MakePoint(${tl.dest_lng}::float8, ${tl.dest_lat}::float8), 4326),
        ${tl.duration_seconds}, ${tl.distance_meters}, ${tl.sequence}
      )
    `;
  }
  console.log(`✅ Seeded ${transitLines.length} transit line connections (mock GTFS)`);
  console.log("   🚌 Bus L6 (Ilévia): Stadium Lille Métropole → Pont de Bois");
  console.log("   🚇 Metro Line 2 (Ilévia): Pont de Bois → Lille Flandres");
  console.log("   🚆 TER (SNCF): Lille Flandres → Valenciennes");
  console.log("   🚋 Tram T1 (Keolis): Valenciennes → Université (UPHF)");

  console.log("\n🎉 Database seed completed successfully!");
}

main()
  .catch((err) => {
    console.error("\n❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
