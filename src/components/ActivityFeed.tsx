import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, Radio, Zap } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface FeedItem {
  id: string;
  title: string;
  source_type: string;
  priority: string | null;
  status: string;
  created_at: string;
  source_identifier: string | null;
}

const priorityColors: Record<string, string> = {
  critical: "bg-destructive/20 text-destructive",
  high: "bg-[hsl(var(--warning))]/20 text-[hsl(var(--warning))]",
  medium: "bg-accent/20 text-accent",
  low: "bg-muted-foreground/20 text-muted-foreground",
  routine: "bg-muted-foreground/15 text-muted-foreground",
};

export default function ActivityFeed() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [flash, setFlash] = useState<string | null>(null);

  // Load recent items
  useEffect(() => {
    supabase
      .from("data_products")
      .select("id, title, source_type, priority, status, created_at, source_identifier")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data) setItems(data as FeedItem[]);
      });
  }, []);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel("activity_feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "data_products" },
        (payload) => {
          const newItem = payload.new as FeedItem;
          setItems((prev) => [newItem, ...prev].slice(0, 100));
          setFlash(newItem.id);
          setTimeout(() => setFlash(null), 1500);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "data_products" },
        (payload) => {
          const updated = payload.new as FeedItem;
          setItems((prev) =>
            prev.map((item) => (item.id === updated.id ? updated : item))
          );
          setFlash(updated.id);
          setTimeout(() => setFlash(null), 1500);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Activity className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
          Live Activity Feed
        </h3>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          <span className="text-xs font-mono text-muted-foreground">LIVE</span>
        </div>
      </div>

      <ScrollArea className="h-[420px]">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Radio className="mb-2 h-6 w-6 opacity-40" />
            <p className="text-xs font-mono">Waiting for data…</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item) => (
              <div
                key={item.id}
                className={`flex items-start gap-3 px-4 py-3 transition-colors duration-700 ${
                  flash === item.id ? "bg-primary/10" : ""
                }`}
              >
                <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/60" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {item.title}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-mono uppercase text-muted-foreground">
                      {item.source_type}
                    </span>
                    {item.priority && (
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-mono uppercase ${
                          priorityColors[item.priority] ?? priorityColors.routine
                        }`}
                      >
                        {item.priority}
                      </span>
                    )}
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                      {item.status}
                    </span>
                    {item.source_identifier && (
                      <span className="text-[10px] font-mono text-muted-foreground/60">
                        {item.source_identifier}
                      </span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-[10px] font-mono text-muted-foreground/50">
                  {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
