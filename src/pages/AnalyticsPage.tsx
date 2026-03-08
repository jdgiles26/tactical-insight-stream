import { useDataProductStats } from "@/hooks/useDataProducts";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from "recharts";

const COLORS = [
  "hsl(160, 70%, 45%)",
  "hsl(200, 80%, 55%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 72%, 55%)",
  "hsl(270, 60%, 55%)",
  "hsl(160, 40%, 35%)",
  "hsl(200, 40%, 40%)",
  "hsl(38, 60%, 40%)",
];

const tooltipStyle = {
  background: "hsl(220, 18%, 12%)",
  border: "1px solid hsl(220, 15%, 18%)",
  borderRadius: 8,
  color: "hsl(200, 20%, 90%)",
  fontFamily: "JetBrains Mono",
  fontSize: 12,
};

const tickStyle = { fill: "hsl(215, 15%, 55%)", fontSize: 10, fontFamily: "JetBrains Mono" };

export default function AnalyticsPage() {
  const { data: stats } = useDataProductStats();

  const priorityData = stats?.byPriority
    ? Object.entries(stats.byPriority).map(([name, value]) => ({ name, value }))
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
        <h2 className="text-2xl font-bold tracking-tight">Analytics</h2>
        <p className="text-sm text-muted-foreground font-mono">Data distribution and performance metrics</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-mono uppercase tracking-wider text-muted-foreground">Priority Distribution</h3>
          {priorityData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={priorityData}>
                <XAxis dataKey="name" tick={tickStyle} axisLine={false} tickLine={false} />
                <YAxis tick={tickStyle} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {priorityData.map((entry, i) => {
                    const colorMap: Record<string, string> = {
                      critical: "hsl(0, 72%, 55%)",
                      high: "hsl(38, 92%, 50%)",
                      medium: "hsl(200, 80%, 55%)",
                      low: "hsl(160, 70%, 45%)",
                      routine: "hsl(215, 15%, 55%)",
                    };
                    return <Cell key={i} fill={colorMap[entry.name] || COLORS[i]} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-mono uppercase tracking-wider text-muted-foreground">Source Breakdown</h3>
          {sourceData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={sourceData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} strokeWidth={0} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {sourceData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </div>

        <div className="rounded-lg border border-border bg-card p-5 lg:col-span-2">
          <h3 className="mb-4 text-sm font-mono uppercase tracking-wider text-muted-foreground">Processing Pipeline Status</h3>
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={statusData}>
                <XAxis dataKey="name" tick={tickStyle} axisLine={false} tickLine={false} />
                <YAxis tick={tickStyle} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="value" stroke="hsl(160, 70%, 45%)" fill="hsl(160, 70%, 45%)" fillOpacity={0.2} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </div>
      </div>
    </div>
  );
}

function EmptyChart() {
  return <div className="flex h-[280px] items-center justify-center text-xs text-muted-foreground font-mono">No data available — ingest some data products first</div>;
}
