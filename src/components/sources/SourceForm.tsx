import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Loader2 } from "lucide-react";

const SOURCE_TYPE_OPTIONS = [
  { value: "rtsp_camera", label: "RTSP Camera", description: "IP cameras and video surveillance streams" },
  { value: "audio_feed", label: "Audio Feed", description: "Radio comms, distress calls, VHF/UHF" },
  { value: "document", label: "Document", description: "PDF reports, logs, manifests" },
  { value: "sensor_telemetry", label: "Sensor Telemetry", description: "Buoy data, AIS, radar, sonar" },
  { value: "rss_feed", label: "RSS Feed", description: "Maritime alerts, weather, news" },
  { value: "ais_tracker", label: "AIS Vessel Tracker", description: "Live AIS vessel positions" },
  { value: "opensky", label: "OpenSky Aircraft", description: "Live aircraft tracking via OpenSky" },
];

const AUTH_OPTIONS = ["none", "api_key", "basic", "bearer", "certificate"] as const;

export default function SourceForm({ createSource, onClose }: { createSource: any; onClose: () => void }) {
  const [name, setName] = useState("");
  const [sourceType, setSourceType] = useState("sensor_telemetry");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [authType, setAuthType] = useState("none");
  const [maxRetries, setMaxRetries] = useState("5");
  const [retryDelay, setRetryDelay] = useState("30");

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
        onClose();
        setName(""); setEndpointUrl("");
      },
      onError: (err: any) => {},
    });
  };

  return (
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
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
