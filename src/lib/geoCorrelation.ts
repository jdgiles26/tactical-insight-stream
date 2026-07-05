import type { Database } from '@/integrations/supabase/types';

type DataProduct = Database['public']['Tables']['data_products']['Row'];
type PriorityLevel = Database['public']['Enums']['priority_level'];

// ============================================
// HAVERSINE DISTANCE
// ============================================

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Compute the great-circle distance between two points on the Earth
 * using the Haversine formula.
 * @returns distance in kilometres
 */
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

// ============================================
// TYPES
// ============================================

export interface GeoClusterMember {
  productId: string;
  title: string;
  sourceType: string;
  sourceIdentifier: string | null;
  latitude: number;
  longitude: number;
  priority: string | null;
  priorityScore: number | null;
  createdAt: string;
  distanceFromCentroidKm: number;
}

export interface GeoCluster {
  id: string;
  centroidLat: number;
  centroidLon: number;
  radiusKm: number;
  members: GeoClusterMember[];
  sourceTypes: string[];
  crossSourceCorrelated: boolean;
  avgPriorityScore: number;
  maxPriority: string;
  threatIndicator: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  createdRange: { earliest: string; latest: string };
}

export interface GeoCorrelationResult {
  clusters: GeoCluster[];
  totalProducts: number;
  correlatedProducts: number;
  crossSourceClusters: number;
  singletons: GeoClusterMember[];
}

// ============================================
// INTERNAL HELPERS
// ============================================

const PRIORITY_ORDER: Record<string, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  routine: 1,
};

const THREAT_ORDER: Record<string, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  NONE: 0,
};

function priorityRank(p: string | null): number {
  if (!p) return 0;
  return PRIORITY_ORDER[p] ?? 0;
}

function highestPriority(members: GeoClusterMember[]): string {
  let best: string = 'routine';
  let bestRank = 0;
  for (const m of members) {
    const r = priorityRank(m.priority);
    if (r > bestRank) {
      bestRank = r;
      best = m.priority ?? 'routine';
    }
  }
  return best;
}

function productToMember(p: DataProduct, distanceFromCentroidKm: number): GeoClusterMember {
  return {
    productId: p.id,
    title: p.title,
    sourceType: p.source_type,
    sourceIdentifier: p.source_identifier,
    latitude: p.latitude!,
    longitude: p.longitude!,
    priority: p.priority,
    priorityScore: p.priority_score,
    createdAt: p.created_at,
    distanceFromCentroidKm,
  };
}

function computeThreatIndicator(
  crossSource: boolean,
  maxPriorityStr: string,
): GeoCluster['threatIndicator'] {
  const rank = priorityRank(maxPriorityStr);
  // HIGH: cross-source AND any member critical or high
  if (crossSource && rank >= PRIORITY_ORDER.high) return 'HIGH';
  // MEDIUM: cross-source OR any member medium+
  if (crossSource || rank >= PRIORITY_ORDER.medium) return 'MEDIUM';
  // LOW: single source cluster
  if (rank >= PRIORITY_ORDER.low) return 'LOW';
  return 'NONE';
}

function buildCluster(index: number, clusterProducts: DataProduct[]): GeoCluster {
  // Centroid = average lat/lng
  const centroidLat = clusterProducts.reduce((s, p) => s + p.latitude!, 0) / clusterProducts.length;
  const centroidLon = clusterProducts.reduce((s, p) => s + p.longitude!, 0) / clusterProducts.length;

  // Build members with distance from centroid
  const members: GeoClusterMember[] = clusterProducts.map((p) => {
    const dist = haversineDistanceKm(centroidLat, centroidLon, p.latitude!, p.longitude!);
    return productToMember(p, dist);
  });

  const radiusKm = members.reduce((max, m) => Math.max(max, m.distanceFromCentroidKm), 0);

  const sourceTypes = [...new Set(members.map((m) => m.sourceType))];
  const crossSourceCorrelated = sourceTypes.length >= 2;

  const scores = members.filter((m) => m.priorityScore !== null).map((m) => m.priorityScore!);
  const avgPriorityScore = scores.length > 0 ? scores.reduce((s, v) => s + v, 0) / scores.length : 0;

  const maxPriority = highestPriority(members);
  const threatIndicator = computeThreatIndicator(crossSourceCorrelated, maxPriority);

  const timestamps = members.map((m) => m.createdAt).sort();
  const createdRange = {
    earliest: timestamps[0],
    latest: timestamps[timestamps.length - 1],
  };

  return {
    id: `cluster-${index}`,
    centroidLat,
    centroidLon,
    radiusKm,
    members,
    sourceTypes,
    crossSourceCorrelated,
    avgPriorityScore,
    maxPriority,
    threatIndicator,
    createdRange,
  };
}

