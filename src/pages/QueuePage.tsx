import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDistanceToNow } from "date-fns";
import { Radio } from "lucide-react";

export default function QueuePage() {
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["queue_products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("data_products")
        .select("*")
        .in("status", ["ingested", "processing", "tagged"])
        .order("priority_score", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
  });

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Processing Queue</h2>
        <p className="text-sm text-muted-foreground font-mono">Active pipeline items sorted by priority</p>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            {products.length} items in queue
          </span>
          <div className="flex items-center gap-2">
            <Radio className="h-3 w-3 text-primary animate-pulse-glow" />
            <span className="text-xs font-mono text-muted-foreground">Live • 5s refresh</span>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {[...Array(5)].map((_, i) => <div key={i} className="h-12 animate-pulse rounded-md bg-secondary" />)}
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Radio className="mb-2 h-8 w-8" />
            <p className="text-sm">Queue is empty</p>
            <p className="text-xs">All items have been processed</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {products.map((item, i) => (
              <div key={item.id} className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-secondary/30">
                <span className="w-6 text-center font-mono text-xs text-muted-foreground">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                  <p className="text-xs font-mono text-muted-foreground">{item.source_type} • {item.source_identifier || "unknown"}</p>
                </div>
                <StatusBadge status={item.status as any} />
                {item.priority && <StatusBadge status={item.priority as any} />}
                <span className="font-mono text-xs text-muted-foreground w-20 text-right">
                  {item.priority_score != null ? `${(Number(item.priority_score) * 100).toFixed(0)}%` : "—"}
                </span>
                <span className="text-xs text-muted-foreground w-24 text-right">
                  {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
