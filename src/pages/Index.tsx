import { useState, useMemo } from "react";
import { MetricCard } from "@/components/MetricCard";
import { DataProductTable } from "@/components/DataProductTable";
import { useDataProducts, useDataProductStats } from "@/hooks/useDataProducts";
import { StatusBadge } from "@/components/StatusBadge";
import { useDDILStatus } from "@/hooks/useDDILStatus";
import { useKeySplitter } from "@/hooks/useKeySplitter";
import { KeySplitIndicator } from "@/components/KeySplitIndicator";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Database, Activity, Zap, AlertTriangle, TrendingUp, Radio, X, ExternalLink, Flame, Snowflake, Satellite, Signal, Wifi, WifiOff } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { keySplitter } from "@/lib/keySplitter";

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

  const { networkState, classifyProduct } = useDDILStatus(3000);
  const { hotKeyStats, recentHotKeys } = useKeySplitter();

  const criticalCount = stats?.byPriority?.critical || 0;
  const highCount = stats?.byPriority?.high || 0;
  const processingCount = stats?.byStatus?.processing || 0;

  // Classify products for transport on render
  const transportSummary = useMemo(() => {
    const summary = { flash: 0, immediate: 0, priority: 0, routine: 0, deferred: 0, can_send: 0, held: 0 };
    for (const p of products.slice(0, 50)) {
      const tc = classifyProduct(p);
      summary[tc.priority_class]++;
      if (tc.can_send_now) summary.can_send++;
      else summary.held++;
    }
    return summary;
  }, [products, classifyProduct]);

  // Run key-splitting on the latest products
  const latestHotKeys = useMemo(() => {
    return products.slice(0, 20).map(p => ({
      product: p,
      split: keySplitter.classify(p),
    })).filter(x => x.split.is_hot_key);
  }, [products]);

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

      {/* DDIL + Key-Split Status Bar */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Network Transport Status */}
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Transport Queue</span>
              <Badge variant="outline" className={`text-[9px] ${
                networkState.status === 'connected' ? 'text-emerald-400 border-emerald-500/30' :
                networkState.status === 'degraded' ? 'text-amber-400 border-amber-500/30' :
                networkState.status === 'intermittent' ? 'text-orange-400 border-orange-500/30' :
                'text-red-400 border-red-500/30'
              }`}>
                {networkState.status.toUpperCase()}
              </Badge>
            </div>
            <div className="grid grid-cols-5 gap-1 text-center">
              {(['flash', 'immediate', 'priority', 'routine', 'deferred'] as const).map(cls => (
                <div key={cls}>
                  <div className={`text-lg font-bold ${
                    cls === 'flash' ? 'text-red-400' :
                    cls === 'immediate' ? 'text-orange-400' :
                    cls === 'priority' ? 'text-amber-400' :
                    cls === 'routine' ? 'text-muted-foreground' : 'text-muted-foreground/50'
                  }`}>{transportSummary[cls]}</div>
                  <div className="text-[8px] font-mono uppercase text-muted-foreground">{cls}</div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[10px] font-mono text-muted-foreground">
              <span className="text-emerald-400">{transportSummary.can_send} sendable</span>
              <span className="text-amber-400">{transportSummary.held} held</span>
            </div>
          </CardContent>
        </Card>

        {/* Key-Splitting Stats */}
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Key-Split Pipeline</span>
              <Badge variant="outline" className="text-[9px] border-red-500/30 text-red-400 gap-1">
                <Flame className="h-2.5 w-2.5" />
                {hotKeyStats.hot} HOT
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-red-400">{hotKeyStats.hot}</div>
                <div className="text-[10px] font-mono text-muted-foreground">HOT KEYS</div>
                <div className="text-[9px] font-mono text-muted-foreground/60">Fast-path processing</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400">{hotKeyStats.cold}</div>
                <div className="text-[10px] font-mono text-muted-foreground">COLD KEYS</div>
                <div className="text-[9px] font-mono text-muted-foreground/60">Standard pipeline</div>
              </div>
            </div>
            {hotKeyStats.total > 0 && (
              <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-red-500 to-orange-500 rounded-full transition-all"
                  style={{ width: `${(hotKeyStats.hot / hotKeyStats.total) * 100}%` }}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Hot Keys */}
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Recent Hot Keys</span>
              <Flame className="h-3.5 w-3.5 text-red-400 animate-pulse" />
            </div>
            {latestHotKeys.length === 0 ? (
              <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">No hot keys detected</div>
            ) : (
              <div className="space-y-1.5 max-h-24 overflow-y-auto">
                {latestHotKeys.slice(0, 5).map(({ product, split }) => (
                  <div key={product.id} className="flex items-center gap-2 text-xs">
                    <KeySplitIndicator result={split} compact />
                    <span className="truncate text-foreground">{product.title}</span>
                    <span className="ml-auto text-[9px] font-mono text-muted-foreground">
                      {split.hot_key_reason?.replace(/_/g, ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
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