// ============================================
// DBSCAN-STYLE CLUSTERING
// ============================================

/**
 * Cluster geo-located data products using a DBSCAN-style algorithm.
 *
 * @param products  Raw data products from Supabase
 * @param options   radiusKm (default 5) — neighbourhood radius;
 *                  minPoints (default 2) — minimum products to form a cluster
 */
export function computeGeoClusters(
  products: DataProduct[],
  options?: {
    radiusKm?: number;
    minPoints?: number;
  },
): GeoCorrelationResult {
  const radiusKm = options?.radiusKm ?? 5;
  const minPoints = options?.minPoints ?? 2;

  // 1. Filter to geo-located products only
  const geoProducts = products.filter(
    (p) => p.latitude !== null && p.longitude !== null,
  );

  const n = geoProducts.length;

  // DBSCAN bookkeeping
  const UNVISITED = 0;
  const NOISE = -1;
  const labels = new Array<number>(n).fill(UNVISITED);
  let clusterId = 0;

  // Pre-compute distance matrix (O(n²), fine for ≤1000)
  // We only need the neighbour lists
  function regionQuery(idx: number): number[] {
    const neighbours: number[] = [];
    const p = geoProducts[idx];
    for (let j = 0; j < n; j++) {
      if (j === idx) continue;
      const q = geoProducts[j];
      if (haversineDistanceKm(p.latitude!, p.longitude!, q.latitude!, q.longitude!) <= radiusKm) {
        neighbours.push(j);
      }
    }
    return neighbours;
  }

  for (let i = 0; i < n; i++) {
    if (labels[i] !== UNVISITED) continue;

    const neighbours = regionQuery(i);

    // Need at least (minPoints - 1) neighbours (plus the point itself = minPoints)
    if (neighbours.length < minPoints - 1) {
      labels[i] = NOISE;
      continue;
    }

    // Start a new cluster
    clusterId++;
    labels[i] = clusterId;

    const seedSet = [...neighbours];
    let seedIdx = 0;

    while (seedIdx < seedSet.length) {
      const q = seedSet[seedIdx];
      seedIdx++;

      if (labels[q] === NOISE) {
        // Border point — absorb into cluster
        labels[q] = clusterId;
      }

      if (labels[q] !== UNVISITED) continue;

      labels[q] = clusterId;

      const qNeighbours = regionQuery(q);
      if (qNeighbours.length >= minPoints - 1) {
        // Expand seed set
        for (const nb of qNeighbours) {
          if (!seedSet.includes(nb)) {
            seedSet.push(nb);
          }
        }
      }
    }
  }

  // Group products by cluster label
  const clusterMap = new Map<number, DataProduct[]>();
  const noiseProducts: DataProduct[] = [];

  for (let i = 0; i < n; i++) {
    if (labels[i] === NOISE) {
      noiseProducts.push(geoProducts[i]);
    } else {
      const cid = labels[i];
      if (!clusterMap.has(cid)) clusterMap.set(cid, []);
      clusterMap.get(cid)!.push(geoProducts[i]);
    }
  }

  // Build GeoCluster objects
  let clusterIndex = 0;
  const clusters: GeoCluster[] = [];
  for (const [, clusterProducts] of clusterMap) {
    clusters.push(buildCluster(clusterIndex, clusterProducts));
    clusterIndex++;
  }

  // Sort by threat (desc) then member count (desc)
  clusters.sort((a, b) => {
    const threatDiff = THREAT_ORDER[b.threatIndicator] - THREAT_ORDER[a.threatIndicator];
    if (threatDiff !== 0) return threatDiff;
    return b.members.length - a.members.length;
  });

  // Re-index cluster ids after sorting
  clusters.forEach((c, i) => {
    c.id = `cluster-${i}`;
  });

  // Build singletons (noise points)
  const singletons: GeoClusterMember[] = noiseProducts.map((p) =>
    productToMember(p, 0),
  );

  const correlatedProducts = clusters.reduce((s, c) => s + c.members.length, 0);
  const crossSourceClusters = clusters.filter((c) => c.crossSourceCorrelated).length;

  return {
    clusters,
    totalProducts: n,
    correlatedProducts,
    crossSourceClusters,
    singletons,
  };
}

