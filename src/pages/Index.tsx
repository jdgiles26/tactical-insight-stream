import { MetricCard } from "@/components/MetricCard";
import { DataProductTable } from "@/components/DataProductTable";
import { useDataProducts, useDataProductStats } from "@/hooks/useDataProducts";
import { Database, Activity, Zap, AlertTriangle, TrendingUp, Radio } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

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

export default function Dashboard() {
  const { data: products = [], isLoading } = useDataProducts();
  const { data: stats } = useDataProductStats();

  const criticalCount = stats?.byPriority?.critical || 0;
  const highCount = stats?.byPriority?.high || 0;
  const processingCount = stats?.byStatus?.processing || 0;

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
          subtitle="Requires immediate attention"
          icon={AlertTriangle}
          variant="critical"
        />
        <MetricCard
          title="High Priority"
          value={highCount}
          subtitle="Elevated priority items"
          icon={Zap}
          variant="warning"
        />
        <MetricCard
          title="Processing"
          value={processingCount}
          subtitle="Currently in pipeline"
          icon={Activity}
        />
      </div>

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
