import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, Radio, Zap, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useSeenItems, useVisibilityTracker } from "@/hooks/useSeenItems";

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
  const navigate = useNavigate();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [newCount, setNewCount] = useState(0);
  const { isNew, markSeen } = useSeenItems();
  const { observe } = useVisibilityTracker(
    useCallback((id: string) => markSeen(id), [markSeen])
  );

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

  useEffect(() => {
    const channel = supabase
      .channel("activity_feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "data_products" },
        (payload) => {
          const newItem = payload.new as FeedItem;
          setItems((prev) => [newItem, ...prev].slice(0, 100));
          setNewCount((c) => c + 1);
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
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleClick = (item: FeedItem) => {
    markSeen(item.id);
    navigate(`/discovery?q=${encodeURIComponent(item.title)}`);
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Activity className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
          Live Activity Feed
        </h3>
        {newCount > 0 && (
          <span className="ml-1 inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold animate-pulse">
            {newCount}
          </span>
        )}
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
            {items.map((item) => {
              const unseen = isNew(item.id);
              return (
                <div
                  key={item.id}
                  data-item-id={item.id}
                  ref={unseen ? observe : undefined}
                  onClick={() => handleClick(item)}
                  className={`flex items-start gap-3 px-4 py-3 transition-all duration-500 cursor-pointer hover:bg-secondary/50 ${
                    unseen ? "bg-primary/8 border-l-2 border-l-primary" : ""
                  }`}
                >
                  <Zap className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${unseen ? "text-primary" : "text-primary/60"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={`truncate text-sm ${unseen ? "font-bold text-foreground" : "font-medium text-foreground"}`}>
                        {item.title}
                      </p>
                      {unseen && (
                        <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[8px] font-bold uppercase text-primary-foreground leading-none">
                          NEW
                        </span>
                      )}
                    </div>
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
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[10px] font-mono text-muted-foreground/50">
                      {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                    </span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground/30" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
