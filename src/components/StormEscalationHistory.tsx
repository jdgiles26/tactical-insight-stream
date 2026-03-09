import { useStormHistory, type StormSnapshot } from "@/hooks/useStormHistory";
import { format } from "date-fns";
import { useMemo } from "react";
import { AlertTriangle, ArrowUp, ArrowDown, Clock, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const LEVEL_ORDER = ["MINIMAL", "GUARDED", "ELEVATED", "HIGH", "SEVERE"];
const LEVEL_COLOR: Record<string, string> = {
  MINIMAL: "text-emerald-400",
  GUARDED: "text-sky-400",
  ELEVATED: "text-amber-400",
  HIGH: "text-orange-400",
  SEVERE: "text-destructive",
};
const LEVEL_BG: Record<string, string> = {
  MINIMAL: "bg-emerald-500/10 border-emerald-500/30",
  GUARDED: "bg-sky-500/10 border-sky-500/30",
  ELEVATED: "bg-amber-500/10 border-amber-500/30",
  HIGH: "bg-orange-500/10 border-orange-500/30",
  SEVERE: "bg-destructive/10 border-destructive/30",
};

interface EscalationEvent {
  from: string;
  to: string;
  direction: "up" | "down";
  timestamp: string;
  score: number;
  details: string[];
  sensorCount: number;
  criticalCount: number;
  highCount: number;
}

export default function StormEscalationHistory() {
  const { data: history = [], isLoading } = useStormHistory(168); // 7 days

  const events = useMemo<EscalationEvent[]>(() => {
    if (history.length < 2) return [];
    const result: EscalationEvent[] = [];
    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1];
      const curr = history[i];
      if (prev.threat_level !== curr.threat_level) {
        const prevIdx = LEVEL_ORDER.indexOf(prev.threat_level);
        const currIdx = LEVEL_ORDER.indexOf(curr.threat_level);
        result.push({
          from: prev.threat_level,
          to: curr.threat_level,
          direction: currIdx > prevIdx ? "up" : "down",
          timestamp: curr.recorded_at,
          score: curr.score,
          details: curr.details ?? [],
          sensorCount: curr.sensor_count,
          criticalCount: curr.critical_count,
          highCount: curr.high_count,
        });
      }
    }
    return result.reverse(); // newest first
  }, [history]);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground font-mono">Loading escalation history…</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="p-4 border-b border-border flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-primary" />
        <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          Storm Threat Escalation History (7 days)
        </span>
        <Badge variant="secondary" className="ml-auto text-[10px]">
          {events.length} event{events.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <ShieldAlert className="mb-2 h-8 w-8" />
          <p className="text-sm">No escalation events recorded</p>
          <p className="text-xs">Threat level changes will appear here as sensor data is collected</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {events.map((evt, i) => (
            <div
              key={i}
              className={cn(
                "flex items-start gap-4 px-4 py-3",
                evt.direction === "up" ? "bg-destructive/5" : "bg-emerald-500/5"
              )}
            >
              {/* Icon */}
              <div className={cn(
                "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
                evt.direction === "up"
                  ? "border-destructive/40 bg-destructive/10"
                  : "border-emerald-500/40 bg-emerald-500/10"
              )}>
                {evt.direction === "up" ? (
                  <ArrowUp className="h-4 w-4 text-destructive" />
                ) : (
                  <ArrowDown className="h-4 w-4 text-emerald-400" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn("font-bold text-sm", LEVEL_COLOR[evt.from])}>
                    {evt.from}
                  </span>
                  <span className="text-muted-foreground text-xs">→</span>
                  <span className={cn("font-bold text-sm", LEVEL_COLOR[evt.to])}>
                    {evt.to}
                  </span>
                  <Badge
                    variant={evt.direction === "up" ? "destructive" : "secondary"}
                    className="text-[9px] px-1.5 py-0"
                  >
                    {evt.direction === "up" ? "ESCALATION" : "DE-ESCALATION"}
                  </Badge>
                  <span className="text-xs font-mono text-muted-foreground ml-auto">
                    Score: {evt.score}/100
                  </span>
                </div>

                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <Clock className="h-3 w-3 shrink-0" />
                  <span>{format(new Date(evt.timestamp), "MMM d, yyyy HH:mm:ss")}</span>
                  <span>•</span>
                  <span>{evt.sensorCount} stations</span>
                  {evt.criticalCount > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-destructive">{evt.criticalCount} critical</span>
                    </>
                  )}
                  {evt.highCount > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-warning">{evt.highCount} high</span>
                    </>
                  )}
                </div>

                {evt.details.length > 0 && (
                  <div className="space-y-0.5 mt-1">
                    {evt.details.map((d, j) => (
                      <div key={j} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                        <span>{d}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
