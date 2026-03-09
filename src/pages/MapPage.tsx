import { useMemo, useEffect, useRef } from "react";
import L from "leaflet";
import { useAllGeoProducts } from "@/hooks/useDataProducts";
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
  const { data: products = [], isLoading } = useAllGeoProducts();
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

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

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { center, zoom: 9 });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 18,
    }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // Force resize after render
    setTimeout(() => map.invalidateSize(), 100);
    return () => { map.remove(); mapRef.current = null; };
  }, [isLoading]);

  // Update markers
  useEffect(() => {
    if (!markersRef.current || !mapRef.current) return;
    markersRef.current.clearLayers();

    geoProducts.forEach((p) => {
      const color = priorityColors[p.priority || "routine"];
      const content = p.content as Record<string, unknown> | null;
      const isBayou = content && (content as any).sensor_type === "bayou_water_level";
      const radius = p.priority === "critical" ? 12 : p.priority === "high" ? 10 : isBayou ? 9 : 6;

      const marker = L.circleMarker([p.latitude!, p.longitude!], {
        radius,
        color: isBayou ? "#00bfff" : color,
        fillColor: isBayou ? (p.priority === "critical" ? "#e04848" : p.priority === "high" ? "#e8a020" : "#00bfff") : color,
        fillOpacity: isBayou ? 0.8 : 0.6,
        weight: isBayou ? 3 : 2,
        dashArray: isBayou ? "4 2" : undefined,
      });

      const waterInfo = isBayou ? `
        <br/><strong>Water Level:</strong> ${(content as any).water_level_ft?.toFixed(2)}ft (MHHW)
        <br/><strong>Trend:</strong> ${(content as any).trend_direction} (${(content as any).trend_change_ft > 0 ? "+" : ""}${(content as any).trend_change_ft}ft)
        ${(content as any).high_water_alert ? '<br/><span style="color:#e8a020;font-weight:bold">⚠ HIGH WATER ALERT</span>' : ""}
        ${(content as any).critical_alert ? '<br/><span style="color:#e04848;font-weight:bold">🔴 CRITICAL STORM SURGE</span>' : ""}
      ` : "";

      marker.bindPopup(`
        <div style="font-family:Inter,sans-serif;font-size:12px;color:#1a1a2e">
          <strong>${p.title}</strong><br/>
          ${p.source_type} • ${p.source_identifier || "unknown"}<br/>
          Score: ${p.priority_score != null ? `${(Number(p.priority_score) * 100).toFixed(0)}%` : "—"}
          ${waterInfo}
          ${p.priority_reasoning ? `<br/><em style="font-size:10px">${p.priority_reasoning}</em>` : ""}
        </div>
      `);
      markersRef.current!.addLayer(marker);
    });

    if (geoProducts.length > 0) {
      const bounds = L.latLngBounds(geoProducts.map((p) => [p.latitude!, p.longitude!]));
      mapRef.current.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [geoProducts]);

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Map View</h2>
        <p className="text-sm text-muted-foreground font-mono">
          Geospatial overview of {geoProducts.length} data products with coordinates
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border relative">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-card">
            <span className="text-sm font-mono text-muted-foreground">Loading map data…</span>
          </div>
        )}
        <div ref={containerRef} className="h-[600px] w-full" style={{ background: "hsl(220, 20%, 7%)" }} />
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
