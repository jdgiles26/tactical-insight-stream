import { useMemo, useEffect, useRef, useCallback } from "react";
import { useAllGeoProducts } from "@/hooks/useDataProducts";
import { useRecordStormSnapshot } from "@/hooks/useStormHistory";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Waves, AlertTriangle, CloudLightning, TrendingUp, TrendingDown, Minus, Gauge,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { playAlertSound } from "@/hooks/useAlertSound";
import {
  type ThreatLevel, LEVEL_ORDER, THREAT_CONFIG,
  type SensorReading, type StormAssessment,
  computeAssessment, parseSensors,
} from "@/lib/stormAssessment";

/* ── Trend icon sub-component ── */
const TrendIcon = ({ trend }: { trend: string }) => {
  if (trend === "rising_fast") return <TrendingUp className="h-3 w-3 text-destructive" />;
  if (trend === "rising") return <TrendingUp className="h-3 w-3 text-warning" />;
  if (trend === "falling") return <TrendingDown className="h-3 w-3 text-emerald-400" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
};

/* ── Sensor row ── */
function SensorRow({ s }: { s: SensorReading }) {
  const cleanTitle = s.title
    .replace("NOAA Water: ", "")
    .replace("[CRITICAL] ", "")
    .replace("[HIGH WATER] ", "");

  return (
    <div
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
            {cleanTitle}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="font-mono text-foreground">{s.waterLevel.toFixed(2)}ft</span>
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
  );
}

/* ── Main panel ── */
export default function StormThreatPanel() {
  const { data: products = [], isLoading } = useAllGeoProducts();
  const prevLevelRef = useRef<ThreatLevel | null>(null);
  const lastRecordedScore = useRef<number | null>(null);
  const recordSnapshot = useRecordStormSnapshot();

  const sensors = useMemo<SensorReading[]>(() => parseSensors(products), [products]);
  const assessment = useMemo<StormAssessment>(() => computeAssessment(sensors), [sensors]);
  const sortedSensors = useMemo(() => [...sensors].sort((a, b) => b.waterLevel - a.waterLevel), [sensors]);

  const cfg = THREAT_CONFIG[assessment.level];

  // Record snapshot when assessment score changes (debounced by ref)
  const recordRef = useRef(recordSnapshot);
  recordRef.current = recordSnapshot;

  useEffect(() => {
    if (sensors.length === 0) return;
    if (lastRecordedScore.current === assessment.score) return;
    lastRecordedScore.current = assessment.score;
    recordRef.current.mutate({
      threat_level: assessment.level,
      score: assessment.score,
      sensor_count: sensors.length,
      critical_count: assessment.criticalCount,
      high_count: assessment.highCount,
      avg_water_level: assessment.avgLevel || null,
      max_water_level: assessment.maxLevel || null,
      details: assessment.details,
    });
  }, [assessment.score, assessment.level, sensors.length, assessment.criticalCount, assessment.highCount, assessment.avgLevel, assessment.maxLevel, assessment.details]);

  // Escalation detection with audio alerts
  useEffect(() => {
    if (sensors.length === 0) return;
    const prev = prevLevelRef.current;
    const curr = assessment.level;
    prevLevelRef.current = curr;

    if (!prev) return; // skip first render

    const prevIdx = LEVEL_ORDER.indexOf(prev);
    const currIdx = LEVEL_ORDER.indexOf(curr);

    if (currIdx > prevIdx) {
      // Escalation — play audio for ELEVATED+
      if (curr === "SEVERE") playAlertSound("severe");
      else if (curr === "HIGH") playAlertSound("high");
      else if (curr === "ELEVATED") playAlertSound("elevated");

      toast.error(`⚠️ STORM THREAT ESCALATED: ${prev} → ${curr}`, {
        description: assessment.details.join(" • "),
        duration: 15000,
      });
    } else if (currIdx < prevIdx) {
      toast.success(`✅ Storm threat de-escalated: ${prev} → ${curr}`, {
        description: "Conditions improving across monitored stations.",
        duration: 8000,
      });
    }
  }, [assessment.level, sensors.length, assessment.details]);

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
      {sortedSensors.length > 0 && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="p-3 border-b border-border flex items-center gap-2">
            <Waves className="h-4 w-4 text-primary" />
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Bayou Sensor Readings
            </span>
            <Badge variant="outline" className="ml-auto text-[10px]">
              {sortedSensors.length} sensor{sortedSensors.length !== 1 ? "s" : ""}
            </Badge>
          </div>
          <div className="divide-y divide-border max-h-[300px] overflow-y-auto">
            {sortedSensors.map((s) => (
              <SensorRow key={s.stationId} s={s} />
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
