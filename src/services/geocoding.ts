import { Coordinates } from "../modules/route/route.types";
import { prisma } from "../db/prisma";

/**
 * Normalizes a place name for robust matching:
 * lowercase, removes diacritics/accents, trims whitespace and punctuation.
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Geocoding lookup table for Hauts-de-France & Lille metropolitan locations.
 */
const GEOCODE_TABLE: Record<string, Coordinates> = {
  // Lille stations & landmarks
  "lille flandres": { lat: 50.6367, lng: 3.0697 },
  "gare de lille flandres": { lat: 50.6367, lng: 3.0697 },
  "lille europe": { lat: 50.6388, lng: 3.0753 },
  "gare de lille europe": { lat: 50.6388, lng: 3.0753 },
  "republique beaux arts": { lat: 50.6320, lng: 3.0619 },
  "pont de bois": { lat: 50.6272, lng: 3.1258 },
  "euralille": { lat: 50.6376, lng: 3.0742 },
  "cormontaigne": { lat: 50.6258, lng: 3.0776 },
  "wazemmes": { lat: 50.6251, lng: 3.0520 },
  "vieux lille": { lat: 50.6415, lng: 3.0622 },
  "grand place": { lat: 50.6365, lng: 3.0636 },
  "place du general de gaulle": { lat: 50.6365, lng: 3.0636 },
  "grand palais": { lat: 50.6313, lng: 3.0790 },
  "grand palais de lille": { lat: 50.6313, lng: 3.0790 },
  "zenith de lille": { lat: 50.6313, lng: 3.0790 },
  "porte des postes": { lat: 50.6109, lng: 3.0591 },
  "chu de lille": { lat: 50.6115, lng: 3.0490 },

  // University campuses
  "universite de lille": { lat: 50.6083, lng: 3.1313 },
  "university of lille": { lat: 50.6083, lng: 3.1313 },
  "univ lille": { lat: 50.6083, lng: 3.1313 },
  "university campus": { lat: 50.6083, lng: 3.1313 },
  "campus universitaire": { lat: 50.6083, lng: 3.1313 },

  // Stadium Lille Métropole
  "stadium lille metropole": { lat: 50.6117, lng: 3.1306 },
  "stade pierre mauroy": { lat: 50.6117, lng: 3.1306 },
  "decathlon arena": { lat: 50.6117, lng: 3.1306 },

  // Valenciennes area
  "valenciennes": { lat: 50.3580, lng: 3.5237 },
  "gare de valenciennes": { lat: 50.3580, lng: 3.5237 },
  "valenciennes station": { lat: 50.3580, lng: 3.5237 },
  "uphf": { lat: 50.3246, lng: 3.5183 },
  "uphf campus": { lat: 50.3246, lng: 3.5183 },
  "universite uphf": { lat: 50.3246, lng: 3.5183 },
  "universite de valenciennes": { lat: 50.3246, lng: 3.5183 },
  "universite polytechnique hauts de france": { lat: 50.3246, lng: 3.5183 },
};

export interface GeocodingResult {
  lat: number;
  lng: number;
  displayName: string;
  source: "mock" | "database" | "fallback";
}

export class GeocodingService {
  /**
   * Geocode a place name to coordinates.
   * Checks the lookup table first, then queries PostGIS database transit_stations,
   * with a fuzzy fallback.
   */
  static async geocode(place: string): Promise<GeocodingResult> {
    if (!place) {
      return { lat: 50.6292, lng: 3.0573, displayName: "Lille", source: "fallback" };
    }

    const norm = normalizeName(place);

    // 1. Direct Table Match
    if (GEOCODE_TABLE[norm]) {
      return {
        ...GEOCODE_TABLE[norm],
        displayName: place,
        source: "mock",
      };
    }

    // 2. Fuzzy Table Match
    for (const [key, coords] of Object.entries(GEOCODE_TABLE)) {
      if (norm.includes(key) || key.includes(norm)) {
        return {
          ...coords,
          displayName: place,
          source: "mock",
        };
      }
    }

    // 3. Query PostGIS transit_stations in Database
    try {
      const dbMatch = await prisma.$queryRaw<Array<{ name: string; lat: number; lng: number }>>`
        SELECT name, ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng
        FROM transit_stations
        WHERE LOWER(name) LIKE LOWER(${'%' + norm.split(' ')[0] + '%'})
        LIMIT 1
      `;

      if (dbMatch && dbMatch.length > 0) {
        return {
          lat: Number(dbMatch[0].lat),
          lng: Number(dbMatch[0].lng),
          displayName: dbMatch[0].name,
          source: "database",
        };
      }
    } catch (e) {
      console.warn("[Geocoding] DB station query error:", (e as Error).message);
    }

    // 4. Default fallback (Lille city center)
    console.warn(`[Geocoding] No match for "${place}", defaulting to Lille center`);
    return {
      lat: 50.6292,
      lng: 3.0573,
      displayName: `${place} (approximate)`,
      source: "fallback",
    };
  }
}
