import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Rss, Plane, Ship, Satellite, Download, Loader2, Flame, Globe2, Waves,
} from "lucide-react";

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

const OPENSKY_REGIONS = [
  { key: "caribbean_corridor", label: "Caribbean Corridor" },
  { key: "gulf_of_mexico", label: "Gulf of Mexico" },
  { key: "south_america_north", label: "South America (North)" },
  { key: "puerto_rico_usvi", label: "Puerto Rico & USVI" },
  { key: "us_east_coast", label: "US East Coast" },
  { key: "us_west_coast", label: "US West Coast" },
  { key: "europe_med", label: "Europe & Mediterranean" },
  { key: "middle_east", label: "Middle East" },
  { key: "east_asia", label: "East Asia" },
  { key: "south_china_sea", label: "South China Sea" },
  { key: "horn_of_africa", label: "Horn of Africa" },
  { key: "indo_pacific", label: "Indo-Pacific" },
];

export default function LiveDataPanel() {
  const [rssLoading, setRssLoading] = useState(false);
  const [liveLoading, setLiveLoading] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState("caribbean_corridor");

  const handleRssIngest = async () => {
    setRssLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("rss-ingester", {
        body: { action: "ingest" },
      });
      if (error) throw error;
      toast.success(`RSS ingestion complete: ${data?.total_ingested || 0} new articles`);
    } catch (err: any) {
      toast.error("RSS ingestion failed: " + err.message);
    } finally {
      setRssLoading(false);
    }
  };

  const handleLiveIngest = async (source: string) => {
    setLiveLoading(source);
    try {
      const body: any = { action: "ingest", source };
      if (source === "opensky") body.region = selectedRegion;
      if (source === "nasa_firms") body.region = selectedRegion;

      const { data, error } = await supabase.functions.invoke("live-data-ingester", { body });
      if (error) throw error;
      toast.success(`${source.toUpperCase()}: ${data?.ingested || 0} records ingested`);
    } catch (err: any) {
      toast.error(`${source} ingestion failed: ` + err.message);
    } finally {
      setLiveLoading(null);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Satellite className="h-4 w-4" /> Live Free Data Sources
        </h3>
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-mono uppercase text-muted-foreground">Region:</label>
          <select
            value={selectedRegion}
            onChange={e => setSelectedRegion(e.target.value)}
            className="rounded-md border border-border bg-secondary px-2 py-1 text-xs text-foreground"
          >
            {OPENSKY_REGIONS.map(r => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        {/* RSS */}
        <div className="rounded-md border border-border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Rss className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold">RSS News Feeds</span>
          </div>
          <p className="text-[10px] text-muted-foreground">{FREE_FEEDS.length} curated defense & maritime feeds</p>
          <div className="flex flex-wrap gap-1 max-h-12 overflow-y-auto">
            {FREE_FEEDS.map((f) => (
              <span key={f.key} className="text-[8px] font-mono bg-secondary px-1 py-0.5 rounded">{f.label}</span>
            ))}
          </div>
          <Button size="sm" className="w-full" onClick={handleRssIngest} disabled={rssLoading}>
            {rssLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Download className="mr-1 h-3 w-3" />}
            {rssLoading ? "Ingesting..." : "Ingest All"}
          </Button>
        </div>

        {/* OpenSky */}
        <div className="rounded-md border border-border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Plane className="h-4 w-4 text-accent" />
            <span className="text-xs font-bold">OpenSky Aircraft</span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Aircraft in <span className="font-semibold text-foreground">{OPENSKY_REGIONS.find(r => r.key === selectedRegion)?.label}</span>
          </p>
          <Button size="sm" variant="outline" className="w-full" onClick={() => handleLiveIngest("opensky")} disabled={liveLoading === "opensky"}>
            {liveLoading === "opensky" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plane className="mr-1 h-3 w-3" />}
            Fetch Aircraft
          </Button>
        </div>

        {/* AIS */}
        <div className="rounded-md border border-border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Ship className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold">AIS Vessels</span>
          </div>
          <p className="text-[10px] text-muted-foreground">Live vessel positions (Finland Digitraffic)</p>
          <Button size="sm" variant="outline" className="w-full" onClick={() => handleLiveIngest("ais")} disabled={liveLoading === "ais"}>
            {liveLoading === "ais" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Ship className="mr-1 h-3 w-3" />}
            Fetch Vessels
          </Button>
        </div>

        {/* NASA EONET */}
        <div className="rounded-md border border-border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-accent" />
            <span className="text-xs font-bold">NASA EONET</span>
          </div>
          <p className="text-[10px] text-muted-foreground">Natural events: storms, fires, volcanoes, icebergs</p>
          <Button size="sm" variant="outline" className="w-full" onClick={() => handleLiveIngest("nasa_eonet")} disabled={liveLoading === "nasa_eonet"}>
            {liveLoading === "nasa_eonet" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Globe2 className="mr-1 h-3 w-3" />}
            Fetch Events
          </Button>
        </div>

        {/* NASA FIRMS */}
        <div className="rounded-md border border-border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-destructive" />
            <span className="text-xs font-bold">NASA FIRMS</span>
          </div>
          <p className="text-[10px] text-muted-foreground">Active fires via MODIS satellite in selected region</p>
          <Button size="sm" variant="outline" className="w-full" onClick={() => handleLiveIngest("nasa_firms")} disabled={liveLoading === "nasa_firms"}>
            {liveLoading === "nasa_firms" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Flame className="mr-1 h-3 w-3" />}
            Fetch Fires
          </Button>
        </div>

        {/* NOAA Bayou Sensors */}
        <div className="rounded-md border border-primary/30 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Waves className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold">NOAA Bayou Sensors</span>
          </div>
          <p className="text-[10px] text-muted-foreground">15 Gulf Coast & bayou water level stations — storm surge alerts</p>
          <Button size="sm" variant="outline" className="w-full" onClick={() => handleLiveIngest("noaa_water")} disabled={liveLoading === "noaa_water"}>
            {liveLoading === "noaa_water" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Waves className="mr-1 h-3 w-3" />}
            Fetch Water Levels
          </Button>
        </div>
      </div>
    </div>
  );
}
