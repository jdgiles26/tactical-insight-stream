import AlertsPanel from "@/components/AlertsPanel";

export default function AlertsPage() {
  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Correlation Alerts</h2>
        <p className="text-sm text-muted-foreground font-mono">
          Real-time alerts when detections match Commander's Intent across data sources
        </p>
      </div>
      <AlertsPanel />
    </div>
  );
}
