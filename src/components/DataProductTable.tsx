import { StatusBadge } from "./StatusBadge";
import { formatDistanceToNow } from "date-fns";

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
}

export function DataProductTable({ data, isLoading }: { data: DataProduct[]; isLoading: boolean }) {
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
            <th className="px-4 py-3 text-xs font-mono uppercase tracking-wider text-muted-foreground">Title</th>
            <th className="px-4 py-3 text-xs font-mono uppercase tracking-wider text-muted-foreground">Source</th>
            <th className="px-4 py-3 text-xs font-mono uppercase tracking-wider text-muted-foreground">Status</th>
            <th className="px-4 py-3 text-xs font-mono uppercase tracking-wider text-muted-foreground">Priority</th>
            <th className="px-4 py-3 text-xs font-mono uppercase tracking-wider text-muted-foreground">Score</th>
            <th className="px-4 py-3 text-xs font-mono uppercase tracking-wider text-muted-foreground">Time</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.id} className="border-b border-border/50 transition-colors hover:bg-secondary/50">
              <td className="px-4 py-3 font-medium text-foreground">{item.title}</td>
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
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
