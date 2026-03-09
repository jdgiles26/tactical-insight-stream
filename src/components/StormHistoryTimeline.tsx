import { useStormHistory, type StormSnapshot } from "@/hooks/useStormHistory";
import { format } from "date-fns";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine,
  CartesianGrid,
} from "recharts";
import { Clock, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

const LEVEL_SCORE: Record<string, number> = {
  MINIMAL: 0, GUARDED: 1, ELEVATED: 2, HIGH: 3, SEVERE: 4,
};
const LEVEL_COLOR: Record<string, string> = {
  MINIMAL: "#34d399", GUARDED: "#38bdf8", ELEVATED: "#fbbf24", HIGH: "#fb923c", SEVERE: "#f87171",
};

function TrendBadge({ history }: { history: StormSnapshot[] }) {
  if (history.length < 2) return null;
  const recent = history.slice(-3);
  const first = recent[0].score;
  const last = recent[recent.length - 1].score;
  const diff = last - first;

  if (Math.abs(diff) < 3) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" /> Stable
      </span>
    );
  }
  if (diff > 0) {
    return (
      <span className="flex items-center gap-1 text-xs text-destructive">
        <TrendingUp className="h-3 w-3" /> Worsening (+{diff})
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-emerald-400">
      <TrendingDown className="h-3 w-3" /> Improving ({diff})
    </span>
  );
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-xs shadow-lg space-y-1">
      <p className="font-mono text-muted-foreground">{d.time}</p>
      <p className="font-bold" style={{ color: LEVEL_COLOR[d.level] || "#6b7280" }}>
        {d.level} — Score {d.score}/100
      </p>
      <p className="text-muted-foreground">
        {d.sensors} stations · {d.critical} critical · {d.high} high
      </p>
      {d.maxWater != null && (
        <p className="text-muted-foreground">Peak: {Number(d.maxWater).toFixed(1)}ft · Avg: {Number(d.avgWater).toFixed(1)}ft</p>
      )}
    </div>
  );
};

export default function StormHistoryTimeline() {
  const { data: history = [], isLoading } = useStormHistory(48);

  const chartData = history.map((h) => ({
    time: format(new Date(h.recorded_at), "MMM d HH:mm"),
    score: h.score,
    level: h.threat_level,
    sensors: h.sensor_count,
    critical: h.critical_count,
    high: h.high_count,
    avgWater: h.avg_water_level,
    maxWater: h.max_water_level,
  }));

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground font-mono">Loading storm history…</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Storm Threat History (48h)
          </span>
        </div>
        <TrendBadge history={history} />
      </div>

      {chartData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
          <Clock className="mb-2 h-6 w-6" />
          <p className="text-sm">No history recorded yet</p>
          <p className="text-xs">Snapshots are saved each time sensor data is refreshed</p>
        </div>
      ) : (
        <div className="p-4">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={75} stroke="#f87171" strokeDasharray="4 2" label={{ value: "SEVERE", fontSize: 9, fill: "#f87171" }} />
              <ReferenceLine y={50} stroke="#fb923c" strokeDasharray="4 2" label={{ value: "HIGH", fontSize: 9, fill: "#fb923c" }} />
              <ReferenceLine y={30} stroke="#fbbf24" strokeDasharray="4 2" label={{ value: "ELEVATED", fontSize: 9, fill: "#fbbf24" }} />
              <ReferenceLine y={10} stroke="#38bdf8" strokeDasharray="4 2" label={{ value: "GUARDED", fontSize: 9, fill: "#38bdf8" }} />
              <Area
                type="monotone"
                dataKey="score"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#scoreGrad)"
                dot={(props: any) => {
                  const color = LEVEL_COLOR[props.payload?.level] || "hsl(var(--primary))";
                  return (
                    <circle
                      key={props.index}
                      cx={props.cx}
                      cy={props.cy}
                      r={4}
                      fill={color}
                      stroke="hsl(var(--background))"
                      strokeWidth={2}
                    />
                  );
                }}
              />
            </AreaChart>
          </ResponsiveContainer>

          {/* Recent snapshots list */}
          {history.length > 0 && (
            <div className="mt-3 space-y-1 max-h-[120px] overflow-y-auto">
              {history.slice().reverse().slice(0, 10).map((h) => (
                <div key={h.id} className="flex items-center justify-between text-[11px] px-2 py-1 rounded bg-secondary/30">
                  <span className="font-mono text-muted-foreground">
                    {format(new Date(h.recorded_at), "MMM d HH:mm")}
                  </span>
                  <span
                    className="font-bold"
                    style={{ color: LEVEL_COLOR[h.threat_level] || "#6b7280" }}
                  >
                    {h.threat_level}
                  </span>
                  <span className="font-mono text-muted-foreground">{h.score}/100</span>
                  <span className="text-muted-foreground">
                    {h.critical_count}C / {h.high_count}H / {h.sensor_count}S
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
