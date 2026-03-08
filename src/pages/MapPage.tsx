import { useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import { useDataProducts } from "@/hooks/useDataProducts";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDistanceToNow } from "date-fns";
import { MapPin } from "lucide-react";
import "leaflet/dist/leaflet.css";

const priorityColors: Record<string, string> = {
  critical: "#e04848",
  high: "#e8a020",
  medium: "#3ea8d8",
  low: "#2db87a",
  routine: "#6b7280",
};

export default function MapPage() {
  const { data: products = [], isLoading } = useDataProducts();

  const geoProducts = useMemo(
    () => products.filter((p) => p.latitude != null && p.longitude != null),
    [products]
  );

  const center = useMemo<[number, number]>(() => {
    if (geoProducts.length === 0) return [34.0, -117.0];
    const avgLat = geoProducts.reduce((s, p) => s + p.latitude!, 0) / geoProducts.length;
    const avgLng = geoProducts.reduce((s, p) => s + p.longitude!, 0) / geoProducts.length;
    return [avgLat, avgLng];
  }, [geoProducts]);

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Map View</h2>
        <p className="text-sm text-muted-foreground font-mono">
          Geospatial overview of {geoProducts.length} data products with coordinates
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        {isLoading ? (
          <div className="flex h-[600px] items-center justify-center bg-card">
            <span className="text-sm font-mono text-muted-foreground">Loading map data…</span>
          </div>
        ) : (
          <MapContainer
            center={center}
            zoom={9}
            className="h-[600px] w-full"
            style={{ background: "hsl(220, 20%, 7%)" }}
          >
            <TileLayer
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />
            {geoProducts.map((p) => (
              <CircleMarker
                key={p.id}
                center={[p.latitude!, p.longitude!]}
                radius={p.priority === "critical" ? 10 : p.priority === "high" ? 8 : 6}
                pathOptions={{
                  color: priorityColors[p.priority || "routine"],
                  fillColor: priorityColors[p.priority || "routine"],
                  fillOpacity: 0.6,
                  weight: 2,
                }}
              >
                <Popup>
                  <div className="space-y-1 font-sans text-xs" style={{ color: "#1a1a2e" }}>
                    <p className="font-bold text-sm">{p.title}</p>
                    <p>{p.source_type} • {p.source_identifier || "unknown"}</p>
                    <p>Score: {p.priority_score != null ? `${(Number(p.priority_score) * 100).toFixed(0)}%` : "—"}</p>
                    <p>{formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}</p>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        )}
      </div>

      {geoProducts.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card py-12 text-muted-foreground">
          <MapPin className="mb-2 h-8 w-8" />
          <p className="text-sm">No geolocated data products</p>
          <p className="text-xs">Ingest products with lat/lng to see them on the map</p>
        </div>
      )}
    </div>
  );
}
