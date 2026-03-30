import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  MapPin,
  Radio,
  Link2,
  Radar,
  AlertTriangle,
  Eye,
  Zap,
  Video,
  FileText,
  Image as ImageIcon,
  Satellite,
  Users,
  MessageSquare,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useGeoCorrelation } from "@/hooks/useGeoCorrelation";
import { getClusterThreatColor } from "@/lib/geoCorrelation";
import type { GeoCluster } from "@/lib/geoCorrelation";

/** Map source_type → icon component */
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

/** Map source_type → colour */
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

const threatBg: Record<string, string> = {
  HIGH: "bg-red-500/20 text-red-400 border-red-500/30",
  MEDIUM: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  LOW: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  NONE: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

interface GeoCorrelationBadgeProps {
  productId: string;
  compact?: boolean;
}

export default function GeoCorrelationBadge({
  productId,
  compact = true,
}: GeoCorrelationBadgeProps) {
  const { getClusterForProduct } = useGeoCorrelation();
  const cluster: GeoCluster | null = useMemo(
    () => getClusterForProduct(productId) ?? null,
    [getClusterForProduct, productId],
  );

  if (!cluster) return null;

  if (compact) return <CompactBadge cluster={cluster} />;
  return <ExpandedCard cluster={cluster} productId={productId} />;
}

/* ──────── Compact pill badge ──────── */
function CompactBadge({ cluster }: { cluster: GeoCluster }) {
  const color = getClusterThreatColor(cluster.threatIndicator);
  const isCross = cluster.crossSourceCorrelated;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono font-medium cursor-default whitespace-nowrap"
            style={{
              borderColor: isCross ? "#f59e0b" : color,
              color: isCross ? "#fbbf24" : color,
              backgroundColor: isCross
                ? "rgba(245,158,11,0.12)"
                : `${color}18`,
            }}
          >
            {isCross ? (
              <Zap className="h-3 w-3" />
            ) : (
              <MapPin className="h-3 w-3" />
            )}
            {isCross && <span className="font-bold">MULTI-SRC</span>}
            {cluster.members.length} within {cluster.radiusKm.toFixed(1)}km
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-xs space-y-1 text-xs bg-popover border-border"
        >
          <p className="font-bold">
            Geo-Cluster · {cluster.members.length} products
          </p>
          <p>
            Radius: {cluster.radiusKm.toFixed(2)} km — Sources:{" "}
            {cluster.sourceTypes.join(", ")}
          </p>
          <p className="text-muted-foreground">
            Threat: {cluster.threatIndicator} · Avg score{" "}
            {(cluster.avgPriorityScore * 100).toFixed(0)}%
          </p>
          {isCross && (
            <p className="text-amber-400 font-semibold">
              ⚡ Cross-source correlation detected
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/* ──────── Expanded card ──────── */
function ExpandedCard({
  cluster,
  productId,
}: {
  cluster: GeoCluster;
  productId: string;
}) {
  const navigate = useNavigate();
  const color = getClusterThreatColor(cluster.threatIndicator);
  const isCross = cluster.crossSourceCorrelated;

  return (
    <Card className="border-border bg-card/80 overflow-hidden">
      {/* Header strip */}
      <CardHeader
        className="py-2.5 px-3 flex flex-row items-center gap-2"
        style={{ borderBottom: `2px solid ${isCross ? "#f59e0b" : color}` }}
      >
        <MapPin className="h-4 w-4" style={{ color }} />
        <CardTitle className="text-xs font-mono uppercase tracking-wider">
          Geo-Correlated
        </CardTitle>
        <span
          className={`ml-auto rounded-full border px-2 py-0.5 text-[9px] font-mono font-bold uppercase ${threatBg[cluster.threatIndicator]}`}
        >
          {cluster.threatIndicator}
        </span>
      </CardHeader>

      <CardContent className="px-3 pb-3 pt-2 space-y-3">
        {/* Cluster radius viz */}
        <div className="flex items-center gap-3">
          <div
            className="relative flex h-12 w-12 items-center justify-center rounded-full"
            style={{
              border: `2px dashed ${color}`,
              backgroundColor: `${color}10`,
            }}
          >
            <span className="text-[10px] font-mono font-bold" style={{ color }}>
              {cluster.radiusKm.toFixed(1)}
            </span>
          </div>
          <div className="text-xs space-y-0.5">
            <p className="font-medium">
              {cluster.members.length} products · {cluster.radiusKm.toFixed(2)}{" "}
              km radius
            </p>
            <p className="text-muted-foreground font-mono text-[10px]">
              {cluster.sourceTypes.length} source type
              {cluster.sourceTypes.length > 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Source type diversity badges */}
        <div className="flex flex-wrap gap-1">
          {cluster.sourceTypes.map((st) => {
            const Icon = sourceTypeIcons[st] || Radio;
            const c = sourceTypeColors[st] || "#6b7280";
            return (
              <span
                key={st}
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-mono"
                style={{ borderColor: c, color: c }}
              >
                <Icon className="h-2.5 w-2.5" />
                {st}
              </span>
            );
          })}
        </div>

        {isCross && (
          <div className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[10px] font-mono font-bold text-amber-400">
            <Zap className="h-3.5 w-3.5" />
            MULTI-SOURCE CORRELATION DETECTED
          </div>
        )}

        {/* Correlated members (excluding self) */}
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {cluster.members
            .filter((m) => m.productId !== productId)
            .map((m) => {
              const Icon = sourceTypeIcons[m.sourceType] || Radio;
              const c = sourceTypeColors[m.sourceType] || "#6b7280";
              return (
                <div
                  key={m.productId}
                  className="flex items-center gap-2 rounded border border-border/50 px-2 py-1.5 text-[10px] hover:bg-secondary/40 transition-colors"
                >
                  <Icon className="h-3 w-3 shrink-0" style={{ color: c }} />
                  <span className="truncate flex-1 font-medium">
                    {m.title}
                  </span>
                  <span className="text-muted-foreground font-mono shrink-0">
                    {m.distanceFromCentroidKm.toFixed(1)} km
                  </span>
                </div>
              );
            })}
        </div>

        {/* View on Map */}
        <button
          onClick={() => navigate("/map")}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-secondary/50 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <Eye className="h-3 w-3" />
          View on Map
        </button>
      </CardContent>
    </Card>
  );
}
