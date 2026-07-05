/**
 * DDIL (Disconnected, Intermittent, Low-bandwidth) Network Monitor
 * & Priority Transport Queue.
 *
 * All network data comes from real browser APIs:
 *   - navigator.onLine              → connected / disconnected
 *   - navigator.connection (Network Information API) → downlink, rtt, effectiveType, type
 *   - Periodic fetch-based heartbeat probe           → measures actual RTT & reachability
 *
 * The transport queue is a real localStorage-persisted priority queue that
 * orders data products by their classified priority class.
 */

import type { Database } from "@/integrations/supabase/types";

type DataProduct = Database["public"]["Tables"]["data_products"]["Row"];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NetworkStatus = "connected" | "degraded" | "intermittent" | "disconnected";

export type PriorityClass = "flash" | "immediate" | "priority" | "routine" | "deferred";

export type TransportStrategy =
  | "full_push"
  | "metadata_first"
  | "compressed"
  | "queued"
  | "hold";

export interface NetworkState {
  /** Derived overall status */
  status: NetworkStatus;
  /** Real downlink estimate in kbps (from navigator.connection or probe) */
  bandwidth_kbps: number;
  /** Real round-trip time in ms */
  latency_ms: number;
  /** navigator.connection.effectiveType or derived label */
  effective_type: string;
  /** navigator.connection.type when available, else "unknown" */
  connection_type: string;
  /** Whether navigator.onLine is true */
  online: boolean;
  /** ISO timestamp of last successful heartbeat probe */
  last_heartbeat: string;
  /** Consecutive heartbeat failures */
  consecutive_failures: number;
}

export interface TransportClassification {
  priority_class: PriorityClass;
  transport_strategy: TransportStrategy;
  estimated_transfer_time_s: number;
  compression_ratio: number;
  can_send_now: boolean;
}

export interface QueueItem {
  product_id: string;
  title: string;
  priority_class: PriorityClass;
  transport_strategy: TransportStrategy;
  can_send_now: boolean;
  enqueued_at: string;
  source_type: string;
  priority: string | null;
  priority_score: number | null;
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUEUE_STORAGE_KEY = "mdg_transport_queue";
const NETWORK_STORAGE_KEY = "mdg_network_state";
const HEARTBEAT_URL_CANDIDATES = [
  "/favicon.ico",          // local vite dev-server
  "/index.html",
];
/** Average payload size per data product in KB – used for transfer estimates */
const AVG_PAYLOAD_KB = 24;

const PRIORITY_ORDER: Record<PriorityClass, number> = {
  flash: 0,
  immediate: 1,
  priority: 2,
  routine: 3,
  deferred: 4,
};

// ---------------------------------------------------------------------------
// Helpers for navigator.connection (Network Information API)
// ---------------------------------------------------------------------------

interface NetworkInformation extends EventTarget {
  readonly downlink: number;          // Mbps estimate
  readonly effectiveType: string;     // "slow-2g" | "2g" | "3g" | "4g"
  readonly rtt: number;               // ms estimate
  readonly type?: string;             // "wifi" | "cellular" | "ethernet" …
  readonly saveData?: boolean;
  onchange: ((this: NetworkInformation, ev: Event) => any) | null;
}

function getNavConnection(): NetworkInformation | null {
  const nav = navigator as any;
  return nav.connection || nav.mozConnection || nav.webkitConnection || null;
}

// ---------------------------------------------------------------------------
// DDILOptimizer
// ---------------------------------------------------------------------------

export class DDILOptimizer {
  private _state: NetworkState;
  private _probeTimer: ReturnType<typeof setInterval> | null = null;
  private _listeners: Array<(s: NetworkState) => void> = [];
  private _queue: QueueItem[] = [];

  constructor() {
    // Restore persisted state or build initial from browser APIs
    this._state = this._loadState();
    this._queue = this._loadQueue();

    // Listen to real browser events
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => this._onConnectivityChange());
      window.addEventListener("offline", () => this._onConnectivityChange());

      const conn = getNavConnection();
      if (conn) {
        conn.addEventListener("change", () => this._onConnectivityChange());
      }

