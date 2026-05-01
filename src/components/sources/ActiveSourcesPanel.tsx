import { useState } from "react";
import {
  useDataSources,
  useUpdateDataSource,
  useDeleteDataSource,
  DataSource,
} from "@/hooks/useDataSources";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Radio,
  Loader2,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import SourceCard from "@/components/sources/SourceCard";
import LiveDataPanel from "@/components/sources/LiveDataPanel";

export default function ActiveSourcesPanel() {
  const { data: sources, isLoading } = useDataSources();
  const updateSource = useUpdateDataSource();
  const deleteSource = useDeleteDataSource();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const handleToggle = (source: DataSource) => {
    const newStatus = source.status === "active" ? "inactive" : "active";
    updateSource.mutate(
      { id: source.id, status: newStatus } as any,
      { onSuccess: () => toast.success(`Source ${newStatus}`) }
    );
  };

  const handleHardDelete = (id: string) => {
    if (!confirm("Permanently delete this source and all associated data?")) return;
    deleteSource.mutate(id, {
      onSuccess: () => toast.success("Source permanently deleted"),
      onError: (err) => toast.error("Delete failed: " + err.message),
    });
  };

  const filteredSources = (sources || []).filter((s) => {
    const matchesSearch =
      !searchQuery.trim() ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.source_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.endpoint_url || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === "all" || s.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const activeCount = sources?.filter((s) => s.status === "active").length || 0;
  const errorCount = sources?.filter((s) => s.status === "error").length || 0;
  const inactiveCount = sources?.filter((s) => s.status === "inactive").length || 0;
  const totalIngested = sources?.reduce((sum, s) => sum + (s.total_ingested || 0), 0) || 0;

  return (
    <ScrollArea className="h-[calc(100vh-220px)]">
      <div className="space-y-6 pr-4">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className={`rounded-lg border p-3 cursor-pointer transition-colors ${
            filterStatus === "all" ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-secondary/50"
          }`} onClick={() => setFilterStatus("all")}>
            <p className="text-[10px] font-mono uppercase text-muted-foreground">Total Sources</p>
            <p className="text-xl font-bold text-foreground">{sources?.length || 0}</p>
          </div>
          <div className={`rounded-lg border p-3 cursor-pointer transition-colors ${
            filterStatus === "active" ? "border-emerald-500 bg-emerald-500/10" : "border-border bg-card hover:bg-secondary/50"
          }`} onClick={() => setFilterStatus("active")}>
            <p className="text-[10px] font-mono uppercase text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />Active
            </p>
            <p className="text-xl font-bold text-emerald-500">{activeCount}</p>
          </div>
          <div className={`rounded-lg border p-3 cursor-pointer transition-colors ${
            filterStatus === "inactive" ? "border-muted-foreground bg-muted/30" : "border-border bg-card hover:bg-secondary/50"
          }`} onClick={() => setFilterStatus("inactive")}>
            <p className="text-[10px] font-mono uppercase text-muted-foreground">Inactive</p>
            <p className="text-xl font-bold text-muted-foreground">{inactiveCount}</p>
          </div>
          <div className={`rounded-lg border p-3 cursor-pointer transition-colors ${
            filterStatus === "error" ? "border-destructive bg-destructive/10" : "border-border bg-card hover:bg-secondary/50"
          }`} onClick={() => setFilterStatus("error")}>
            <p className="text-[10px] font-mono uppercase text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-2.5 w-2.5 text-destructive" />Errors
            </p>
            <p className="text-xl font-bold text-destructive">{errorCount}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-[10px] font-mono uppercase text-muted-foreground flex items-center gap-1">
              <Activity className="h-2.5 w-2.5" />Total Ingested
            </p>
            <p className="text-xl font-bold text-foreground">{totalIngested.toLocaleString()}</p>
          </div>
        </div>

        {/* Live Data Panel */}
        <LiveDataPanel />

        {/* Search */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sources by name, type, or URL..."
              className="pl-9 bg-secondary border-border" />
          </div>
          {filterStatus !== "all" && (
            <Button variant="ghost" size="sm" onClick={() => setFilterStatus("all")} className="text-xs">
              Clear Filter
            </Button>
          )}
          <Badge variant="outline" className="font-mono text-xs">{filteredSources.length} shown</Badge>
        </div>

        {/* Source Cards */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredSources.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-12 text-center">
            <Radio className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {sources?.length === 0 ? "No data sources configured yet" : "No sources match your filter"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {sources?.length === 0
                ? 'Use the "API Connections" tab to add a new source'
                : "Try changing the search or status filter"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredSources.map((source) => (
              <SourceCard key={source.id} source={source}
                onToggle={() => handleToggle(source)}
                onDelete={() => handleHardDelete(source.id)} />
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
