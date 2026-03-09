import { useState } from "react";
import { MetricCard } from "@/components/MetricCard";
import { DataProductTable } from "@/components/DataProductTable";
import { useDataProducts, useDataProductStats } from "@/hooks/useDataProducts";
import { StatusBadge } from "@/components/StatusBadge";
import { Database, Activity, Zap, AlertTriangle, TrendingUp, Radio, X, ExternalLink } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";

const PIE_COLORS = [
  "hsl(160, 70%, 45%)",
  "hsl(200, 80%, 55%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 72%, 55%)",
  "hsl(270, 60%, 55%)",
  "hsl(160, 40%, 35%)",
  "hsl(200, 40%, 40%)",
  "hsl(38, 60%, 40%)",
];

type DrilldownType = "critical" | "high" | null;

export default function Dashboard() {
  const { data: products = [], isLoading } = useDataProducts();
  const { data: stats } = useDataProductStats();
  const [drilldown, setDrilldown] = useState<DrilldownType>(null);
  const navigate = useNavigate();

  const criticalCount = stats?.byPriority?.critical || 0;
  const highCount = stats?.byPriority?.high || 0;
  const processingCount = stats?.byStatus?.processing || 0;

  const drilldownItems = drilldown
    ? products.filter((p) => p.priority === drilldown).sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0))
    : [];

  const sourceData = stats?.bySource
    ? Object.entries(stats.bySource).map(([name, value]) => ({ name, value }))
    : [];

  const statusData = stats?.byStatus
    ? Object.entries(stats.byStatus).map(([name, value]) => ({ name, value }))
    : [];

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Operations Dashboard</h2>
        <p className="text-sm text-muted-foreground font-mono">Real-time tactical data overview</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Products"
          value={stats?.total || 0}
          subtitle="All ingested data"
          icon={Database}
          variant="primary"
        />
        <MetricCard
          title="Critical Items"
          value={criticalCount}
          subtitle="Click to drill down"
          icon={AlertTriangle}
          variant="critical"
          onClick={() => setDrilldown("critical")}
        />
        <MetricCard
          title="High Priority"
          value={highCount}
          subtitle="Click to drill down"
          icon={Zap}
          variant="warning"
          onClick={() => setDrilldown("high")}
        />
        <MetricCard
          title="Processing"
          value={processingCount}
          subtitle="Currently in pipeline"
          icon={Activity}
        />
      </div>

      {/* Drilldown Dialog */}
      <Dialog open={!!drilldown} onOpenChange={(open) => !open && setDrilldown(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {drilldown === "critical" ? (
                <AlertTriangle className="h-5 w-5 text-critical" />
              ) : (
                <Zap className="h-5 w-5 text-warning" />
              )}
              {drilldown === "critical" ? "Critical" : "High Priority"} Items ({drilldownItems.length})
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">
              Detailed breakdown of {drilldown} priority data products
            </DialogDescription>
          </DialogHeader>

          {drilldownItems.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No {drilldown} items found</p>
          ) : (
            <div className="space-y-3">
              {drilldownItems.map((item) => {
                const content = item.content as Record<string, unknown> | null;
                return (
                  <div
                    key={item.id}
                    className="rounded-lg border border-border bg-secondary/30 p-4 cursor-pointer hover:bg-secondary/60 transition-colors"
                    onClick={() => {
                      setDrilldown(null);
                      navigate(`/discovery?q=${encodeURIComponent(item.title.split(":")[0] || item.title)}`);
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-foreground truncate">{item.title}</span>
                          <StatusBadge status={item.priority as any} />
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground font-mono">
                          <span>{item.source_type}</span>
                          <span>•</span>
                          <span>Score: {item.priority_score != null ? `${(Number(item.priority_score) * 100).toFixed(0)}%` : "—"}</span>
                          <span>•</span>
                          <span>Confidence: {item.confidence_score != null ? `${(Number(item.confidence_score) * 100).toFixed(0)}%` : "—"}</span>
                          <span>•</span>
                          <span>{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</span>
                        </div>

                        {/* Why it's critical */}
                        <div className="mt-2 rounded border border-border bg-background/50 p-2">
                          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">
                            Why {drilldown}
                          </p>
                          {item.priority_reasoning ? (
                            <p className="text-xs text-foreground">{item.priority_reasoning}</p>
                          ) : (
                            <div className="text-xs text-foreground space-y-0.5">
                              {item.priority_score != null && Number(item.priority_score) >= 0.9 && (
                                <p>• Priority score ≥ 90% ({(Number(item.priority_score) * 100).toFixed(0)}%)</p>
                              )}
                              {item.priority_score != null && Number(item.priority_score) >= 0.7 && Number(item.priority_score) < 0.9 && (
                                <p>• Elevated priority score ({(Number(item.priority_score) * 100).toFixed(0)}%)</p>
                              )}
                              {content && typeof content === "object" && (content as any).altitude != null && Number((content as any).altitude) < 500 && (
                                <p>• Extremely low altitude ({Number((content as any).altitude).toFixed(0)}m)</p>
                              )}
                              {content && typeof content === "object" && (content as any).squawk === "7700" && (
                                <p>• Emergency squawk code (7700)</p>
                              )}
                              {content && typeof content === "object" && (content as any).squawk === "7600" && (
                                <p>• Radio failure squawk code (7600)</p>
                              )}
                              {content && typeof content === "object" && (content as any).vertical_rate != null && Math.abs(Number((content as any).vertical_rate)) > 10 && (
                                <p>• Rapid altitude change ({Number((content as any).vertical_rate).toFixed(1)} m/s)</p>
                              )}
                              {item.source_type === "document" && content && typeof content === "object" && (content as any).category && (
                                <p>• Category: {(content as any).category} — {(content as any).feed || "intel feed"}</p>
                              )}
                              {!item.priority_reasoning && item.priority_score != null && Number(item.priority_score) < 0.7 && (
                                <p>• Classified as {drilldown} by automated priority engine</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-mono uppercase tracking-wider text-muted-foreground">Status Distribution</h3>
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={statusData}>
                <XAxis dataKey="name" tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "hsl(220, 18%, 12%)", border: "1px solid hsl(220, 15%, 18%)", borderRadius: 8, color: "hsl(200, 20%, 90%)", fontFamily: "JetBrains Mono", fontSize: 12 }} />
                <Bar dataKey="value" fill="hsl(160, 70%, 45%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">No data yet</div>
          )}
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-mono uppercase tracking-wider text-muted-foreground">Source Types</h3>
          {sourceData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={sourceData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} strokeWidth={0}>
                  {sourceData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(220, 18%, 12%)", border: "1px solid hsl(220, 15%, 18%)", borderRadius: 8, color: "hsl(200, 20%, 90%)", fontFamily: "JetBrains Mono", fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">No data yet</div>
          )}
        </div>
      </div>

      {/* Recent Data */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">Recent Data Products</h3>
          <Radio className="h-4 w-4 text-primary animate-pulse-glow" />
        </div>
        <DataProductTable data={products} isLoading={isLoading} />
      </div>
    </div>
  );
}
