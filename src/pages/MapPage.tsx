import { useMemo, useEffect, useRef, useState } from "react";
import L from "leaflet";
import { useAllGeoProducts } from "@/hooks/useDataProducts";
import { useGeoCorrelation } from "@/hooks/useGeoCorrelation";
import { getClusterThreatColor, getClusterDescription } from "@/lib/geoCorrelation";
import type { GeoCluster } from "@/lib/geoCorrelation";
import GeoClusterPanel from "@/components/GeoClusterPanel";
import { MapPin, Layers, Radar, Link2, Zap, BarChart3 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StormThreatPanel from "@/components/StormThreatPanel";
import StormHistoryTimeline from "@/components/StormHistoryTimeline";
import "leaflet/dist/leaflet.css";

const priorityColors: Record<string, string> = {
  critical: "#e04848",
  high: "#e8a020",
  medium: "#3ea8d8",
  low: "#2db87a",
  routine: "#6b7280",
};

/** CSS for pulsing ring on cross-source markers, injected once */
const PULSE_CSS_ID = "geo-pulse-css";
function ensurePulseCss() {
  if (document.getElementById(PULSE_CSS_ID)) return;
  const style = document.createElement("style");
  style.id = PULSE_CSS_ID;
  style.textContent = `
    @keyframes geo-pulse-ring {
      0%   { transform: scale(1);   opacity: 0.7; }
      70%  { transform: scale(2.2); opacity: 0; }
      100% { transform: scale(2.2); opacity: 0; }
    }
    .geo-pulse-marker {
      position: relative;
    }
    .geo-pulse-marker::after {
      content: '';
      position: absolute;
      inset: -4px;
      border: 2px solid #f59e0b;
      border-radius: 50%;
      animation: geo-pulse-ring 2s ease-out infinite;
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);
}

export default function MapPage() {
  const { data: products = [], isLoading } = useAllGeoProducts();
  const {
    clusters,
    crossSourceClusters,
    correlatedPairs,
    stats,
    getClusterForProduct,
  } = useGeoCorrelation();

  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const clusterLayerRef = useRef<L.LayerGroup | null>(null);
  const connectionLayerRef = useRef<L.LayerGroup | null>(null);
  const pulseLayerRef = useRef<L.LayerGroup | null>(null);

  // Toggle state
  const [showClusters, setShowClusters] = useState(true);
  const [showConnections, setShowConnections] = useState(true);
  const [crossSourceOnly, setCrossSourceOnly] = useState(false);

  // Panel state
  const [selectedCluster, setSelectedCluster] = useState<GeoCluster | null>(null);

  const geoProducts = useMemo(
    () => products.filter((p) => p.latitude != null && p.longitude != null),
    [products],
  );

  const center = useMemo<[number, number]>(() => {
    if (geoProducts.length === 0) return [34.0, -117.0];
    const avgLat = geoProducts.reduce((s, p) => s + p.latitude!, 0) / geoProducts.length;
    const avgLng = geoProducts.reduce((s, p) => s + p.longitude!, 0) / geoProducts.length;
    return [avgLat, avgLng];
  }, [geoProducts]);

  // Build set of product-ids that are in cross-source clusters
  const crossSourceProductIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of crossSourceClusters) {
      for (const m of c.members) ids.add(m.productId);
    }
    return ids;
  }, [crossSourceClusters]);

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    ensurePulseCss();
    const map = L.map(containerRef.current, { center, zoom: 9 });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 18,
    }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    clusterLayerRef.current = L.layerGroup().addTo(map);
    connectionLayerRef.current = L.layerGroup().addTo(map);
    pulseLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 100);
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [isLoading]);

  // Update markers (existing logic preserved)
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
        fillColor: isBayou
          ? p.priority === "critical"
            ? "#e04848"
            : p.priority === "high"
              ? "#e8a020"
              : "#00bfff"
          : color,
        fillOpacity: isBayou ? 0.8 : 0.6,
        weight: isBayou ? 3 : 2,
        dashArray: isBayou ? "4 2" : undefined,
      });

      const waterInfo = isBayou
        ? `
        <br/><strong>Water Level:</strong> ${(content as any).water_level_ft?.toFixed(2)}ft (MHHW)
        <br/><strong>Trend:</strong> ${(content as any).trend_direction} (${(content as any).trend_change_ft > 0 ? "+" : ""}${(content as any).trend_change_ft}ft)
        ${(content as any).high_water_alert ? '<br/><span style="color:#e8a020;font-weight:bold">⚠ HIGH WATER ALERT</span>' : ""}
        ${(content as any).critical_alert ? '<br/><span style="color:#e04848;font-weight:bold">🔴 CRITICAL STORM SURGE</span>' : ""}
      `
        : "";

      // Check if product is in a geo cluster
      const cluster = getClusterForProduct(p.id);
      const clusterInfo = cluster
        ? `<br/><span style="color:${cluster.crossSourceCorrelated ? '#f59e0b' : getClusterThreatColor(cluster.threatIndicator)};font-weight:bold">${cluster.crossSourceCorrelated ? '⚡ MULTI-SOURCE' : '📍 GEO-CLUSTER'}: ${cluster.members.length} products within ${cluster.radiusKm.toFixed(1)}km</span>`
        : "";

      marker.bindPopup(`
        <div style="font-family:Inter,sans-serif;font-size:12px;color:#1a1a2e">
          <strong>${p.title}</strong><br/>
          ${p.source_type} • ${p.source_identifier || "unknown"}<br/>
          Score: ${p.priority_score != null ? `${(Number(p.priority_score) * 100).toFixed(0)}%` : "—"}
          ${waterInfo}
          ${clusterInfo}
          ${p.priority_reasoning ? `<br/><em style="font-size:10px">${p.priority_reasoning}</em>` : ""}
        </div>
      `);
      markersRef.current!.addLayer(marker);
    });

    if (geoProducts.length > 0) {
      const bounds = L.latLngBounds(geoProducts.map((p) => [p.latitude!, p.longitude!]));
      mapRef.current.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [geoProducts, getClusterForProduct]);

  // Draw cluster circles
  useEffect(() => {
    if (!clusterLayerRef.current) return;
    clusterLayerRef.current.clearLayers();
    if (!showClusters) return;

    const visibleClusters = crossSourceOnly
      ? clusters.filter((c) => c.crossSourceCorrelated)
      : clusters;

    visibleClusters.forEach((cluster) => {
      const color = getClusterThreatColor(cluster.threatIndicator);
      const radiusM = Math.max(cluster.radiusKm * 1000, 200);

      const circle = L.circle([cluster.centroidLat, cluster.centroidLon], {
        radius: radiusM,
        color: cluster.crossSourceCorrelated ? "#f59e0b" : color,
        fillColor: cluster.crossSourceCorrelated ? "#f59e0b" : color,
        fillOpacity: 0.08,
        dashArray: "8, 4",
        weight: 2,
      });

      const desc = getClusterDescription(cluster);
      const btnId = `cluster-btn-${cluster.id}`;

      circle.bindPopup(`
        <div style="font-family:Inter,sans-serif;font-size:12px;color:#1a1a2e;max-width:260px">
          <strong style="color:${cluster.crossSourceCorrelated ? '#f59e0b' : color}">
            ${cluster.crossSourceCorrelated ? '⚡ MULTI-SOURCE CLUSTER' : 'GEO-CLUSTER'}
          </strong>
          <br/>${desc}
          <br/><br/>
          <button id="${btnId}" style="background:${color};color:#fff;border:none;border-radius:4px;padding:4px 12px;font-size:11px;cursor:pointer;font-family:monospace">
            View Details
          </button>
        </div>
      `);

      circle.on("popupopen", () => {
        setTimeout(() => {
          const btn = document.getElementById(btnId);
          if (btn) {
            btn.onclick = () => {
              setSelectedCluster(cluster);
              circle.closePopup();
            };
          }
        }, 50);
      });

      clusterLayerRef.current!.addLayer(circle);
    });
  }, [clusters, showClusters, crossSourceOnly]);

  // Draw connection lines
  useEffect(() => {
    if (!connectionLayerRef.current) return;
    connectionLayerRef.current.clearLayers();
    if (!showConnections) return;

    const visiblePairs = crossSourceOnly
      ? correlatedPairs.filter((p) => p.crossSource)
      : correlatedPairs;

    visiblePairs.forEach((pair) => {
      const line = L.polyline(
        [
          [pair.productA.latitude, pair.productA.longitude],
          [pair.productB.latitude, pair.productB.longitude],
        ],
        {
          color: pair.crossSource ? "#f59e0b" : "#6b7280",
          weight: pair.crossSource ? 2 : 1,
          dashArray: pair.crossSource ? "6, 3" : undefined,
          opacity: 0.7,
        },
      );
      connectionLayerRef.current!.addLayer(line);
    });
  }, [correlatedPairs, showConnections, crossSourceOnly]);

  // Pulse rings on cross-source markers
  useEffect(() => {
    if (!pulseLayerRef.current) return;
    pulseLayerRef.current.clearLayers();
    if (!showClusters) return;

    geoProducts.forEach((p) => {
      if (!crossSourceProductIds.has(p.id)) return;
      // Add a larger fading ring via circleMarker
      const ring = L.circleMarker([p.latitude!, p.longitude!], {
        radius: 14,
        color: "#f59e0b",
        fillColor: "transparent",
        fillOpacity: 0,
        weight: 1.5,
        opacity: 0.5,
        dashArray: "3, 3",
        className: "geo-pulse-marker",
      });
      pulseLayerRef.current!.addLayer(ring);
    });
  }, [geoProducts, crossSourceProductIds, showClusters]);

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Map View</h2>
        <p className="text-sm text-muted-foreground font-mono">
          Geospatial overview of {geoProducts.length} data products with coordinates
        </p>
      </div>

      {/* Storm Threat Assessment */}
      <StormThreatPanel />

      {/* Storm History Timeline */}
      <StormHistoryTimeline />

      {/* Map Tabs */}
      <Tabs defaultValue="ops" className="space-y-3">
        <TabsList className="bg-secondary">
          <TabsTrigger value="ops" className="gap-1.5">
            <Layers className="h-3.5 w-3.5" /> Ops Map
          </TabsTrigger>
          <TabsTrigger value="gpsjam" className="gap-1.5">
            <MapPin className="h-3.5 w-3.5" /> GPS Jamming
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ops">
          {/* ── Toggle controls ── */}
          <div className="flex flex-wrap items-center gap-4 mb-3">
            <label className="flex items-center gap-2 text-xs font-mono text-muted-foreground cursor-pointer">
              <Switch checked={showClusters} onCheckedChange={setShowClusters} />
              <Radar className="h-3.5 w-3.5" />
              Clusters
            </label>
            <label className="flex items-center gap-2 text-xs font-mono text-muted-foreground cursor-pointer">
              <Switch checked={showConnections} onCheckedChange={setShowConnections} />
              <Link2 className="h-3.5 w-3.5" />
              Connections
            </label>
            <label className="flex items-center gap-2 text-xs font-mono text-muted-foreground cursor-pointer">
              <Switch checked={crossSourceOnly} onCheckedChange={setCrossSourceOnly} />
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              Cross-Source Only
            </label>
          </div>

          <div className="overflow-hidden rounded-lg border border-border relative">
            {isLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-card">
                <span className="text-sm font-mono text-muted-foreground">Loading map data…</span>
              </div>
            )}
            <div ref={containerRef} className="h-[600px] w-full" style={{ background: "hsl(220, 20%, 7%)" }} />

            {/* ── Stats overlay ── */}
            {stats.totalGeoProducts > 0 && (
              <div className="absolute top-3 right-3 z-[1000] rounded-lg border border-border bg-card/90 backdrop-blur-sm px-3 py-2.5 space-y-1 pointer-events-none">
                <div className="flex items-center gap-1.5 mb-1">
                  <BarChart3 className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    Geo Correlation
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] font-mono">
                  <span className="text-muted-foreground">Products</span>
                  <span className="text-right font-bold">{stats.totalGeoProducts}</span>
                  <span className="text-muted-foreground">Clusters</span>
                  <span className="text-right font-bold">{clusters.length}</span>
                  <span className="text-amber-400">Cross-Src</span>
                  <span className="text-right font-bold text-amber-400">
                    {stats.crossSourceClusters}
                  </span>
                  <span className="text-muted-foreground">Avg Radius</span>
                  <span className="text-right font-bold">
                    {stats.avgClusterRadius.toFixed(1)} km
                  </span>
                </div>
              </div>
            )}
          </div>

          {geoProducts.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card py-12 text-muted-foreground mt-3">
              <MapPin className="mb-2 h-8 w-8" />
              <p className="text-sm">No geolocated data products</p>
              <p className="text-xs">Ingest products with lat/lng to see them on the map</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="gpsjam">
          <div className="overflow-hidden rounded-lg border border-border">
            <iframe
              src="https://gpsjam.org/?lat=29.0&lon=-89.5&z=6"
              className="h-[600px] w-full border-0"
              title="GPS Jamming Map"
              allow="geolocation"
              loading="lazy"
            />
          </div>
          <p className="text-[10px] text-muted-foreground font-mono mt-2">
            Source: gpsjam.org — Global GPS/GNSS interference monitoring. Data refreshes automatically.
          </p>
        </TabsContent>
      </Tabs>

      {/* ── Geo Cluster Detail Panel ── */}
      {selectedCluster && (
        <GeoClusterPanel
          cluster={selectedCluster}
          onClose={() => setSelectedCluster(null)}
        />
      )}
    </div>
  );
}
