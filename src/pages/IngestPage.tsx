import { useState } from "react";
import { useIngestData } from "@/hooks/useDataProducts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Database, Send, Loader2 } from "lucide-react";
import ActivityFeed from "@/components/ActivityFeed";

const SOURCE_TYPES = ["sensor", "cot_message", "image", "video", "document", "sigint", "humint", "geoint"] as const;
const PRIORITIES = ["critical", "high", "medium", "low", "routine"] as const;

export default function IngestPage() {
  const [title, setTitle] = useState("");
  const [sourceType, setSourceType] = useState<typeof SOURCE_TYPES[number]>("sensor");
  const [sourceId, setSourceId] = useState("");
  const [priority, setPriority] = useState<typeof PRIORITIES[number]>("routine");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  const ingest = useIngestData();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const priorityScores: Record<string, number> = { critical: 0.95, high: 0.8, medium: 0.6, low: 0.3, routine: 0.1 };

    ingest.mutate({
      title: title.trim(),
      source_type: sourceType,
      source_identifier: sourceId || null,
      priority,
      priority_score: priorityScores[priority],
      confidence_score: Math.random() * 0.3 + 0.7,
      status: "ingested",
      latitude: lat ? parseFloat(lat) : null,
      longitude: lng ? parseFloat(lng) : null,
    }, {
      onSuccess: () => {
        toast.success("Data product ingested successfully");
        setTitle("");
        setSourceId("");
        setLat("");
        setLng("");
      },
      onError: (err) => toast.error("Ingestion failed: " + err.message),
    });
  };

  const handleSimulate = () => {
    const sampleTitles = [
      "UAV Recon Sweep Alpha-7",
      "SIGINT Intercept Bravo Sector",
      "Forward Observer Report Grid 4521",
      "Thermal Imagery Checkpoint Delta",
      "CoT Blue Force Tracker Update",
      "Satellite Pass Imagery North Corridor",
      "HUMINT Source Report: Market District",
      "Acoustic Sensor Alert Zone 3",
    ];
    const randomTitle = sampleTitles[Math.floor(Math.random() * sampleTitles.length)];
    const randomSource = SOURCE_TYPES[Math.floor(Math.random() * SOURCE_TYPES.length)];
    const randomPriority = PRIORITIES[Math.floor(Math.random() * PRIORITIES.length)];
    const priorityScores: Record<string, number> = { critical: 0.95, high: 0.8, medium: 0.6, low: 0.3, routine: 0.1 };

    ingest.mutate({
      title: randomTitle,
      source_type: randomSource,
      source_identifier: `SRC-${Math.floor(Math.random() * 9000) + 1000}`,
      priority: randomPriority,
      priority_score: priorityScores[randomPriority] + (Math.random() * 0.1 - 0.05),
      confidence_score: Math.random() * 0.3 + 0.7,
      status: "ingested",
      latitude: 33 + Math.random() * 2,
      longitude: -117 + Math.random() * 2,
    }, {
      onSuccess: () => toast.success(`Simulated: ${randomTitle}`),
    });
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Data Ingestion</h2>
        <p className="text-sm text-muted-foreground font-mono">Ingest new sensor data and tactical products</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Manual Form */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-mono uppercase tracking-wider text-muted-foreground">
            <Database className="h-4 w-4" /> Manual Ingestion
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Title</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Data product title..." className="bg-secondary border-border" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Source Type</label>
                <select value={sourceType} onChange={(e) => setSourceType(e.target.value as any)} className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground">
                  {SOURCE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Priority</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value as any)} className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground">
                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Source Identifier</label>
              <Input value={sourceId} onChange={(e) => setSourceId(e.target.value)} placeholder="e.g., TACTICAL_SENSOR_01" className="bg-secondary border-border" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Latitude</label>
                <Input value={lat} onChange={(e) => setLat(e.target.value)} type="number" step="any" placeholder="33.75" className="bg-secondary border-border" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Longitude</label>
                <Input value={lng} onChange={(e) => setLng(e.target.value)} type="number" step="any" placeholder="-117.85" className="bg-secondary border-border" />
              </div>
            </div>
            <Button type="submit" disabled={ingest.isPending || !title.trim()} className="w-full">
              {ingest.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Ingest Data Product
            </Button>
          </form>
        </div>

        {/* Simulation */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-mono uppercase tracking-wider text-muted-foreground">
            <Send className="h-4 w-4" /> Simulation
          </h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Generate simulated tactical data products for testing the MDG pipeline.
          </p>
          <div className="space-y-3">
            <Button onClick={handleSimulate} variant="outline" className="w-full" disabled={ingest.isPending}>
              Generate Single Data Product
            </Button>
            <Button 
              onClick={() => { for (let i = 0; i < 5; i++) setTimeout(handleSimulate, i * 300); }}
              variant="outline" 
              className="w-full"
              disabled={ingest.isPending}
            >
              Burst: Generate 5 Products
            </Button>
            <Button 
              onClick={() => { for (let i = 0; i < 20; i++) setTimeout(handleSimulate, i * 150); }}
              variant="outline" 
              className="w-full"
              disabled={ingest.isPending}
            >
              Stress Test: Generate 20 Products
            </Button>
          </div>
          <div className="mt-6 rounded-md bg-secondary/50 p-4">
            <p className="text-xs font-mono text-muted-foreground">
              Simulated products include randomized titles, source types, priority levels, and coordinates in the Southern California area.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
