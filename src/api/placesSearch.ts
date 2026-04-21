/**
 * Photon (komoot) place autocomplete — free, no API key, OSM-backed.
 * Docs: https://photon.komoot.io/
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface PlaceSuggestion extends LatLng {
  name: string;
}

const PHOTON_URL = 'https://photon.komoot.io/api/';
const MAX_RESULT_DISTANCE_M = 500_000;
const CACHE_MAX_ENTRIES = 50;

const searchCache = new Map<string, PlaceSuggestion[]>();

function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

function buildPhotonUrl(query: string, origin?: LatLng): string {
  const params = new URLSearchParams({ q: query, limit: '10' });
  if (origin) {
    params.set('lat', origin.lat.toFixed(5));
    params.set('lon', origin.lng.toFixed(5));
  }
  return `${PHOTON_URL}?${params.toString()}`;
}

function formatPhotonName(props: Record<string, any>): string {
  const parts = [
    props.name,
    [props.housenumber, props.street].filter(Boolean).join(' '),
    props.city || props.county,
    props.state,
    props.country,
  ].filter(Boolean) as string[];
  return parts.filter((p, i) => p !== parts[i - 1]).join(', ');
}

export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
  origin?: LatLng,
): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (!q) return [];

  const cacheKey = origin
    ? `${q}|${origin.lat.toFixed(2)}|${origin.lng.toFixed(2)}`
    : q;
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  const res = await fetch(buildPhotonUrl(q, origin), {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!res.ok) throw new Error(`Photon ${res.status}`);
  const data = await res.json();

  let results: PlaceSuggestion[] = (data?.features || [])
    .map((f: any): PlaceSuggestion | null => {
      const [lng, lat] = f.geometry?.coordinates || [];
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng, name: formatPhotonName(f.properties || {}) };
    })
    .filter((r: PlaceSuggestion | null): r is PlaceSuggestion => r !== null);

  if (origin) {
    results = results
      .map((r) => ({ ...r, _d: haversineMeters(origin, { lat: r.lat, lng: r.lng }) }))
      .filter((r) => r._d <= MAX_RESULT_DISTANCE_M)
      .sort((a, b) => a._d - b._d)
      .map(({ _d, ...rest }) => rest);
  }

  const top = results.slice(0, 5);

  if (searchCache.size >= CACHE_MAX_ENTRIES) {
    const firstKey = searchCache.keys().next().value;
    if (firstKey !== undefined) searchCache.delete(firstKey);
  }
  searchCache.set(cacheKey, top);

  return top;
}
