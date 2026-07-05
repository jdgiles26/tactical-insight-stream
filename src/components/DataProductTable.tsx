import { useCallback, useMemo } from "react";
import { StatusBadge } from "./StatusBadge";
import GeoCorrelationBadge from "./GeoCorrelationBadge";
import { KeySplitIndicator } from "./KeySplitIndicator";
import { MapPin } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useSeenItems, useVisibilityTracker } from "@/hooks/useSeenItems";
import { keySplitter } from "@/lib/keySplitter";

interface DataProduct {
  id: string;
  title: string;
  source_type: string;
  source_identifier: string | null;
  status: string;
  priority: string | null;
  priority_score: number | null;
  confidence_score: number | null;
  created_at: string;
  [key: string]: unknown; // allow extra fields for drilldown
}

export function DataProductTable({
  data,
  isLoading,
  onRowClick,
}: {
  data: DataProduct[];
  isLoading: boolean;
  onRowClick?: (id: string) => void;
}) {
  const { isNew, markSeen } = useSeenItems();
  const { observe } = useVisibilityTracker(
    useCallback((id: string) => markSeen(id), [markSeen])
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-md bg-secondary" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p className="text-sm">No data products found</p>
        <p className="text-xs">Ingest some data to get started</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="px-4 py-3 text-xs font-mono uppercase tracking-wider text-muted-foreground w-4"></th>
            <th className="px-4 py-3 text-xs font-mono uppercase tracking-wider text-muted-foreground">Title</th>
            <th className="px-4 py-3 text-xs font-mono uppercase tracking-wider text-muted-foreground">Source</th>
            <th className="px-4 py-3 text-xs font-mono uppercase tracking-wider text-muted-foreground">Status</th>
            <th className="px-4 py-3 text-xs font-mono uppercase tracking-wider text-muted-foreground">Priority</th>
            <th className="px-4 py-3 text-xs font-mono uppercase tracking-wider text-muted-foreground">Score</th>
            <th className="px-4 py-3 text-xs font-mono uppercase tracking-wider text-muted-foreground">
              <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />Geo</span>
            </th>
            <th className="px-4 py-3 text-xs font-mono uppercase tracking-wider text-muted-foreground">Key</th>
            <th className="px-4 py-3 text-xs font-mono uppercase tracking-wider text-muted-foreground">Time</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => {
            const unseen = isNew(item.id);
            return (
              <tr
                key={item.id}
                data-item-id={item.id}
                ref={unseen ? (el) => { if (el) observe(el); } : undefined}
                className={`border-b border-border/50 transition-all duration-500 cursor-pointer hover:bg-secondary/50 ${
                  unseen ? "bg-primary/8" : ""
                }`}
                onClick={() => {
                  markSeen(item.id);
                  onRowClick?.(item.id);
                }}
              >
                <td className="px-2 py-3">
                  {unseen && (
                    <span className="inline-flex h-2 w-2 rounded-full bg-primary animate-pulse" />
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={unseen ? "font-bold text-foreground" : "font-medium text-foreground"}>
                    {item.title}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-muted-foreground">{item.source_type}</span>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={item.status as any} />
                </td>
                <td className="px-4 py-3">
                  {item.priority && <StatusBadge status={item.priority as any} />}
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-foreground">
                    {item.priority_score != null ? `${(Number(item.priority_score) * 100).toFixed(0)}%` : "—"}
                  </span>
                </td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <GeoCorrelationBadge productId={item.id} compact />
                </td>
                <td className="px-4 py-3">
                  <KeySplitIndicator result={keySplitter.classify(item)} compact />
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
