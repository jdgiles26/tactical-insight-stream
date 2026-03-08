import { useState } from "react";
import { useDataSources, useCreateDataSource, useUpdateDataSource, useDeleteDataSource, DataSource } from "@/hooks/useDataSources";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Radio, Camera, FileText, Waves, Rss, Plus, Trash2, Power, PowerOff,
  RefreshCw, AlertTriangle, CheckCircle2, Loader2, Activity, Clock, Hash,
  Satellite, Ship, Plane, Download, Globe2, Flame,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import SourceCard from "@/components/sources/SourceCard";
import LiveDataPanel from "@/components/sources/LiveDataPanel";
import SourceForm from "@/components/sources/SourceForm";

export default function SourcesPage() {
  const { data: sources, isLoading } = useDataSources();
  const createSource = useCreateDataSource();
  const updateSource = useUpdateDataSource();
  const deleteSource = useDeleteDataSource();

  const [showForm, setShowForm] = useState(false);

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
      <LiveDataPanel />

      {/* Create Form */}
      {showForm && (
        <SourceForm
          createSource={createSource}
          onClose={() => setShowForm(false)}
        />
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
