import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: "up" | "down" | "neutral";
  variant?: "default" | "primary" | "warning" | "critical";
  onClick?: () => void;
  /** Show a pulsing skeleton while data is loading */
  isLoading?: boolean;
}

const variantStyles = {
  default: "border-border",
  primary: "border-primary/30 glow-primary",
  warning: "border-warning/30 glow-warning",
  critical: "border-critical/30 glow-critical",
};

const iconVariants = {
  default: "text-muted-foreground",
  primary: "text-primary",
  warning: "text-warning",
  critical: "text-critical",
};

export function MetricCard({ title, value, subtitle, icon: Icon, variant = "default", onClick, isLoading }: MetricCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-5 transition-all hover:bg-card/80",
        variantStyles[variant],
        onClick && "cursor-pointer"
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{title}</p>
          {isLoading ? (
            <div className="h-9 w-16 animate-pulse rounded bg-secondary" />
          ) : (
            <p className="text-3xl font-bold tracking-tight text-card-foreground">{value}</p>
          )}
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className={cn("rounded-md bg-secondary p-2", iconVariants[variant])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
