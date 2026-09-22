/**
 * Mock Nextbike API client.
 * Mirrors the Nextbike API v3 bike-station response shape.
 * Real API: https://api.nextbike.net/maps/nextbike-live.json
 *
 * In production: set NEXTBIKE_API_KEY and replace mock with real HTTP call.
 */

export interface NextbikeStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  availableBikes: number;
  totalSlots: number;
  provider: string;
}

export interface NextbikeResponse {
  stations: NextbikeStation[];
  city: string;
  timestamp: string;
}

// Static mock stations — seeded to mirror what is in the PostGIS DB
const MOCK_STATIONS: NextbikeStation[] = [
  { id: "dock-1", name: "Nextbike - Lille Flandres", lat: 50.6370, lng: 3.0700, availableBikes: 5, totalSlots: 12, provider: "Nextbike" },
  { id: "dock-2", name: "Nextbike - République", lat: 50.6325, lng: 3.0625, availableBikes: 3, totalSlots: 10, provider: "Nextbike" },
  { id: "dock-3", name: "Nextbike - Campus Cité Scientifique", lat: 50.6090, lng: 3.1320, availableBikes: 7, totalSlots: 15, provider: "Nextbike" },
  { id: "dock-4", name: "Nextbike - Cormontaigne", lat: 50.6260, lng: 3.0780, availableBikes: 2, totalSlots: 8, provider: "Nextbike" },
  { id: "dock-5", name: "Nextbike - Wazemmes Marché", lat: 50.6255, lng: 3.0525, availableBikes: 4, totalSlots: 10, provider: "Nextbike" },
  { id: "dock-6", name: "Nextbike - Euralille", lat: 50.6380, lng: 3.0745, availableBikes: 6, totalSlots: 14, provider: "Nextbike" },
  { id: "dock-7", name: "Nextbike - Vieux Lille", lat: 50.6418, lng: 3.0628, availableBikes: 1, totalSlots: 8, provider: "Nextbike" },
  { id: "dock-8", name: "Nextbike - CHU", lat: 50.6118, lng: 3.0495, availableBikes: 3, totalSlots: 10, provider: "Nextbike" },
];

export class NextbikeService {
  /**
   * Find nearby bike stations within a given radius.
   * This mock computes Euclidean distance in degrees; PostGIS spatial query
   * in bikeAvailability.tool.ts handles the real geodesic query.
   */
  static async getNearbyStations(
    lat: number,
    lng: number,
    radiusKm: number = 0.5
  ): Promise<NextbikeResponse> {
    console.log(`[Nextbike Mock] Searching stations within ${radiusKm}km of (${lat}, ${lng})`);

    const nearby = MOCK_STATIONS.filter((station) => {
      const latDiff = station.lat - lat;
      const lngDiff = station.lng - lng;
      const distKm = Math.sqrt(latDiff ** 2 + lngDiff ** 2) * 111;
      return distKm <= radiusKm;
    });

    return {
      stations: nearby,
      city: "Lille",
      timestamp: new Date().toISOString(),
    };
  }
}
