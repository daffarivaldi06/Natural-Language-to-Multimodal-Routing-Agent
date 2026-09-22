export interface Coordinates {
  lat: number;
  lng: number;
}

export interface RouteLeg {
  mode: "train" | "bus" | "metro" | "tram" | "bike" | "walk";
  from: string;
  to: string;
  durationSeconds: number;
  distanceMeters: number;
  /** Coordinates of the boarding/origin point */
  originCoords?: Coordinates;
  /** Coordinates of the alighting/destination point */
  destinationCoords?: Coordinates;
}

export interface BikeOption {
  id: string;
  name: string;
  availableBikes: number;
  totalSlots: number;
  provider: string;
  distanceMeters: number;
  walkToDocK?: number;
}

export interface RoutingResult {
  origin: string;
  destination: string;
  legs: RouteLeg[];
  bikeOptions?: BikeOption[];
  totalEstimatedDurationSeconds: number;
  totalDistanceMeters: number;
  cachedAt?: string;
  agentThought?: string;
}

export interface RouteRequestBody {
  query: string;
}
