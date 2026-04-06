/**
 * DDIL (Disconnected, Intermittent, Low-bandwidth) Optimization Engine
 *
 * Simulates network-constrained environments and provides intelligent
 * data routing decisions for tactical edge deployments.
 */

import type { Database } from "@/integrations/supabase/types";

type DataProduct = Database["public"]["Tables"]["data_products"]["Row"];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LinkType = "satcom" | "hf_radio" | "mesh" | "lte" | "wifi" | "wired";

export type NetworkStatus = "connected" | "degraded" | "intermittent" | "disconnected";

export interface NetworkState {
  status: NetworkStatus;
  bandwidth_kbps: number;
  latency_ms: number;
  packet_loss_pct: number;
  last_heartbeat: string;
  link_type: LinkType;
}

export type PriorityClass = "flash" | "immediate" | "priority" | "routine" | "deferred";

export type TransportStrategy =
  | "full_push"
  | "metadata_first"
  | "compressed"
  | "queued"
  | "hold";

export interface TransportClassification {
  priority_class: PriorityClass;
  transport_strategy: TransportStrategy;
  estimated_transfer_time_s: number;
  compression_ratio: number;
  can_send_now: boolean;
}

export interface MetadataPayload {
  id: string;
  title: string;
  source_type: string;
  priority: string | null;
  priority_score: number | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  content_summary: string;
}

export interface BandwidthAllocationEntry {
  priority_class: PriorityClass;
  allocated_pct: number;
  allocated_kbps: number;
  queue_depth: number;
}

export interface BandwidthAllocationPlan {
  total_bandwidth_kbps: number;
  network_status: NetworkStatus;
  allocations: BandwidthAllocationEntry[];
}

interface QueueItem {
  product_id: string;
  title: string;
  classification: TransportClassification;
  enqueued_at: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LINK_PROFILES: Record<LinkType, { maxBw: number; baseLatency: number }> = {
  wired:    { maxBw: 10000, baseLatency: 5 },
  wifi:     { maxBw: 5000,  baseLatency: 15 },
  lte:      { maxBw: 2000,  baseLatency: 40 },
  satcom:   { maxBw: 512,   baseLatency: 600 },
  mesh:     { maxBw: 256,   baseLatency: 120 },
  hf_radio: { maxBw: 32,    baseLatency: 800 },
};

const LINK_TYPES: LinkType[] = ["satcom", "hf_radio", "mesh", "lte", "wifi", "wired"];

const BASE_ALLOCATIONS: Record<PriorityClass, number> = {
  flash: 40,
  immediate: 30,
  priority: 20,
  routine: 8,
  deferred: 2,
};

/** Rough average payload size per product in KB */
const AVG_PAYLOAD_KB = 24;

// ---------------------------------------------------------------------------
// DDILOptimizer
// ---------------------------------------------------------------------------

export class DDILOptimizer {
  private startTime: number;
  private queue: QueueItem[] = [];

  constructor() {
    this.startTime = Date.now();
  }

  // ---- Network simulation ------------------------------------------------

  /**
   * Returns a simulated but realistic network state.
   *
   * Uses sin-wave oscillation seeded from elapsed time so the network
   * cycles through good → degraded → intermittent → disconnected phases.
   */
  getNetworkState(): NetworkState {
    const elapsed = (Date.now() - this.startTime) / 1000; // seconds

    // Primary cycle: ~120 s period
    const wave1 = Math.sin(elapsed * (2 * Math.PI) / 120);
    // Secondary jitter: ~17 s period
    const wave2 = Math.sin(elapsed * (2 * Math.PI) / 17) * 0.3;
    // Combined normalised to [0, 1]
    const combined = (wave1 + wave2 + 1.3) / 2.6; // range ≈ [0, 1]
    const clamped = Math.max(0, Math.min(1, combined));

    // Map to link type based on combined signal strength
    const linkIdx = Math.min(
      LINK_TYPES.length - 1,
      Math.floor(clamped * LINK_TYPES.length)
    );
    const link_type = LINK_TYPES[linkIdx];
    const profile = LINK_PROFILES[link_type];

    // Bandwidth varies within the link's capability
    const bwFactor = 0.4 + clamped * 0.6; // 40-100 % of max
    const bandwidth_kbps = Math.round(profile.maxBw * bwFactor);

    // Latency inversely related to signal quality, with jitter
    const jitter = Math.abs(Math.sin(elapsed * 1.7)) * 80;
    const latency_ms = Math.round(profile.baseLatency + jitter * (1 - clamped));

    // Packet loss increases as signal degrades
    const packet_loss_pct = Math.round(Math.max(0, (1 - clamped) * 35 + Math.random() * 5));

    // Determine status
    let status: NetworkStatus;
    if (clamped > 0.7) {
      status = "connected";
    } else if (clamped > 0.4) {
      status = "degraded";
    } else if (clamped > 0.15) {
      status = "intermittent";
    } else {
      status = "disconnected";
    }

    return {
      status,
      bandwidth_kbps,
      latency_ms,
      packet_loss_pct,
      last_heartbeat: new Date().toISOString(),
      link_type,
    };
  }

  // ---- Priority mapping --------------------------------------------------

  private mapPriorityClass(product: DataProduct): PriorityClass {
    const prio = product.priority ?? "routine";
    const score = product.priority_score ?? 0;
    const contentText = this.extractContentText(product);
    const isEmergency =
      contentText.toLowerCase().includes("emergency") ||
      contentText.toLowerCase().includes("mayday") ||
      contentText.toLowerCase().includes("sos");

    if (prio === "critical" && isEmergency) return "flash";
    if (prio === "critical") return "immediate";
    if (prio === "high") return "priority";
    if (prio === "medium") return "routine";
    // low / routine
    return "deferred";
  }

