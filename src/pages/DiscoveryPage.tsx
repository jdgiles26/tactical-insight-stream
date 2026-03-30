import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useSearchDataProducts } from "@/hooks/useDataProducts";
import { useGeoCorrelation } from "@/hooks/useGeoCorrelation";
import { DataProductTable } from "@/components/DataProductTable";
import CorrelationPanel from "@/components/CorrelationPanel";
import GeoCorrelationBadge from "@/components/GeoCorrelationBadge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Search, MapPin, Zap } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function DiscoveryPage() {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const { data = [], isLoading } = useSearchDataProducts(query);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedItem = data.find((d) => d.id === selectedId);

  // Geo-correlation
  const { getClusterForProduct, getCorrelatedProducts } = useGeoCorrelation();
  const [geoFilterOn, setGeoFilterOn] = useState(false);

  useEffect(() => {
    const q = searchParams.get("q");
    if (q) setQuery(q);
  }, [searchParams]);

  // Filter data to only geo-correlated products if toggle is on
  const filteredData = useMemo(() => {
    if (!geoFilterOn) return data;
    return data.filter((d) => {
      const cluster = getClusterForProduct(d.id);
      return cluster && cluster.crossSourceCorrelated;
    });
  }, [data, geoFilterOn, getClusterForProduct]);

  // Related-by-location list for selected product
  const geoSiblings = useMemo(() => {
    if (!selectedId) return [];
    return getCorrelatedProducts(selectedId);
  }, [selectedId, getCorrelatedProducts]);

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Data Discovery</h2>
        <p className="text-sm text-muted-foreground font-mono">
          Search and discover tactical data products • click a row to view correlations
        </p>
      </div>

      {/* Search + Geo filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search data products by title… (e.g., 'recon', 'thermal', 'intercept')"
            className="bg-card border-border pl-10 text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-xs font-mono text-muted-foreground cursor-pointer shrink-0 rounded-md border border-border bg-card px-3 py-2">
          <Switch checked={geoFilterOn} onCheckedChange={setGeoFilterOn} />
          <Zap className="h-3.5 w-3.5 text-amber-400" />
          Geo-Correlated
        </label>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-5 py-3 flex items-center justify-between">
          <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            {filteredData.length} results {query && `for "${query}"`}
            {geoFilterOn && " (multi-source geo-correlated only)"}
          </span>
        </div>
        <DataProductTable
          data={filteredData}
          isLoading={isLoading}
          onRowClick={(id) => setSelectedId(id)}
        />
      </div>

      {/* Correlation panel with geo-location section */}
      {selectedId && (
        <>
          <CorrelationPanel
            productId={selectedId}
            productTitle={selectedItem?.title}
            onClose={() => setSelectedId(null)}
          />

          {/* Related by Location overlay — rendered above the CorrelationPanel */}
          {geoSiblings.length > 0 && (
            <div className="fixed bottom-0 right-0 z-[51] w-[520px] border-l border-t border-border bg-card/95 backdrop-blur-sm shadow-xl max-h-[260px] overflow-y-auto">
              <div className="flex items-center gap-2 border-b border-border px-4 py-2">
                <MapPin className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold">
                  Related by Location ({geoSiblings.length})
                </span>
              </div>
              <div className="p-3 space-y-1.5">
                {geoSiblings.map((m) => (
                  <div
                    key={m.productId}
                    className="flex items-center gap-2 rounded border border-border/50 px-2.5 py-1.5 text-[10px] hover:bg-secondary/40 transition-colors cursor-pointer"
                    onClick={() => setSelectedId(m.productId)}
                  >
                    <span className="truncate flex-1 font-medium">
                      {m.title}
                    </span>
                    <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground">
                      {m.sourceType}
                    </span>
                    <span className="shrink-0 font-mono text-muted-foreground">
                      {m.distanceFromCentroidKm.toFixed(1)} km
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
