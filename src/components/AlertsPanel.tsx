import { useState, useCallback, useEffect } from "react";
import { useCorrelationAlerts, useRealtimeAlerts, useAcknowledgeAlert, CorrelationAlert } from "@/hooks/useCorrelationAlerts";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Bell, BellOff, CheckCircle, Loader2, X, Zap } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

const matchTypeColors: Record<string, string> = {
  exact: "bg-destructive/20 text-destructive",
  related: "bg-[hsl(var(--warning))]/20 text-[hsl(var(--warning))]",
  semantic: "bg-accent/20 text-accent",
  cross_source: "bg-destructive/30 text-destructive font-bold",
};

export default function AlertsPanel() {
  const { data: alerts, isLoading, refetch } = useCorrelationAlerts();
  const { acknowledge } = useAcknowledgeAlert();
  const [liveAlerts, setLiveAlerts] = useState<CorrelationAlert[]>([]);

  const handleNewAlert = useCallback((alert: CorrelationAlert) => {
    setLiveAlerts((prev) => [alert, ...prev]);
    refetch();

    // Audio-visual notification
    const isCrossSource = alert.match_type === "cross_source";
    toast.error(
      `🚨 ${isCrossSource ? "CROSS-SOURCE CORRELATION" : "ALERT"}: "${alert.matched_term}" matched "${alert.matched_label}"`,
      {
        duration: isCrossSource ? 15000 : 8000,
        important: true,
      }
    );
  }, [refetch]);

  useRealtimeAlerts(handleNewAlert);

  const handleAcknowledge = async (id: string) => {
    try {
      await acknowledge(id);
      refetch();
      toast.success("Alert acknowledged");
    } catch {
      toast.error("Failed to acknowledge");
    }
  };

  const allAlerts = alerts ?? [];
  const unacknowledged = allAlerts.filter((a) => !a.acknowledged);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <h3 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
          Correlation Alerts
        </h3>
        {unacknowledged.length > 0 && (
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-destructive/20 px-2.5 py-0.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
            </span>
            <span className="text-xs font-mono font-bold text-destructive">{unacknowledged.length}</span>
          </span>
        )}
      </div>

      <ScrollArea className="h-[500px]">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : allAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <BellOff className="mb-2 h-6 w-6 opacity-40" />
            <p className="text-xs font-mono">No alerts — define objects of interest in Commander's Intent</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {allAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`px-4 py-3 transition-colors ${
                  !alert.acknowledged ? "bg-destructive/5" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  {alert.match_type === "cross_source" ? (
                    <Zap className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  ) : (
                    <Bell className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--warning))]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      <span className="text-destructive">"{alert.matched_term}"</span>
                      {" → "}
                      <span className="text-accent">{alert.matched_label}</span>
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-mono uppercase ${
                          matchTypeColors[alert.match_type] ?? matchTypeColors.related
                        }`}
                      >
                        {alert.match_type}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        score: {(alert.match_score * 100).toFixed(0)}%
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground/50">
                        {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  {!alert.acknowledged && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 shrink-0 text-xs"
                      onClick={() => handleAcknowledge(alert.id)}
                    >
                      <CheckCircle className="mr-1 h-3 w-3" /> ACK
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
