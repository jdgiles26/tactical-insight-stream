import { useState } from "react";
import { useDataSources, useCreateDataSource, useUpdateDataSource, useDeleteDataSource, DataSource } from "@/hooks/useDataSources";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Radio, Camera, FileText, Waves, Rss, Plus, Trash2, Power, PowerOff,
  RefreshCw, AlertTriangle, CheckCircle2, Loader2, Activity, Clock, Hash,
  Satellite, Ship, Plane, Download,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const SOURCE_TYPE_OPTIONS = [
  { value: "rtsp_camera", label: "RTSP Camera", icon: Camera, description: "IP cameras and video surveillance streams" },
  { value: "audio_feed", label: "Audio Feed", icon: Radio, description: "Radio comms, distress calls, VHF/UHF" },
  { value: "document", label: "Document", icon: FileText, description: "PDF reports, logs, manifests" },
  { value: "sensor_telemetry", label: "Sensor Telemetry", icon: Waves, description: "Buoy data, AIS, radar, sonar" },
  { value: "rss_feed", label: "RSS Feed", icon: Rss, description: "Maritime alerts, weather, news" },
  { value: "ais_tracker", label: "AIS Vessel Tracker", icon: Ship, description: "Live AIS vessel positions" },
  { value: "opensky", label: "OpenSky Aircraft", icon: Plane, description: "Live aircraft tracking via OpenSky" },
] as const;

const AUTH_OPTIONS = ["none", "api_key", "basic", "bearer", "certificate"] as const;

