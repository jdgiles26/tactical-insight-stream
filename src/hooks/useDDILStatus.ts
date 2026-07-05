import { useState, useEffect, useCallback } from 'react';
import {
  ddilOptimizer,
  type NetworkState,
  type TransportClassification,
  type QueueItem,
} from '@/lib/ddilOptimizer';

/**
 * Hook that exposes real network state from the DDIL optimizer.
 * Subscribes to the optimizer's event-driven updates (browser online/offline,
 * navigator.connection changes, heartbeat probes) plus a fallback poll.
 */
export function useDDILStatus(pollInterval = 5000) {
  const [networkState, setNetworkState] = useState<NetworkState>(
    () => ddilOptimizer.getNetworkState()
  );
  const [queue, setQueue] = useState<QueueItem[]>(
    () => ddilOptimizer.getTransportQueue()
  );

  useEffect(() => {
    // Event-driven updates from real browser API changes & heartbeat probes
    const unsub = ddilOptimizer.subscribe((s) => {
      setNetworkState(s);
      setQueue(ddilOptimizer.getTransportQueue());
    });

    // Fallback poll for queue changes (enqueue/dequeue don't fire subscribe)
    const timer = setInterval(() => {
      setNetworkState(ddilOptimizer.getNetworkState());
      setQueue(ddilOptimizer.getTransportQueue());
    }, pollInterval);

    return () => {
      unsub();
      clearInterval(timer);
    };
  }, [pollInterval]);

  const classifyProduct = useCallback(
    (product: any): TransportClassification =>
      ddilOptimizer.classifyDataForTransport(product),
    []
  );

  const enqueue = useCallback((product: any) => {
    ddilOptimizer.enqueue(product);
    setQueue(ddilOptimizer.getTransportQueue());
  }, []);

  const dequeue = useCallback((productId: string) => {
    ddilOptimizer.dequeue(productId);
    setQueue(ddilOptimizer.getTransportQueue());
  }, []);

  const queueSummary = ddilOptimizer.getQueueSummary();

  return {
    networkState,
    queue,
    queueSummary,
    classifyProduct,
    enqueue,
    dequeue,
  };
}
