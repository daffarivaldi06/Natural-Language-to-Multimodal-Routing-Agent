## 2025-02-12 - Parallelized and Deduplicated Route Leg Geocoding
**Learning:** In multimodal transit routing, the destination of leg N is almost always the origin of leg N+1. A sequential geocoding loop not only blocks on each request but also redundantly queries the database for the transfer stations.
**Action:** Always process leg enrichments in parallel using `Promise.all` and deduplicate API/DB calls using an in-memory promise cache for the duration of the request to prevent N+1 and duplicate queries.
