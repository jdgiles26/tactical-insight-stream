import { useEffect, useRef } from "react";
import L from "leaflet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  Radio,
  Radar,
  Video,
  FileText,
  Image as ImageIcon,
  Satellite,
  Users,
  MessageSquare,
  X,
  Zap,
  Clock,
  Crosshair,
  Link2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { GeoCluster } from "@/lib/geoCorrelation";
import {
  getClusterThreatColor,
  getClusterDescription,
  haversineDistanceKm,
} from "@/lib/geoCorrelation";

/* ── source-type visual maps ── */
const sourceTypeIcons: Record<string, React.ElementType> = {
  sensor: Radio,
  video: Video,
  image: ImageIcon,
  sigint: Radar,
  humint: Users,
  geoint: Satellite,
  document: FileText,
  cot_message: MessageSquare,
};

const sourceTypeColors: Record<string, string> = {
  sensor: "#3b82f6",
  video: "#8b5cf6",
  image: "#ec4899",
  sigint: "#f59e0b",
  humint: "#10b981",
  geoint: "#06b6d4",
  document: "#6b7280",
  cot_message: "#a855f7",
};

const threatBadge: Record<string, string> = {
  HIGH: "bg-red-500/20 text-red-400 border-red-500/30",
  MEDIUM: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  LOW: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  NONE: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

/* ── props ── */
export interface GeoClusterPanelProps {
  cluster: GeoCluster | null;
  onClose: () => void;
  onProductClick?: (productId: string) => void;
}

export default function GeoClusterPanel({
  cluster,
  onClose,
  onProductClick,
}: GeoClusterPanelProps) {
  if (!cluster) return null;

  const color = getClusterThreatColor(cluster.threatIndicator);
  const isCross = cluster.crossSourceCorrelated;

  /* ── Build relationship description ── */
  const relationDesc = (() => {
    const n = cluster.members.length;
    const types = cluster.sourceTypes;
    const r = cluster.radiusKm.toFixed(1);
    if (isCross) {
      return `${n} data sources detected within ${r} km of each other across ${types.join(", ")} collection methods`;
    }
    return `${n} ${types[0]} products co-located within ${r} km`;
  })();

  /* ── Proximity pairs inside the cluster ── */
  const pairs: { i: number; j: number; dist: number; crossSrc: boolean }[] = [];
  for (let i = 0; i < cluster.members.length; i++) {
    for (let j = i + 1; j < cluster.members.length; j++) {
      const a = cluster.members[i];
      const b = cluster.members[j];
      const d = haversineDistanceKm(a.latitude, a.longitude, b.latitude, b.longitude);
      pairs.push({
        i,
        j,
        dist: d,
        crossSrc: a.sourceType !== b.sourceType,
      });
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-[540px] border-l border-border bg-card shadow-xl flex flex-col animate-slide-in">
      {/* ── Header ── */}
      <div
        className="flex items-center gap-2 border-b px-4 py-3"
        style={{ borderColor: isCross ? "#f59e0b" : color }}
      >
        <MapPin className="h-4 w-4" style={{ color }} />
        <h3 className="text-xs font-mono uppercase tracking-wider font-bold flex-1">
          Geo-Correlation Cluster
        </h3>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase ${threatBadge[cluster.threatIndicator]}`}
        >
          {cluster.threatIndicator}
        </span>
        {isCross && (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-mono font-bold text-amber-400">
            <Zap className="h-3 w-3" /> MULTI-SRC
          </span>
        )}
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* ── Stats row ── */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Members", value: String(cluster.members.length) },
              { label: "Radius", value: `${cluster.radiusKm.toFixed(1)} km` },
              { label: "Sources", value: String(cluster.sourceTypes.length) },
              {
                label: "Avg Score",
                value: `${(cluster.avgPriorityScore * 100).toFixed(0)}%`,
              },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-md border border-border bg-secondary/40 px-2 py-1.5 text-center"
              >
                <p className="text-[10px] text-muted-foreground font-mono">
                  {s.label}
                </p>
                <p className="text-sm font-bold font-mono">{s.value}</p>
              </div>
            ))}
          </div>

          {/* ── Time range ── */}
          <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>
              {formatDistanceToNow(new Date(cluster.createdRange.earliest), {
                addSuffix: true,
              })}{" "}
              –{" "}
              {formatDistanceToNow(new Date(cluster.createdRange.latest), {
                addSuffix: true,
              })}
            </span>
          </div>

          {/* ── Source type badges ── */}
          <div className="flex flex-wrap gap-1.5">
            {cluster.sourceTypes.map((st) => {
              const Icon = sourceTypeIcons[st] || Radio;
              const c = sourceTypeColors[st] || "#6b7280";
              const count = cluster.members.filter(
                (m) => m.sourceType === st,
              ).length;
              return (
                <span
                  key={st}
                  className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-mono"
                  style={{ borderColor: c, color: c }}
                >
                  <Icon className="h-3 w-3" />
                  {st}
                  <span className="opacity-60">×{count}</span>
                </span>
              );
            })}
          </div>

          {/* ── Mini Leaflet map ── */}
          <ClusterMiniMap cluster={cluster} />

          {/* ── Relationship description ── */}
          <div className="rounded-md border border-border bg-secondary/30 px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Link2 className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Relationship
              </span>
            </div>
            <p className="text-xs leading-relaxed">{relationDesc}</p>
          </div>

          {/* ── Member list ── */}
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
              Cluster Members
            </p>
            <div className="space-y-1.5">
              {cluster.members.map((m) => {
                const Icon = sourceTypeIcons[m.sourceType] || Radio;
                const c = sourceTypeColors[m.sourceType] || "#6b7280";
                return (
                  <div
                    key={m.productId}
                    className="flex items-center gap-2.5 rounded-md border border-border/50 px-3 py-2 hover:bg-secondary/40 transition-colors cursor-pointer"
                    onClick={() => onProductClick?.(m.productId)}
                  >
                    <Icon className="h-4 w-4 shrink-0" style={{ color: c }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{m.title}</p>
                      <p className="text-[10px] font-mono text-muted-foreground">
                        {m.sourceIdentifier || m.sourceType} ·{" "}
                        {formatDistanceToNow(new Date(m.createdAt), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        className="inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[9px] font-mono"
                        style={{ borderColor: c, color: c }}
                      >
                        {m.sourceType}
                      </span>
                      <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                        <Crosshair className="inline h-2.5 w-2.5 mr-0.5" />
                        {m.distanceFromCentroidKm.toFixed(2)} km
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Connection pairs ── */}
          {pairs.length > 0 && (
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                Proximity Connections ({pairs.length})
              </p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {pairs.map(({ i, j, dist, crossSrc }) => (
                  <div
                    key={`${i}-${j}`}
                    className="flex items-center gap-2 rounded border border-border/40 px-2.5 py-1.5 text-[10px]"
                  >
                    <span className="truncate flex-1 font-medium">
                      {cluster.members[i].title}
                    </span>
                    <span
                      className={`shrink-0 font-mono ${
                        crossSrc ? "text-amber-400" : "text-muted-foreground"
                      }`}
                    >
                      ↔ {dist.toFixed(2)} km
                    </span>
                    <span className="truncate flex-1 font-medium text-right">
                      {cluster.members[j].title}
                    </span>
                    {crossSrc && <Zap className="h-3 w-3 text-amber-400 shrink-0" />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Mini Leaflet map showing just this cluster
   ═══════════════════════════════════════════════ */
function ClusterMiniMap({ cluster }: { cluster: GeoCluster }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Destroy previous map if any
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = L.map(containerRef.current, {
      center: [cluster.centroidLat, cluster.centroidLon],
      zoom: 12,
      zoomControl: false,
      attributionControl: false,
      dragging: true,
      scrollWheelZoom: false,
    });

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      { maxZoom: 18 },
    ).addTo(map);

    const color = getClusterThreatColor(cluster.threatIndicator);

    // Cluster radius circle
    L.circle([cluster.centroidLat, cluster.centroidLon], {
      radius: Math.max(cluster.radiusKm * 1000, 200), // at least 200m so it's visible
      color,
      fillColor: color,
      fillOpacity: 0.08,
      dashArray: "8, 4",
      weight: 2,
    }).addTo(map);

    // Member markers
    cluster.members.forEach((m) => {
      const mc = sourceTypeColors[m.sourceType] || "#6b7280";
      L.circleMarker([m.latitude, m.longitude], {
        radius: 6,
        color: mc,
        fillColor: mc,
        fillOpacity: 0.7,
        weight: 2,
      })
        .bindTooltip(m.title, {
          direction: "top",
          className: "geo-mini-tooltip",
        })
        .addTo(map);
    });

    // Connection lines between all members
    for (let i = 0; i < cluster.members.length; i++) {
      for (let j = i + 1; j < cluster.members.length; j++) {
        const a = cluster.members[i];
        const b = cluster.members[j];
        const crossSrc = a.sourceType !== b.sourceType;
        L.polyline(
          [
            [a.latitude, a.longitude],
            [b.latitude, b.longitude],
          ],
          {
            color: crossSrc ? "#f59e0b" : "#6b7280",
            weight: crossSrc ? 2 : 1,
            dashArray: crossSrc ? "6, 3" : undefined,
            opacity: 0.6,
          },
        ).addTo(map);
      }
    }

    // Fit bounds
    if (cluster.members.length > 0) {
      const bounds = L.latLngBounds(
        cluster.members.map((m) => [m.latitude, m.longitude] as [number, number]),
      );
      map.fitBounds(bounds, { padding: [30, 30] });
    }

    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 50);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [cluster]);

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div
        ref={containerRef}
        className="h-[200px] w-full"
        style={{ background: "hsl(220, 20%, 7%)" }}
      />
    </div>
  );
}
