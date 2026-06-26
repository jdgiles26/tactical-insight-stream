import { useState, useMemo, useEffect, useRef } from "react";
import { MetricCard } from "@/components/MetricCard";
import { DataProductTable } from "@/components/DataProductTable";
import { useDataProducts, useDataProductStats } from "@/hooks/useDataProducts";
import { StatusBadge } from "@/components/StatusBadge";
import { useDDILStatus } from "@/hooks/useDDILStatus";
import { useKeySplitter } from "@/hooks/useKeySplitter";
import { KeySplitIndicator } from "@/components/KeySplitIndicator";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Database, Activity, Zap, AlertTriangle, Radio, ExternalLink, Flame, Wifi, WifiOff, ArrowRight, Send, Clock, Bell, SortAsc, SortDesc } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { keySplitter } from "@/lib/keySplitter";
import { ddilOptimizer } from "@/lib/ddilOptimizer";
import ProductDrilldown from "@/components/ProductDrilldown";
import { useDataProductCorrelations } from "@/hooks/useCorrelations";
import { useCorrelationAlerts } from "@/hooks/useCorrelationAlerts";
import { computeTileCounts } from "@/lib/tileCounts";

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

type DrilldownType = "critical" | "high" | "processing" | null;
type DrilldownSort = "score" | "date";

