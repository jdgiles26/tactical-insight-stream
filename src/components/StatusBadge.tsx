import { cn } from "@/lib/utils";

type StatusType = "critical" | "high" | "medium" | "low" | "routine" | "ingested" | "processing" | "tagged" | "prioritized" | "transported" | "archived";

const statusStyles: Record<StatusType, string> = {
  critical: "bg-critical/20 text-critical border-critical/30",
  high: "bg-warning/20 text-warning border-warning/30",
  medium: "bg-accent/20 text-accent border-accent/30",
  low: "bg-primary/20 text-primary border-primary/30",
  routine: "bg-muted text-muted-foreground border-border",
  ingested: "bg-accent/20 text-accent border-accent/30",
  processing: "bg-warning/20 text-warning border-warning/30",
  tagged: "bg-primary/20 text-primary border-primary/30",
  prioritized: "bg-primary/20 text-primary border-primary/30",
  transported: "bg-success/20 text-success border-success/30",
  archived: "bg-muted text-muted-foreground border-border",
};

export function StatusBadge({ status, className }: { status: StatusType; className?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-mono font-medium uppercase tracking-wider",
      statusStyles[status] || statusStyles.routine,
      className
    )}>
      <span className={cn(
        "h-1.5 w-1.5 rounded-full",
        status === "critical" && "bg-critical animate-pulse-glow",
        status === "high" && "bg-warning animate-pulse-glow",
        status === "processing" && "bg-warning animate-pulse-glow",
        (status === "medium" || status === "ingested") && "bg-accent",
        (status === "low" || status === "tagged" || status === "prioritized") && "bg-primary",
        (status === "transported") && "bg-success",
        (status === "routine" || status === "archived") && "bg-muted-foreground",
      )} />
      {status}
    </span>
  );
}
