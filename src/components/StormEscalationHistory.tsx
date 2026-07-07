import { useStormHistory, type StormSnapshot } from "@/hooks/useStormHistory";
import { format } from "date-fns";
import { useMemo } from "react";
import { AlertTriangle, ArrowUp, ArrowDown, Clock, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LEVEL_ORDER, THREAT_CONFIG } from "@/lib/stormAssessment";
import type { ThreatLevel } from "@/lib/stormAssessment";

interface EscalationEvent {
  from: string;
  to: string;
  direction: "up" | "down";
  timestamp: string;
  score: number;
  prevScore: number;
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
        const prevIdx = LEVEL_ORDER.indexOf(prev.threat_level as ThreatLevel);
        const currIdx = LEVEL_ORDER.indexOf(curr.threat_level as ThreatLevel);
        if (prevIdx === -1 || currIdx === -1) continue; // skip unknown levels
        result.push({
          from: prev.threat_level,
          to: curr.threat_level,
          direction: currIdx > prevIdx ? "up" : "down",
          timestamp: curr.recorded_at,
          score: curr.score,
          prevScore: prev.score,
          details: Array.isArray(curr.details) ? curr.details : [],
          sensorCount: curr.sensor_count,
          criticalCount: curr.critical_count,
          highCount: curr.high_count,
        });
      }
    }
    return result.reverse();
  }, [history]);

  const escalationCount = useMemo(() => events.filter((e) => e.direction === "up").length, [events]);
  const deescalationCount = useMemo(() => events.filter((e) => e.direction === "down").length, [events]);

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
        <div className="ml-auto flex items-center gap-2">
          {escalationCount > 0 && (
            <Badge variant="destructive" className="text-[10px]">
              {escalationCount} escalation{escalationCount !== 1 ? "s" : ""}
            </Badge>
          )}
          {deescalationCount > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {deescalationCount} de-escalation{deescalationCount !== 1 ? "s" : ""}
            </Badge>
          )}
          {events.length === 0 && (
            <Badge variant="secondary" className="text-[10px]">0 events</Badge>
          )}
        </div>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <ShieldAlert className="mb-2 h-8 w-8" />
          <p className="text-sm">No escalation events recorded</p>
          <p className="text-xs">Threat level changes will appear here as sensor data is collected</p>
        </div>
      ) : (
        <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
          {events.map((evt, i) => {
            const fromCfg = THREAT_CONFIG[evt.from as ThreatLevel];
            const toCfg = THREAT_CONFIG[evt.to as ThreatLevel];
            return (
              <div
                key={`${evt.timestamp}-${i}`}
                className={cn(
                  "flex items-start gap-4 px-4 py-3",
                  evt.direction === "up" ? "bg-destructive/5" : "bg-emerald-500/5"
                )}
              >
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

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn("font-bold text-sm", fromCfg?.color)}>
                      {evt.from}
                    </span>
                    <span className="text-muted-foreground text-xs">→</span>
                    <span className={cn("font-bold text-sm", toCfg?.color)}>
                      {evt.to}
                    </span>
                    <Badge
                      variant={evt.direction === "up" ? "destructive" : "secondary"}
                      className="text-[9px] px-1.5 py-0"
                    >
                      {evt.direction === "up" ? "ESCALATION" : "DE-ESCALATION"}
                    </Badge>
                    <span className="text-xs font-mono text-muted-foreground ml-auto">
                      {evt.prevScore} → {evt.score}/100
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
            );
          })}
        </div>
      )}
    </div>
  );
}
