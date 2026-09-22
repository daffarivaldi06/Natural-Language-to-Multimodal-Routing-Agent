import { Coordinates } from "../modules/route/route.types";

/**
 * Mock geocoding service using a local lookup table of known Lille landmarks.
 * In production, replace with a real Nominatim or Google Maps Geocoding call.
 */
const GEOCODE_TABLE: Record<string, Coordinates> = {
  // ── Lille stations & landmarks ───────────────────────────────────────────
  "lille flandres": { lat: 50.6367, lng: 3.0697 },
  "gare de lille flandres": { lat: 50.6367, lng: 3.0697 },
  "lille europe": { lat: 50.6388, lng: 3.0753 },
  "gare de lille europe": { lat: 50.6388, lng: 3.0753 },
  "republique beaux arts": { lat: 50.6320, lng: 3.0619 },
  "pont de bois": { lat: 50.5861, lng: 3.1167 },
  "euralille": { lat: 50.6376, lng: 3.0742 },
  "cormontaigne": { lat: 50.6258, lng: 3.0776 },
  "wazemmes": { lat: 50.6251, lng: 3.0520 },
  "vieux lille": { lat: 50.6415, lng: 3.0622 },
  "grand place": { lat: 50.6365, lng: 3.0636 },
  "place du général de gaulle": { lat: 50.6365, lng: 3.0636 },
  "grand palais": { lat: 50.6413, lng: 3.0730 },
  "grand palais de lille": { lat: 50.6413, lng: 3.0730 },
  "zenith de lille": { lat: 50.6413, lng: 3.0730 },
  "porte des postes": { lat: 50.6109, lng: 3.0591 },
  "chu de lille": { lat: 50.6115, lng: 3.0490 },

  // ── University campuses ───────────────────────────────────────────────────
  "université de lille": { lat: 50.6083, lng: 3.1313 },
  "university of lille": { lat: 50.6083, lng: 3.1313 },
  "univ lille": { lat: 50.6083, lng: 3.1313 },
  "university campus": { lat: 50.6083, lng: 3.1313 },
  "campus universitaire": { lat: 50.6083, lng: 3.1313 },

  // ── Stadium Lille Métropole ───────────────────────────────────────────────
  "stadium lille métropole": { lat: 50.6117, lng: 3.1306 },
  "stadium lille metropole": { lat: 50.6117, lng: 3.1306 },
  "stade pierre mauroy": { lat: 50.6117, lng: 3.1306 },
  "decathlon arena": { lat: 50.6117, lng: 3.1306 },

  // ── Valenciennes area ─────────────────────────────────────────────────────
  "valenciennes": { lat: 50.3580, lng: 3.5237 },
  "gare de valenciennes": { lat: 50.3580, lng: 3.5237 },
  "valenciennes station": { lat: 50.3580, lng: 3.5237 },
  "uphf": { lat: 50.3246, lng: 3.5183 },
  "université de valenciennes": { lat: 50.3246, lng: 3.5183 },
  "uphf campus": { lat: 50.3246, lng: 3.5183 },
  "université polytechnique hauts-de-france": { lat: 50.3246, lng: 3.5183 },
  "université polytechnique hauts de france": { lat: 50.3246, lng: 3.5183 },
};

export interface GeocodingResult {
  lat: number;
  lng: number;
  displayName: string;
  source: "mock" | "nominatim";
}

export class GeocodingService {
  /**
   * Geocode a place name to coordinates.
   * Falls back to a fuzzy match on the local lookup table.
   */
  static async geocode(place: string): Promise<GeocodingResult> {
    const normalized = place.toLowerCase().trim();

    // Exact match
    if (GEOCODE_TABLE[normalized]) {
      return {
        ...GEOCODE_TABLE[normalized],
        displayName: place,
        source: "mock",
      };
    }

    // Fuzzy / partial match
    for (const [key, coords] of Object.entries(GEOCODE_TABLE)) {
      if (normalized.includes(key) || key.includes(normalized)) {
        return {
          ...coords,
          displayName: key,
          source: "mock",
        };
      }
    }

    // Default fallback to Lille city center
    console.warn(`[Geocoding] No match for "${place}", defaulting to Lille center`);
    return {
      lat: 50.6292,
      lng: 3.0573,
      displayName: `${place} (approximate)`,
      source: "mock",
    };
  }
}