export default function Dashboard() {
  const { data: products = [], isLoading } = useDataProducts();
  const { data: stats } = useDataProductStats();
  const { data: allAlerts = [] } = useCorrelationAlerts();
  const [drilldown, setDrilldown] = useState<DrilldownType>(null);
  const [drilldownSort, setDrilldownSort] = useState<DrilldownSort>("score");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const navigate = useNavigate();

  const selectedProduct = products.find((p) => p.id === selectedProductId) || null;
  const { data: selectedCorrelations } = useDataProductCorrelations(selectedProductId);

  const { networkState, queue, queueSummary, enqueue, dequeue, classifyProduct } = useDDILStatus(5000);
  const { hotKeyStats } = useKeySplitter();

  // Derive tile counts directly from the same `products` array used by the drilldown.
  // This guarantees the number on each tile always matches the drill-down row count,
  // even when the separate stats query is slow, stale, or temporarily unavailable.
  const { criticalCount, highCount, processingCount } = computeTileCounts(products);
  const unacknowledgedAlerts = allAlerts.filter((a) => !a.acknowledged).length;

  // Auto-enqueue new products into the transport queue
  const enqueuedRef = useRef(new Set<string>());
  useEffect(() => {
    for (const p of products) {
      if (!enqueuedRef.current.has(p.id)) {
        enqueuedRef.current.add(p.id);
        ddilOptimizer.enqueue(p);
      }
    }
  }, [products]);

  // Run key-splitting on the latest products
  const latestHotKeys = useMemo(() => {
    return products.slice(0, 20).map(p => ({
      product: p,
      split: keySplitter.classify(p),
    })).filter(x => x.split.is_hot_key);
  }, [products]);

  const drilldownItems = useMemo(() => {
    if (!drilldown) return [];
    const filtered = drilldown === "processing"
      ? products.filter((p) => p.status === "processing")
      : products.filter((p) => p.priority === drilldown);
    return drilldownSort === "score"
      ? [...filtered].sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0))
      : [...filtered].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [drilldown, drilldownSort, products]);

  // Summary stats for the drilldown header
  const drilldownAvgScore = drilldownItems.length > 0
    ? drilldownItems.reduce((s, p) => s + (Number(p.priority_score) || 0), 0) / drilldownItems.length
    : null;

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

      {/* DDIL Network + Transport Queue + Key-Split */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Real Network Status + Queue Counts */}
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Network & Transport</span>
              <div className="flex items-center gap-1.5">
                {networkState.online ? (
                  <Wifi className={`h-3 w-3 ${
                    networkState.status === 'connected' ? 'text-emerald-400' :
                    networkState.status === 'degraded' ? 'text-amber-400' : 'text-orange-400'
                  }`} />
                ) : (
                  <WifiOff className="h-3 w-3 text-red-400" />
                )}
                <Badge variant="outline" className={`text-[9px] ${
                  networkState.status === 'connected' ? 'text-emerald-400 border-emerald-500/30' :
                  networkState.status === 'degraded' ? 'text-amber-400 border-amber-500/30' :
                  networkState.status === 'intermittent' ? 'text-orange-400 border-orange-500/30' :
                  'text-red-400 border-red-500/30'
                }`}>
                  {networkState.status.toUpperCase()}
                </Badge>
              </div>
            </div>
            {/* Real metrics */}
            <div className="grid grid-cols-3 gap-2 text-center mb-3">
              <div>
                <div className="text-lg font-bold text-foreground">
                  {networkState.bandwidth_kbps >= 1000
                    ? `${(networkState.bandwidth_kbps / 1000).toFixed(1)}`
                    : networkState.bandwidth_kbps}
                </div>
                <div className="text-[8px] font-mono uppercase text-muted-foreground">
                  {networkState.bandwidth_kbps >= 1000 ? 'Mbps' : 'kbps'}
                </div>
              </div>
              <div>
                <div className="text-lg font-bold text-foreground">{networkState.latency_ms}</div>
                <div className="text-[8px] font-mono uppercase text-muted-foreground">RTT ms</div>
              </div>
              <div>
                <div className="text-lg font-bold text-foreground">{networkState.effective_type}</div>
                <div className="text-[8px] font-mono uppercase text-muted-foreground">Type</div>
              </div>
            </div>
            {/* Queue class counts */}
            <div className="grid grid-cols-5 gap-1 text-center border-t border-border pt-2">
              {(['flash', 'immediate', 'priority', 'routine', 'deferred'] as const).map(cls => (
                <div key={cls}>
                  <div className={`text-sm font-bold ${
                    cls === 'flash' ? 'text-red-400' :
                    cls === 'immediate' ? 'text-orange-400' :
                    cls === 'priority' ? 'text-amber-400' :
                    cls === 'routine' ? 'text-muted-foreground' : 'text-muted-foreground/50'
                  }`}>{queueSummary[cls]}</div>
                  <div className="text-[7px] font-mono uppercase text-muted-foreground">{cls}</div>
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] font-mono text-muted-foreground">
              <span className="text-emerald-400">{queueSummary.sendable} sendable</span>
              <span className="text-amber-400">{queueSummary.held} held</span>
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
                <div className="text-[9px] font-mono text-muted-foreground/60">Fast-path</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400">{hotKeyStats.cold}</div>
                <div className="text-[10px] font-mono text-muted-foreground">COLD KEYS</div>
                <div className="text-[9px] font-mono text-muted-foreground/60">Standard</div>
              </div>
            </div>
            {hotKeyStats.total > 0 && (
              <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
                <div className="h-full bg-gradient-to-r from-red-500 to-orange-500 rounded-full transition-all"
                  style={{ width: `${(hotKeyStats.hot / hotKeyStats.total) * 100}%` }} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Visual Priority Queue */}
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Priority Queue</span>
              <span className="text-[10px] font-mono text-muted-foreground">{queue.length} items</span>
            </div>
            {queue.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">Queue empty</div>
            ) : (
              <ScrollArea className="h-28">
                <div className="space-y-1">
                  {queue.slice(0, 20).map((item, i) => {
                    const cls = item.priority_class;
                    const color =
                      cls === 'flash' ? 'border-l-red-500 bg-red-500/5' :
                      cls === 'immediate' ? 'border-l-orange-500 bg-orange-500/5' :
                      cls === 'priority' ? 'border-l-amber-500 bg-amber-500/5' :
                      cls === 'routine' ? 'border-l-slate-500 bg-slate-500/5' :
                      'border-l-slate-700 bg-slate-700/5';
                    return (
                      <div key={item.product_id} className={`flex items-center gap-2 border-l-2 rounded-r px-2 py-1 ${color}`}>
                        <span className="text-[8px] font-mono font-bold uppercase w-12 shrink-0" style={{
                          color: cls === 'flash' ? '#f87171' : cls === 'immediate' ? '#fb923c' : cls === 'priority' ? '#fbbf24' : '#94a3b8'
                        }}>{cls}</span>
                        <span className="text-[10px] truncate flex-1 text-foreground">{item.title}</span>
                        {item.can_send_now ? (
                          <Send className="h-2.5 w-2.5 text-emerald-400 shrink-0" />
                        ) : (
                          <Clock className="h-2.5 w-2.5 text-amber-400 shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          title="Total Products"
          value={stats?.total || products.length}
          subtitle="All ingested data"
          icon={Database}
          variant="primary"
          isLoading={isLoading}
        />
        <MetricCard
          title="Critical Items"
          value={criticalCount}
          subtitle="Click to drill down"
          icon={AlertTriangle}
          variant="critical"
          isLoading={isLoading}
          onClick={() => setDrilldown("critical")}
        />
        <MetricCard
          title="High Priority"
          value={highCount}
          subtitle="Click to drill down"
          icon={Zap}
          variant="warning"
          isLoading={isLoading}
          onClick={() => setDrilldown("high")}
        />
        <MetricCard
          title="Processing"
          value={processingCount}
          subtitle="Click to drill down"
          icon={Activity}
          isLoading={isLoading}
          onClick={() => setDrilldown("processing")}
        />
        <MetricCard
          title="Active Alerts"
          value={unacknowledgedAlerts}
          subtitle="Click to view alerts"
          icon={Bell}
          variant={unacknowledgedAlerts > 0 ? "critical" : "default"}
          onClick={() => navigate("/alerts")}
        />
      </div>

      {/* Drilldown Dialog */}
      <Dialog open={!!drilldown} onOpenChange={(open) => {
        if (!open) { setDrilldown(null); setDrilldownSort("score"); }
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {drilldown === "critical" ? (
                <AlertTriangle className="h-5 w-5 text-critical" />
              ) : drilldown === "processing" ? (
                <Activity className="h-5 w-5 text-primary" />
              ) : (
                <Zap className="h-5 w-5 text-warning" />
              )}
              {drilldown === "critical" ? "Critical" : drilldown === "processing" ? "Processing" : "High Priority"} Items ({drilldownItems.length})
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">
              {drilldown === "processing"
                ? "Data products currently running through the pipeline"
                : `Detailed breakdown of ${drilldown} priority data products`}
            </DialogDescription>
          </DialogHeader>

          {/* Enhancement 8: Summary stats bar */}
          {drilldownItems.length > 0 && drilldown !== "processing" && (
            <div className="flex items-center gap-4 rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs font-mono text-muted-foreground">
              <span>Total: <span className="text-foreground font-bold">{drilldownItems.length}</span></span>
              {drilldownAvgScore !== null && (
                <span>Avg score: <span className="text-foreground font-bold">{(drilldownAvgScore * 100).toFixed(0)}%</span></span>
              )}
              <span className="ml-auto flex items-center gap-1">
                {/* Enhancement 7: Sort toggle */}
                <Button
                  size="sm"
                  variant={drilldownSort === "score" ? "secondary" : "ghost"}
                  className="h-6 gap-1 px-2 text-[10px]"
                  onClick={() => setDrilldownSort("score")}
                >
                  <SortDesc className="h-3 w-3" /> Score
                </Button>
                <Button
                  size="sm"
                  variant={drilldownSort === "date" ? "secondary" : "ghost"}
                  className="h-6 gap-1 px-2 text-[10px]"
                  onClick={() => setDrilldownSort("date")}
                >
                  <SortAsc className="h-3 w-3" /> Newest
                </Button>
              </span>
            </div>
          )}

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
                          {drilldown === "processing" && (
                            <Badge variant="outline" className="text-[9px] text-blue-400 border-blue-500/30">IN PIPELINE</Badge>
                          )}
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

                        {/* Why it's critical / high */}
                        {drilldown !== "processing" && (
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
                        )}
                      </div>
                      <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Enhancement 9: View All navigation */}
          {drilldownItems.length > 0 && (
            <div className="pt-2 flex justify-end border-t border-border">
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 text-xs font-mono"
                onClick={() => {
                  setDrilldown(null);
                  if (drilldown === "processing") navigate("/pipeline");
                  else navigate("/ingest");
                }}
              >
                View all in full list <ArrowRight className="h-3 w-3" />
              </Button>
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
        <DataProductTable
          data={products}
          isLoading={isLoading}
          onRowClick={(id) => setSelectedProductId(id)}
        />
      </div>

      {/* Product Drilldown Panel */}
      {selectedProductId && selectedProduct && (
        <ProductDrilldown
          product={selectedProduct as any}
          detectionResults={selectedCorrelations?.detections ?? []}
          onClose={() => setSelectedProductId(null)}
        />
      )}
    </div>
  );
}