  private determineStrategy(
    priorityClass: PriorityClass,
    network: NetworkState
  ): TransportStrategy {
    if (network.status === "disconnected") return "queued";

    const bw = network.bandwidth_kbps;

    if (bw < 32) {
      // Extremely constrained
      if (priorityClass === "flash") return "full_push";
      if (priorityClass === "immediate") return "metadata_first";
      return "hold";
    }

    if (bw < 128) {
      // Low bandwidth
      if (priorityClass === "flash" || priorityClass === "immediate") return "full_push";
      return "metadata_first";
    }

    // Decent bandwidth
    if (priorityClass === "flash" || priorityClass === "immediate") return "full_push";
    if (priorityClass === "priority") return "compressed";
    if (priorityClass === "routine") return "compressed";
    return "metadata_first"; // deferred
  }

  // ---- Transport classification ------------------------------------------

  classifyDataForTransport(product: DataProduct): TransportClassification {
    const network = this.getNetworkState();
    const priorityClass = this.mapPriorityClass(product);
    const strategy = this.determineStrategy(priorityClass, network);

    // Compression ratio depends on strategy
    let compression_ratio: number;
    switch (strategy) {
      case "compressed":
        compression_ratio = 0.35;
        break;
      case "metadata_first":
        compression_ratio = 0.1; // only metadata ≈ 10% of payload
        break;
      case "full_push":
        compression_ratio = 1.0;
        break;
      default:
        compression_ratio = 1.0;
    }

    // Estimate transfer time
    const payloadKb = AVG_PAYLOAD_KB * compression_ratio;
    const payloadKbits = payloadKb * 8;
    const bw = Math.max(1, network.bandwidth_kbps); // avoid div/0
    const transferSec = payloadKbits / bw + network.latency_ms / 1000;
    const estimated_transfer_time_s = Math.round(transferSec * 100) / 100;

    const can_send_now =
      strategy === "full_push" ||
      strategy === "compressed" ||
      strategy === "metadata_first";

    return {
      priority_class: priorityClass,
      transport_strategy: strategy,
      estimated_transfer_time_s,
      compression_ratio,
      can_send_now,
    };
  }

  // ---- Queue management --------------------------------------------------

  /**
   * Add a product to the transport queue (used when items cannot be sent
   * immediately).
   */
  enqueue(product: DataProduct): void {
    const classification = this.classifyDataForTransport(product);
    this.queue.push({
      product_id: product.id,
      title: product.title,
      classification,
      enqueued_at: new Date().toISOString(),
    });
  }

  /**
   * Returns the current transport queue, ordered by priority class
   * (flash first, deferred last).
   */
  getTransportQueue(): QueueItem[] {
    const order: Record<PriorityClass, number> = {
      flash: 0,
      immediate: 1,
      priority: 2,
      routine: 3,
      deferred: 4,
    };
    return [...this.queue].sort(
      (a, b) =>
        order[a.classification.priority_class] -
        order[b.classification.priority_class]
    );
  }

  /** Clear sent items from the queue */
  dequeue(productId: string): void {
    this.queue = this.queue.filter((q) => q.product_id !== productId);
  }

  // ---- Metadata extraction -----------------------------------------------

  getMetadataPayload(product: DataProduct): MetadataPayload {
    const contentText = this.extractContentText(product);
    const summary =
      contentText.length > 200
        ? contentText.slice(0, 197) + "..."
        : contentText;

    return {
      id: product.id,
      title: product.title,
      source_type: product.source_type,
      priority: product.priority,
      priority_score: product.priority_score,
      latitude: product.latitude,
      longitude: product.longitude,
      created_at: product.created_at,
      content_summary: summary,
    };
  }

  // ---- Bandwidth allocation ----------------------------------------------

  simulateBandwidthAllocation(products: DataProduct[]): BandwidthAllocationPlan {
    const network = this.getNetworkState();

    // Count queue depth per priority class
    const depths: Record<PriorityClass, number> = {
      flash: 0,
      immediate: 0,
      priority: 0,
      routine: 0,
      deferred: 0,
    };

    for (const p of products) {
      const pc = this.mapPriorityClass(p);
      depths[pc]++;
    }

    const totalItems = products.length || 1;

    // Adjust base allocations by queue depth (RL-style proportional boost)
    const rawAllocations: Record<PriorityClass, number> = { ...BASE_ALLOCATIONS };

    for (const cls of Object.keys(rawAllocations) as PriorityClass[]) {
      const depthRatio = depths[cls] / totalItems;
      // Boost classes that have disproportionately high queue depth
      rawAllocations[cls] += rawAllocations[cls] * depthRatio * 0.5;
    }

    // Normalise to 100%
    const rawTotal = Object.values(rawAllocations).reduce((s, v) => s + v, 0);
    const allocations: BandwidthAllocationEntry[] = (
      Object.keys(rawAllocations) as PriorityClass[]
    ).map((cls) => {
      const pct = Math.round((rawAllocations[cls] / rawTotal) * 1000) / 10;
      return {
        priority_class: cls,
        allocated_pct: pct,
        allocated_kbps: Math.round((pct / 100) * network.bandwidth_kbps),
        queue_depth: depths[cls],
      };
    });

    return {
      total_bandwidth_kbps: network.bandwidth_kbps,
      network_status: network.status,
      allocations,
    };
  }

  // ---- Helpers ------------------------------------------------------------

  private extractContentText(product: DataProduct): string {
    if (!product.content) return product.title ?? "";
    const c = product.content as Record<string, unknown>;
    return (
      (c.description as string) ||
      (c.text as string) ||
      (c.summary as string) ||
      (product.title ?? "")
    );
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const ddilOptimizer = new DDILOptimizer();
