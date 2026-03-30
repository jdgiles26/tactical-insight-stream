import { useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import {
  computeGeoClusters,
  findCorrelatedPairs,
  findNearbyProducts,
  type GeoCorrelationResult,
  type GeoCluster,
  type GeoClusterMember,
} from '@/lib/geoCorrelation';

type DataProduct = Database['public']['Tables']['data_products']['Row'];

interface UseGeoCorrelationOptions {
  radiusKm?: number;
  minPoints?: number;
  enabled?: boolean;
  refetchInterval?: number;
}

export function useGeoCorrelation(options?: UseGeoCorrelationOptions) {
  const radiusKm = options?.radiusKm ?? 5;
  const minPoints = options?.minPoints ?? 2;
  const enabled = options?.enabled ?? true;
  const refetchInterval = options?.refetchInterval ?? 30_000;

  // 1. Fetch all geo-located products from Supabase
  const {
    data: geoProducts,
    isLoading,
    error,
  } = useQuery<DataProduct[], Error>({
    queryKey: ['geo_correlation_products', radiusKm, minPoints],
    queryFn: async () => {
      const { data, error: fetchError } = await supabase
        .from('data_products')
        .select('*')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (fetchError) throw fetchError;
      return data as DataProduct[];
    },
    enabled,
    refetchInterval,
  });

  // 2. Compute clusters
  const correlationResult: GeoCorrelationResult | null = useMemo(() => {
    if (!geoProducts || geoProducts.length === 0) return null;
    return computeGeoClusters(geoProducts, { radiusKm, minPoints });
  }, [geoProducts, radiusKm, minPoints]);

  // 3. Compute correlated pairs
  const correlatedPairs = useMemo(() => {
    if (!geoProducts || geoProducts.length === 0) return [];
    return findCorrelatedPairs(geoProducts, radiusKm);
  }, [geoProducts, radiusKm]);

  // Derived: all clusters
  const clusters: GeoCluster[] = useMemo(
    () => correlationResult?.clusters ?? [],
    [correlationResult],
  );

  // Derived: only cross-source clusters
  const crossSourceClusters: GeoCluster[] = useMemo(
    () => clusters.filter((c) => c.crossSourceCorrelated),
    [clusters],
  );

  // Search by location — returns members within radius of a point
  const searchByLocation = useCallback(
    (lat: number, lng: number, searchRadiusKm?: number): GeoClusterMember[] => {
      if (!geoProducts) return [];
      return findNearbyProducts(geoProducts, lat, lng, searchRadiusKm ?? radiusKm);
    },
    [geoProducts, radiusKm],
  );

  // Get the cluster a specific product belongs to
  const getClusterForProduct = useCallback(
    (productId: string): GeoCluster | null => {
      for (const cluster of clusters) {
        if (cluster.members.some((m) => m.productId === productId)) {
          return cluster;
        }
      }
      return null;
    },
    [clusters],
  );

  // Get all other products that are in the same cluster as a given product
  const getCorrelatedProducts = useCallback(
    (productId: string): GeoClusterMember[] => {
      const cluster = getClusterForProduct(productId);
      if (!cluster) return [];
      return cluster.members.filter((m) => m.productId !== productId);
    },
    [getClusterForProduct],
  );

  // Aggregate stats
  const stats = useMemo(
    () => ({
      totalGeoProducts: correlationResult?.totalProducts ?? 0,
      clusteredProducts: correlationResult?.correlatedProducts ?? 0,
      crossSourceClusters: correlationResult?.crossSourceClusters ?? 0,
      avgClusterRadius:
        clusters.length > 0
          ? clusters.reduce((s, c) => s + c.radiusKm, 0) / clusters.length
          : 0,
    }),
    [correlationResult, clusters],
  );

  return {
    correlationResult,
    clusters,
    crossSourceClusters,
    correlatedPairs,
    isLoading,
    error: error ?? null,
    searchByLocation,
    getClusterForProduct,
    getCorrelatedProducts,
    stats,
  };
}
