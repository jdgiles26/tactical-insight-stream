import { useState, useEffect, useCallback } from 'react';
import { ddilOptimizer, type NetworkState, type TransportClassification } from '@/lib/ddilOptimizer';

export function useDDILStatus(refreshInterval = 3000) {
  const [networkState, setNetworkState] = useState<NetworkState>(() => ddilOptimizer.getNetworkState());
  
  useEffect(() => {
    const interval = setInterval(() => {
      setNetworkState(ddilOptimizer.getNetworkState());
    }, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);
  
  const classifyProduct = useCallback((product: any): TransportClassification => {
    return ddilOptimizer.classifyDataForTransport(product);
  }, []);
  
  const getMetadataPayload = useCallback((product: any) => {
    return ddilOptimizer.getMetadataPayload(product);
  }, []);
  
  return { networkState, classifyProduct, getMetadataPayload };
}