// ============================================
// PROXIMITY SEARCH
// ============================================

/**
 * Find all products within a given radius of a centre point.
 * Returns results sorted by distance ascending.
 */
export function findNearbyProducts(
  products: DataProduct[],
  centerLat: number,
  centerLon: number,
  radiusKm: number,
): GeoClusterMember[] {
  const results: GeoClusterMember[] = [];

  for (const p of products) {
    if (p.latitude === null || p.longitude === null) continue;
    const dist = haversineDistanceKm(centerLat, centerLon, p.latitude, p.longitude);
    if (dist <= radiusKm) {
      results.push(productToMember(p, dist));
    }
  }

  results.sort((a, b) => a.distanceFromCentroidKm - b.distanceFromCentroidKm);
  return results;
}

// ============================================
// PRODUCT PAIR PROXIMITY
// ============================================

/**
 * Find all pairs of geo-located products within `radiusKm` of each other.
 * Useful for drawing connection lines on a map.
 */
export function findCorrelatedPairs(
  products: DataProduct[],
  radiusKm: number = 5,
): Array<{
  productA: GeoClusterMember;
  productB: GeoClusterMember;
  distanceKm: number;
  crossSource: boolean;
}> {
  const geoProducts = products.filter(
    (p) => p.latitude !== null && p.longitude !== null,
  );

  const pairs: Array<{
    productA: GeoClusterMember;
    productB: GeoClusterMember;
    distanceKm: number;
    crossSource: boolean;
  }> = [];

  for (let i = 0; i < geoProducts.length; i++) {
    for (let j = i + 1; j < geoProducts.length; j++) {
      const a = geoProducts[i];
      const b = geoProducts[j];
      const dist = haversineDistanceKm(a.latitude!, a.longitude!, b.latitude!, b.longitude!);
      if (dist <= radiusKm) {
        pairs.push({
          productA: productToMember(a, 0),
          productB: productToMember(b, 0),
          distanceKm: dist,
          crossSource: a.source_type !== b.source_type,
        });
      }
    }
  }

  return pairs;
}

// ============================================
// THREAT LEVEL HELPERS
// ============================================

/** Map threat indicator to a display colour (hex). */
export function getClusterThreatColor(threat: GeoCluster['threatIndicator']): string {
  switch (threat) {
    case 'HIGH':
      return '#ef4444';
    case 'MEDIUM':
      return '#f59e0b';
    case 'LOW':
      return '#22c55e';
    case 'NONE':
    default:
      return '#6b7280';
  }
}

/** Human-readable summary of a cluster. */
export function getClusterDescription(cluster: GeoCluster): string {
  const count = cluster.members.length;
  const radius = cluster.radiusKm.toFixed(1);
  const types = cluster.sourceTypes.join(', ');
  return `${count} source${count === 1 ? '' : 's'} correlated within ${radius}km: ${types} — ${cluster.threatIndicator} threat`;
}
