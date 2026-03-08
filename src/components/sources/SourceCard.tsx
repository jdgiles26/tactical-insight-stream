import { Radio, Camera, FileText, Waves, Rss, Ship, Plane } from "lucide-react";
import {
  Power, PowerOff, AlertTriangle, CheckCircle2, RefreshCw,
  Hash, Activity, Clock, Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { DataSource } from "@/hooks/useDataSources";

const SOURCE_TYPE_OPTIONS = [
  { value: "rtsp_camera", label: "RTSP Camera", icon: Camera },
  { value: "audio_feed", label: "Audio Feed", icon: Radio },
  { value: "document", label: "Document", icon: FileText },
  { value: "sensor_telemetry", label: "Sensor Telemetry", icon: Waves },
  { value: "rss_feed", label: "RSS Feed", icon: Rss },
  { value: "ais_tracker", label: "AIS Vessel Tracker", icon: Ship },
  { value: "opensky", label: "OpenSky Aircraft", icon: Plane },
];

function StatusIndicator({ status }: { status: string }) {
  const map: Record<string, { color: string; icon: typeof CheckCircle2 }> = {
    active: { color: "text-success", icon: CheckCircle2 },
    inactive: { color: "text-muted-foreground", icon: PowerOff },
    error: { color: "text-destructive", icon: AlertTriangle },
    connecting: { color: "text-warning", icon: RefreshCw },
  };
  const { color, icon: Icon } = map[status] || map.inactive;
  return (
    <div className={`flex items-center gap-1.5 ${color}`}>
      <Icon className={`h-3.5 w-3.5 ${status === "connecting" ? "animate-spin" : ""}`} />
      <span className="text-xs font-mono uppercase">{status}</span>
    </div>
  );
}

export default function SourceCard({ source, onToggle, onDelete }: { source: DataSource; onToggle: () => void; onDelete: () => void }) {
  const typeInfo = SOURCE_TYPE_OPTIONS.find(t => t.value === source.source_type);
  const Icon = typeInfo?.icon || Radio;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">{source.name}</h4>
            <p className="text-xs text-muted-foreground font-mono">{typeInfo?.label || source.source_type}</p>
          </div>
        </div>
        <StatusIndicator status={source.status} />
      </div>

      {source.endpoint_url && (
        <p className="text-xs text-muted-foreground font-mono truncate bg-secondary/50 rounded px-2 py-1">
          {source.endpoint_url}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="flex items-center gap-1 text-muted-foreground">
          <Hash className="h-3 w-3" />
          <span>{source.total_ingested.toLocaleString()} ingested</span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <Activity className="h-3 w-3" />
          <span>{source.retry_count}/{source.max_retries} retries</span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>{source.last_heartbeat ? formatDistanceToNow(new Date(source.last_heartbeat), { addSuffix: true }) : "never"}</span>
        </div>
      </div>

      {source.last_error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive font-mono">
          {source.last_error}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="outline" className="flex-1" onClick={onToggle}>
          {source.status === "active" ? <PowerOff className="mr-1.5 h-3.5 w-3.5" /> : <Power className="mr-1.5 h-3.5 w-3.5" />}
          {source.status === "active" ? "Deactivate" : "Activate"}
        </Button>
        <Button size="sm" variant="outline" className="text-destructive hover:bg-destructive/10" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