      // Periodic heartbeat probe every 5 s
      this._probeTimer = setInterval(() => this._heartbeatProbe(), 5000);
      // Fire one immediately
      this._heartbeatProbe();
    }
  }

  // -- Public API -----------------------------------------------------------

  getNetworkState(): NetworkState {
    return { ...this._state };
  }

  /** Subscribe to network state changes */
  subscribe(fn: (s: NetworkState) => void): () => void {
    this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter((f) => f !== fn);
    };
  }

  classifyDataForTransport(product: DataProduct): TransportClassification {
    const priorityClass = this._mapPriorityClass(product);
    const strategy = this._determineStrategy(priorityClass);
    const compression_ratio = strategy === "compressed" ? 0.35
      : strategy === "metadata_first" ? 0.1
      : 1.0;
    const payloadKbits = AVG_PAYLOAD_KB * compression_ratio * 8;
    const bw = Math.max(1, this._state.bandwidth_kbps);
    const estimated_transfer_time_s =
      Math.round((payloadKbits / bw + this._state.latency_ms / 1000) * 100) / 100;
    const can_send_now =
      strategy === "full_push" || strategy === "compressed" || strategy === "metadata_first";

    return { priority_class: priorityClass, transport_strategy: strategy, estimated_transfer_time_s, compression_ratio, can_send_now };
  }

  /** Enqueue a product for transport. Persists to localStorage. */
  enqueue(product: DataProduct): void {
    const tc = this.classifyDataForTransport(product);
    // Don't duplicate
    if (this._queue.some((q) => q.product_id === product.id)) {
      // Update in place
      this._queue = this._queue.map((q) =>
        q.product_id === product.id
          ? { ...q, priority_class: tc.priority_class, transport_strategy: tc.transport_strategy, can_send_now: tc.can_send_now }
          : q
      );
    } else {
      this._queue.push({
        product_id: product.id,
        title: product.title,
        priority_class: tc.priority_class,
        transport_strategy: tc.transport_strategy,
        can_send_now: tc.can_send_now,
        enqueued_at: new Date().toISOString(),
        source_type: product.source_type,
        priority: product.priority,
        priority_score: product.priority_score,
      });
    }
    this._saveQueue();
  }

  /** Remove a product from the queue ("sent") */
  dequeue(productId: string): void {
    this._queue = this._queue.filter((q) => q.product_id !== productId);
    this._saveQueue();
  }

  /** Re-evaluate every item in the queue against current network state */
  refreshQueue(): void {
    for (const item of this._queue) {
      const strategy = this._determineStrategy(item.priority_class);
      item.transport_strategy = strategy;
      item.can_send_now =
        strategy === "full_push" || strategy === "compressed" || strategy === "metadata_first";
    }
    this._saveQueue();
  }

  /** Get the queue sorted by priority (flash first) */
  getTransportQueue(): QueueItem[] {
    return [...this._queue].sort(
      (a, b) => PRIORITY_ORDER[a.priority_class] - PRIORITY_ORDER[b.priority_class]
    );
  }

  getQueueSummary(): Record<PriorityClass, number> & { total: number; sendable: number; held: number } {
    const s: any = { flash: 0, immediate: 0, priority: 0, routine: 0, deferred: 0, total: 0, sendable: 0, held: 0 };
    for (const q of this._queue) {
      s[q.priority_class]++;
      s.total++;
      if (q.can_send_now) s.sendable++;
      else s.held++;
    }
    return s;
  }

  getMetadataPayload(product: DataProduct): MetadataPayload {
    const contentText = this._extractContentText(product);
    const summary = contentText.length > 200 ? contentText.slice(0, 197) + "..." : contentText;
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

  // -- Internal: network measurement ---------------------------------------

  private _onConnectivityChange(): void {
    this._readBrowserAPIs();
    this._emit();
  }

  /** Read real browser APIs and update state */
  private _readBrowserAPIs(): void {
    const online = typeof navigator !== "undefined" ? navigator.onLine : true;
    const conn = getNavConnection();

    let bandwidth_kbps: number;
    let latency_ms: number;
    let effective_type: string;
    let connection_type: string;

    if (conn) {
      // navigator.connection provides real estimates
      bandwidth_kbps = Math.round((conn.downlink || 0) * 1000); // Mbps → kbps
      latency_ms = conn.rtt || 0;
      effective_type = conn.effectiveType || "unknown";
      connection_type = conn.type || "unknown";
    } else {
      // Fallback: no Network Information API (Firefox / Safari)
      // Use probe-measured values; keep existing if we have them
      bandwidth_kbps = this._state.bandwidth_kbps;
      latency_ms = this._state.latency_ms;
      effective_type = this._state.effective_type;
      connection_type = "unknown";
    }

    if (!online) {
      bandwidth_kbps = 0;
      latency_ms = 0;
      effective_type = "offline";
    }

    const status = this._deriveStatus(online, bandwidth_kbps, latency_ms, this._state.consecutive_failures);

    this._state = {
      ...this._state,
      online,
      bandwidth_kbps,
      latency_ms,
      effective_type,
      connection_type,
      status,
    };
    this._saveState();
  }

  /** Fetch-based heartbeat — measures real RTT and reachability */
  private async _heartbeatProbe(): Promise<void> {
    const url = HEARTBEAT_URL_CANDIDATES[0] + "?_hb=" + Date.now();
    const start = performance.now();
    try {
      const resp = await fetch(url, {
        method: "HEAD",
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      });
      const elapsed = Math.round(performance.now() - start);
      if (resp.ok || resp.status === 304) {
        // Successful probe
        const prevFailures = this._state.consecutive_failures;
        this._state.latency_ms = elapsed;
        this._state.last_heartbeat = new Date().toISOString();
        this._state.consecutive_failures = 0;
        this._state.online = true;

        // If we don't have navigator.connection, estimate bandwidth from RTT
        if (!getNavConnection()) {
          // Rough heuristic: <50ms → broadband, <150ms → good, <500ms → degraded
          this._state.bandwidth_kbps =
            elapsed < 30 ? 10000 :
            elapsed < 80 ? 5000 :
            elapsed < 200 ? 2000 :
            elapsed < 500 ? 512 : 128;
          this._state.effective_type =
            elapsed < 80 ? "4g" :
            elapsed < 200 ? "3g" :
            elapsed < 500 ? "2g" : "slow-2g";
        } else {
          this._readBrowserAPIs();
        }

        this._state.status = this._deriveStatus(
          true, this._state.bandwidth_kbps, this._state.latency_ms, 0
        );

        if (prevFailures > 0) {
          // Network recovered — re-evaluate queue
          this.refreshQueue();
        }
      } else {
        this._onProbeFail();
      }
    } catch {
      this._onProbeFail();
    }
    this._saveState();
    this._emit();
  }

  private _onProbeFail(): void {
    this._state.consecutive_failures++;
    if (this._state.consecutive_failures >= 3) {
      this._state.status = "disconnected";
      this._state.bandwidth_kbps = 0;
      this._state.online = false;
    } else if (this._state.consecutive_failures >= 2) {
      this._state.status = "intermittent";
    }
    // Re-evaluate queue with degraded network
    this.refreshQueue();
  }

  private _deriveStatus(
    online: boolean,
    bw_kbps: number,
    rtt_ms: number,
    failures: number
  ): NetworkStatus {
    if (!online || failures >= 3) return "disconnected";
    if (failures >= 2) return "intermittent";
    // Classify based on real bandwidth & latency
    if (bw_kbps >= 2000 && rtt_ms < 200) return "connected";
    if (bw_kbps >= 500 && rtt_ms < 500) return "degraded";
    if (bw_kbps > 0) return "intermittent";
    return "disconnected";
  }

  // -- Internal: priority classification -----------------------------------

  private _mapPriorityClass(product: DataProduct): PriorityClass {
    const prio = product.priority ?? "routine";
    const content = this._extractContentText(product).toLowerCase();
    const isEmergency =
      content.includes("emergency") ||
      content.includes("mayday") ||
      content.includes("sos");

    if (prio === "critical" && isEmergency) return "flash";
    if (prio === "critical") return "immediate";
    if (prio === "high") return "priority";
    if (prio === "medium") return "routine";
    return "deferred";
  }

  private _determineStrategy(priorityClass: PriorityClass): TransportStrategy {
    const { status, bandwidth_kbps: bw } = this._state;
    if (status === "disconnected") return "queued";
    if (bw < 32) {
      if (priorityClass === "flash") return "full_push";
      if (priorityClass === "immediate") return "metadata_first";
      return "hold";
    }
    if (bw < 128) {
      if (priorityClass === "flash" || priorityClass === "immediate") return "full_push";
      return "metadata_first";
    }
    if (priorityClass === "flash" || priorityClass === "immediate") return "full_push";
    if (priorityClass === "priority" || priorityClass === "routine") return "compressed";
    return "metadata_first";
  }

  // -- Internal: persistence ------------------------------------------------

  private _loadState(): NetworkState {
    try {
      const raw = localStorage.getItem(NETWORK_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    // Bootstrap from browser APIs
    const online = typeof navigator !== "undefined" ? navigator.onLine : true;
    const conn = getNavConnection();
    return {
      status: online ? "connected" : "disconnected",
      bandwidth_kbps: conn ? Math.round((conn.downlink || 10) * 1000) : (online ? 10000 : 0),
      latency_ms: conn ? (conn.rtt || 0) : 0,
      effective_type: conn ? (conn.effectiveType || "4g") : (online ? "4g" : "offline"),
      connection_type: conn?.type || "unknown",
      online,
      last_heartbeat: online ? new Date().toISOString() : "",
      consecutive_failures: online ? 0 : 3,
    };
  }

  private _saveState(): void {
    try { localStorage.setItem(NETWORK_STORAGE_KEY, JSON.stringify(this._state)); } catch {}
  }

  private _loadQueue(): QueueItem[] {
    try {
      const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  }

  private _saveQueue(): void {
    try { localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this._queue)); } catch {}
  }

  private _emit(): void {
    const snapshot = this.getNetworkState();
    for (const fn of this._listeners) {
      try { fn(snapshot); } catch {}
    }
  }

  private _extractContentText(product: DataProduct): string {
    if (!product.content) return product.title ?? "";
    const c = product.content as Record<string, unknown>;
    return (
      (c.description as string) ||
      (c.text as string) ||
      (c.summary as string) ||
      (c.emergency_type as string) ||
      (product.title ?? "")
    );
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const ddilOptimizer = new DDILOptimizer();