const FREE_FEEDS = [
  { key: "bbc_world", label: "BBC World News", category: "news" },
  { key: "reuters", label: "Reuters Top News", category: "news" },
  { key: "aljazeera", label: "Al Jazeera", category: "news" },
  { key: "defense_one", label: "Defense One", category: "defense" },
  { key: "breaking_defense", label: "Breaking Defense", category: "defense" },
  { key: "defense_news", label: "Defense News", category: "defense" },
  { key: "usni_news", label: "USNI News (Maritime)", category: "maritime" },
  { key: "bellingcat", label: "Bellingcat (OSINT)", category: "osint" },
  { key: "state_dept", label: "State Department", category: "government" },
  { key: "csis", label: "CSIS Analysis", category: "think_tank" },
  { key: "atlantic_council", label: "Atlantic Council", category: "think_tank" },
  { key: "foreign_policy", label: "Foreign Policy", category: "geopolitics" },
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

function SourceCard({ source, onToggle, onDelete }: { source: DataSource; onToggle: () => void; onDelete: () => void }) {
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

export default function SourcesPage() {
  const { data: sources, isLoading } = useDataSources();
  const createSource = useCreateDataSource();
  const updateSource = useUpdateDataSource();
  const deleteSource = useDeleteDataSource();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [sourceType, setSourceType] = useState("sensor_telemetry");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [authType, setAuthType] = useState("none");
  const [maxRetries, setMaxRetries] = useState("5");
  const [retryDelay, setRetryDelay] = useState("30");
  const [rssLoading, setRssLoading] = useState(false);
  const [liveLoading, setLiveLoading] = useState<string | null>(null);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createSource.mutate({
      name: name.trim(),
      source_type: sourceType,
      endpoint_url: endpointUrl || null,
      auth_type: authType,
      status: "inactive",
      max_retries: parseInt(maxRetries) || 5,
      retry_delay_seconds: parseInt(retryDelay) || 30,
    } as any, {
      onSuccess: () => {
        toast.success("Data source created");
        setShowForm(false);
        setName(""); setEndpointUrl("");
      },
      onError: (err) => toast.error("Failed: " + err.message),
    });
  };

  const handleToggle = (source: DataSource) => {
    const newStatus = source.status === "active" ? "inactive" : "active";
    updateSource.mutate({ id: source.id, status: newStatus } as any, {
      onSuccess: () => toast.success(`Source ${newStatus}`),
    });
  };

  const handleHardDelete = (id: string) => {
    if (!confirm("Permanently delete this source and all associated data?")) return;
    deleteSource.mutate(id, {
      onSuccess: () => toast.success("Source permanently deleted"),
      onError: (err) => toast.error("Delete failed: " + err.message),
    });
  };

  const handleRssIngest = async (feedKeys?: string[]) => {
    setRssLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("rss-ingester", {
        body: { action: "ingest", feeds: feedKeys },
      });
      if (error) throw error;
      toast.success(`RSS ingestion complete: ${data?.total_ingested || 0} new articles`);
    } catch (err: any) {
      toast.error("RSS ingestion failed: " + err.message);
    } finally {
      setRssLoading(false);
    }
  };

  const handleLiveIngest = async (source: "opensky" | "ais") => {
    setLiveLoading(source);
    try {
      const { data, error } = await supabase.functions.invoke("live-data-ingester", {
        body: { action: "ingest", source },
      });
      if (error) throw error;
      toast.success(`${source.toUpperCase()}: ${data?.ingested || 0} records ingested`);
    } catch (err: any) {
      toast.error(`${source} ingestion failed: ` + err.message);
    } finally {
      setLiveLoading(null);
    }
  };

  const activeCount = sources?.filter(s => s.status === "active").length || 0;
  const errorCount = sources?.filter(s => s.status === "error").length || 0;
  const totalIngested = sources?.reduce((sum, s) => sum + (s.total_ingested || 0), 0) || 0;

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Data Sources</h2>
          <p className="text-sm text-muted-foreground font-mono">Configure, monitor, and ingest from live data feeds</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-2 h-4 w-4" /> Add Source
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Sources", value: sources?.length || 0 },
          { label: "Active", value: activeCount },
          { label: "Errors", value: errorCount },
          { label: "Total Ingested", value: totalIngested.toLocaleString() },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-mono uppercase text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {/* Live Data Ingestion */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Satellite className="h-4 w-4" /> Live Free Data Sources
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* RSS */}
          <div className="rounded-md border border-border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Rss className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold">RSS News Feeds</span>
            </div>
            <p className="text-[10px] text-muted-foreground">{FREE_FEEDS.length} curated defense, maritime, and geopolitical feeds</p>
            <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
              {FREE_FEEDS.map((f) => (
                <span key={f.key} className="text-[8px] font-mono bg-secondary px-1 py-0.5 rounded">{f.label}</span>
              ))}
            </div>
            <Button size="sm" className="w-full" onClick={() => handleRssIngest()} disabled={rssLoading}>
              {rssLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Download className="mr-1 h-3 w-3" />}
              {rssLoading ? "Ingesting..." : "Ingest All Feeds"}
            </Button>
          </div>

          {/* OpenSky */}
          <div className="rounded-md border border-border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Plane className="h-4 w-4 text-accent" />
              <span className="text-xs font-bold">OpenSky Aircraft</span>
            </div>
            <p className="text-[10px] text-muted-foreground">Live aircraft positions worldwide via OpenSky Network (free, no auth)</p>
            <Button size="sm" variant="outline" className="w-full" onClick={() => handleLiveIngest("opensky")} disabled={liveLoading === "opensky"}>
              {liveLoading === "opensky" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plane className="mr-1 h-3 w-3" />}
              Fetch Aircraft Data
            </Button>
          </div>

          {/* AIS */}
          <div className="rounded-md border border-border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Ship className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold">AIS Vessel Tracking</span>
            </div>
            <p className="text-[10px] text-muted-foreground">Live vessel positions from Finland Digitraffic (free, public API)</p>
            <Button size="sm" variant="outline" className="w-full" onClick={() => handleLiveIngest("ais")} disabled={liveLoading === "ais"}>
              {liveLoading === "ais" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Ship className="mr-1 h-3 w-3" />}
              Fetch Vessel Data
            </Button>
          </div>
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="mb-4 text-sm font-mono uppercase tracking-wider text-muted-foreground">New Data Source</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Name</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Port Camera Alpha-1" className="bg-secondary border-border" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Source Type</label>
                <select value={sourceType} onChange={e => setSourceType(e.target.value)} className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground">
                  {SOURCE_TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label} — {t.description}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Endpoint URL</label>
              <Input value={endpointUrl} onChange={e => setEndpointUrl(e.target.value)} placeholder="rtsp://192.168.1.100:554/stream or https://..." className="bg-secondary border-border" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Auth Type</label>
                <select value={authType} onChange={e => setAuthType(e.target.value)} className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground">
                  {AUTH_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Max Retries</label>
                <Input type="number" value={maxRetries} onChange={e => setMaxRetries(e.target.value)} className="bg-secondary border-border" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Retry Delay (s)</label>
                <Input type="number" value={retryDelay} onChange={e => setRetryDelay(e.target.value)} className="bg-secondary border-border" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={createSource.isPending || !name.trim()}>
                {createSource.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Create Source
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

      {/* Source Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !sources?.length ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Radio className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No data sources configured yet</p>
          <p className="text-xs text-muted-foreground mt-1">Use the live data sources above or add a custom source</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sources.map(source => (
            <SourceCard
              key={source.id}
              source={source}
              onToggle={() => handleToggle(source)}
              onDelete={() => handleHardDelete(source.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
