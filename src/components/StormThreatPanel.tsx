import { useMemo } from "react";
import { useAllGeoProducts } from "@/hooks/useDataProducts";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Waves, AlertTriangle, CloudLightning, TrendingUp, TrendingDown, Minus, Gauge,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ThreatLevel = "MINIMAL" | "GUARDED" | "ELEVATED" | "HIGH" | "SEVERE";

const THREAT_CONFIG: Record<ThreatLevel, { color: string; bg: string; border: string; icon: string }> = {
  MINIMAL:  { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", icon: "🟢" },
  GUARDED:  { color: "text-sky-400",     bg: "bg-sky-500/10",     border: "border-sky-500/30",     icon: "🔵" },
  ELEVATED: { color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/30",   icon: "🟡" },
  HIGH:     { color: "text-orange-400",   bg: "bg-orange-500/10",  border: "border-orange-500/30",  icon: "🟠" },
  SEVERE:   { color: "text-red-400",      bg: "bg-red-500/10",     border: "border-red-500/30",     icon: "🔴" },
};

interface SensorReading {
  title: string;
  stationId: string;
  waterLevel: number;
  trend: string;
  trendChange: number;
  priority: string;
  highWaterAlert: boolean;
  criticalAlert: boolean;
  lat: number;
  lng: number;
}

export default function StormThreatPanel() {
  const { data: products = [], isLoading } = useAllGeoProducts();

  const sensors = useMemo<SensorReading[]>(() => {
    return products
      .filter((p) => {
        const c = p.content as Record<string, unknown> | null;
        return c && (c as any).sensor_type === "bayou_water_level";
      })
      .map((p) => {
        const c = p.content as any;
        return {
          title: p.title,
          stationId: p.source_identifier || "unknown",
          waterLevel: c.water_level_ft ?? 0,
          trend: c.trend_direction ?? "stable",
          trendChange: c.trend_change_ft ?? 0,
          priority: p.priority || "routine",
          highWaterAlert: !!c.high_water_alert,
          criticalAlert: !!c.critical_alert,
          lat: p.latitude!,
          lng: p.longitude!,
        };
      });
  }, [products]);

  const assessment = useMemo(() => {
    if (sensors.length === 0) return { level: "MINIMAL" as ThreatLevel, score: 0, details: [] as string[] };

    const criticalCount = sensors.filter((s) => s.criticalAlert).length;
    const highCount = sensors.filter((s) => s.highWaterAlert).length;
    const risingFast = sensors.filter((s) => s.trend === "rising_fast").length;
    const rising = sensors.filter((s) => s.trend === "rising").length;
    const avgLevel = sensors.reduce((s, r) => s + r.waterLevel, 0) / sensors.length;
    const maxLevel = Math.max(...sensors.map((s) => s.waterLevel));

    // Score 0-100
    let score = 0;
    score += criticalCount * 25;
    score += highCount * 12;
    score += risingFast * 8;
    score += rising * 3;
    if (avgLevel > 2) score += 15;
    if (avgLevel > 3) score += 15;
    if (maxLevel > 4) score += 10;
    score = Math.min(100, score);

    let level: ThreatLevel = "MINIMAL";
    if (score >= 75) level = "SEVERE";
    else if (score >= 50) level = "HIGH";
    else if (score >= 30) level = "ELEVATED";
    else if (score >= 10) level = "GUARDED";

    const details: string[] = [];
    if (criticalCount > 0) details.push(`${criticalCount} station(s) at CRITICAL storm surge`);
    if (highCount > 0) details.push(`${highCount} station(s) reporting HIGH water`);
    if (risingFast > 0) details.push(`${risingFast} station(s) rising rapidly`);
    if (maxLevel > 3) details.push(`Peak water level: ${maxLevel.toFixed(1)}ft MHHW`);
    if (avgLevel > 1.5) details.push(`Avg water level: ${avgLevel.toFixed(1)}ft MHHW`);
    if (details.length === 0) details.push("All stations reporting normal levels");

    return { level, score, details, criticalCount, highCount, risingFast, rising, avgLevel, maxLevel };
  }, [sensors]);

  const cfg = THREAT_CONFIG[assessment.level];

  const TrendIcon = ({ trend }: { trend: string }) => {
    if (trend === "rising_fast") return <TrendingUp className="h-3 w-3 text-destructive" />;
    if (trend === "rising") return <TrendingUp className="h-3 w-3 text-warning" />;
    if (trend === "falling") return <TrendingDown className="h-3 w-3 text-emerald-400" />;
    return <Minus className="h-3 w-3 text-muted-foreground" />;
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground font-mono">Loading sensor data…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Threat Level Banner */}
      <div className={cn("rounded-lg border p-5 space-y-3", cfg.bg, cfg.border)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CloudLightning className={cn("h-6 w-6", cfg.color)} />
            <div>
              <h3 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
                Gulf Coast Storm Threat
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-lg">{cfg.icon}</span>
                <span className={cn("text-2xl font-bold tracking-tight", cfg.color)}>
                  {assessment.level}
                </span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2">
              <Gauge className={cn("h-4 w-4", cfg.color)} />
              <span className={cn("text-xl font-bold font-mono", cfg.color)}>{assessment.score}</span>
              <span className="text-xs text-muted-foreground">/100</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {sensors.length} active station{sensors.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <Progress value={assessment.score} className="h-2" />

        <div className="space-y-1">
          {assessment.details.map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <AlertTriangle className={cn("h-3 w-3 shrink-0", assessment.score >= 30 ? cfg.color : "text-muted-foreground")} />
              <span className="text-muted-foreground">{d}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Sensor Readings Grid */}
      {sensors.length > 0 && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="p-3 border-b border-border flex items-center gap-2">
            <Waves className="h-4 w-4 text-primary" />
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Bayou Sensor Readings
            </span>
          </div>
          <div className="divide-y divide-border max-h-[300px] overflow-y-auto">
            {sensors
              .sort((a, b) => b.waterLevel - a.waterLevel)
              .map((s) => (
                <div
                  key={s.stationId}
                  className={cn(
                    "flex items-center justify-between px-4 py-2.5 text-xs",
                    s.criticalAlert && "bg-destructive/5",
                    s.highWaterAlert && !s.criticalAlert && "bg-warning/5"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <TrendIcon trend={s.trend} />
                      <span className="font-medium text-foreground truncate max-w-[180px]">
                        {s.title.replace("NOAA Water: ", "").replace("[CRITICAL] ", "").replace("[HIGH WATER] ", "")}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-foreground">
                      {s.waterLevel.toFixed(2)}ft
                    </span>
                    <span className={cn(
                      "font-mono text-[10px]",
                      s.trendChange > 0 ? "text-destructive" : s.trendChange < 0 ? "text-emerald-400" : "text-muted-foreground"
                    )}>
                      {s.trendChange > 0 ? "+" : ""}{s.trendChange.toFixed(2)}ft
                    </span>
                    {s.criticalAlert && (
                      <Badge variant="destructive" className="text-[9px] px-1.5 py-0">CRITICAL</Badge>
                    )}
                    {s.highWaterAlert && !s.criticalAlert && (
                      <Badge className="text-[9px] px-1.5 py-0 bg-warning text-warning-foreground">HIGH</Badge>
                    )}
                    {!s.criticalAlert && !s.highWaterAlert && (
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0">NORMAL</Badge>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {sensors.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card py-8 text-muted-foreground">
          <Waves className="mb-2 h-6 w-6" />
          <p className="text-sm">No bayou sensor data</p>
          <p className="text-xs">Fetch NOAA water levels from Sources → Live Data</p>
        </div>
      )}
    </div>
  );
}
