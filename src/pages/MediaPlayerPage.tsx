import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Grid3X3, Play, Pause, Maximize2, Volume2, VolumeX,
  Plus, X, Tv,
} from "lucide-react";
import saltwaterBadge from "@/assets/saltwater-recon-badge.png";

// --- Types ---
interface StreamSource {
  id: string;
  label: string;
  src: string;
  type: "hls" | "dash" | "mp4" | "youtube" | "rtsp_proxy" | "iframe";
}

// --- Constants ---
const LAYOUT_OPTIONS = [
  { value: "1x1", label: "1×1", cols: 1, rows: 1, count: 1 },
  { value: "2x2", label: "2×2", cols: 2, rows: 2, count: 4 },
  { value: "3x3", label: "3×3", cols: 3, rows: 3, count: 9 },
  { value: "2x5", label: "2×5", cols: 5, rows: 2, count: 10 },
  { value: "5x5", label: "5×5", cols: 5, rows: 5, count: 25 },
] as const;

const SAMPLE_SOURCES: StreamSource[] = [
  // PTZtv verified live port cameras (YouTube live streams)
  { id: "key-west", label: "Key West Harbor, FL", src: "https://www.youtube.com/watch?v=tfjpBt15bbc", type: "youtube" },
  { id: "port-miami", label: "Port Miami, FL", src: "https://www.youtube.com/watch?v=DxZziUUr6CY", type: "youtube" },
  { id: "port-everglades", label: "Port Everglades, FL", src: "https://www.youtube.com/watch?v=jVr7_V4Tohw", type: "youtube" },
  { id: "port-miami-classic", label: "Port Miami Classic View", src: "https://www.youtube.com/watch?v=xdNX-cJKL3E", type: "youtube" },
  // Saltwater Recon embed
  { id: "saltwater-recon", label: "Saltwater Recon", src: "https://saltwater-recon.nyc3.cdn.digitaloceanspaces.com/square/EMB_LGDX00000B33.png", type: "iframe" },
  // Working demo streams
  { id: "demo-hls-1", label: "Demo HLS Stream", src: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", type: "hls" },
  { id: "demo-mp4", label: "Sample MP4", src: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4", type: "mp4" },
];

// --- Video Cell Component ---
function VideoCell({
  source,
  index,
  onRemove,
}: {
  source: StreamSource | null;
  index: number;
  onRemove: () => void;
}) {
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(true);
  const videoRef = useCallback((node: HTMLVideoElement | null) => {
    if (node && source) {
      node.muted = true;
      node.play().catch(() => {});
    }
  }, [source]);

  if (!source) {
    return (
      <div className="relative flex items-center justify-center border border-dashed border-border rounded-md bg-secondary/30 aspect-video overflow-hidden">
        <div className="text-center text-muted-foreground">
          <Tv className="h-6 w-6 mx-auto mb-1 opacity-30" />
          <p className="text-[9px] font-mono">Slot {index + 1}</p>
        </div>
      </div>
    );
  }

  const togglePlay = () => {
    const video = document.getElementById(`video-${source.id}`) as HTMLVideoElement;
    if (video) {
      if (video.paused) { video.play(); setPlaying(true); }
      else { video.pause(); setPlaying(false); }
    }
  };

  const toggleMute = () => {
    const video = document.getElementById(`video-${source.id}`) as HTMLVideoElement;
    if (video) { video.muted = !video.muted; setMuted(!muted); }
  };

  const toggleFullscreen = () => {
    const video = document.getElementById(`video-${source.id}`) as HTMLVideoElement;
    if (video) video.requestFullscreen?.();
  };

  const isYoutube = source.type === "youtube";
  const isIframe = source.type === "iframe";
  const isSrcImage = source.src.match(/\.(png|jpg|jpeg|gif|webp)$/i);

  return (
    <div className="relative group border border-border rounded-md overflow-hidden bg-background aspect-video">
      {isSrcImage ? (
        <div className="w-full h-full flex items-center justify-center bg-black">
          <img src={source.src} alt={source.label} className="max-h-full max-w-full object-contain" />
        </div>
      ) : isYoutube ? (
        <iframe
          src={source.src.replace("watch?v=", "embed/").replace("/live/", "/embed/") + "?autoplay=1&mute=1"}
          className="w-full h-full"
          allow="autoplay; encrypted-media"
          allowFullScreen
        />
      ) : isIframe ? (
        <iframe
          src={source.src}
          className="w-full h-full"
          allow="autoplay; encrypted-media"
          allowFullScreen
        />
      ) : (
        <video
          id={`video-${source.id}`}
          ref={videoRef}
          src={source.src}
          className="w-full h-full object-cover"
          autoPlay muted loop playsInline
        />
      )}

      {/* No badge overlay — kept clean */}
      {/* Top label overlay */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-1.5 py-0.5 bg-gradient-to-b from-background/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-20">
        <span className="text-[9px] font-mono text-foreground truncate">{source.label}</span>
        <Badge variant="outline" className="text-[8px] px-1 h-3">{source.type.toUpperCase()}</Badge>
      </div>

      {/* Controls overlay */}
      <div className="absolute bottom-0 left-0 right-8 flex items-center gap-0.5 p-1 bg-gradient-to-t from-background/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-20">
        {!isYoutube && !isIframe && !isSrcImage && (
          <>
            <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={togglePlay}>
              {playing ? <Pause className="h-2.5 w-2.5" /> : <Play className="h-2.5 w-2.5" />}
            </Button>
            <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={toggleMute}>
              {muted ? <VolumeX className="h-2.5 w-2.5" /> : <Volume2 className="h-2.5 w-2.5" />}
            </Button>
            <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={toggleFullscreen}>
              <Maximize2 className="h-2.5 w-2.5" />
            </Button>
          </>
        )}
        <div className="flex-1" />
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-destructive" onClick={onRemove}>
          <X className="h-2.5 w-2.5" />
        </Button>
      </div>
    </div>
  );
}

// --- Main Page ---
export default function MediaPlayerPage() {
  const [layout, setLayout] = useState<string>("3x3");
  const [sources, setSources] = useState<(StreamSource | null)[]>(
    Array(9).fill(null).map((_, i) => (i < SAMPLE_SOURCES.length ? SAMPLE_SOURCES[i] : null))
  );
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newSrc, setNewSrc] = useState("");
  const [newType, setNewType] = useState<StreamSource["type"]>("youtube");

  const layoutConfig = LAYOUT_OPTIONS.find((l) => l.value === layout) || LAYOUT_OPTIONS[2];

  const handleLayoutChange = (val: string) => {
    const config = LAYOUT_OPTIONS.find((l) => l.value === val);
    if (!config) return;
    setLayout(val);
    setSources((prev) => {
      const newArr = Array(config.count).fill(null);
      prev.forEach((s, i) => { if (i < config.count) newArr[i] = s; });
      return newArr;
    });
  };

  const addSource = () => {
    if (!newSrc.trim()) return;
    const newSource: StreamSource = {
      id: `custom-${Date.now()}`,
      label: newLabel || `Stream ${sources.filter(Boolean).length + 1}`,
      src: newSrc.trim(),
      type: newType,
    };
    const emptyIndex = sources.findIndex((s) => s === null);
    if (emptyIndex >= 0) {
      setSources((prev) => { const n = [...prev]; n[emptyIndex] = newSource; return n; });
    }
    setNewLabel(""); setNewSrc(""); setShowAddForm(false);
  };

  const removeSource = (index: number) => {
    setSources((prev) => { const n = [...prev]; n[index] = null; return n; });
  };

  return (
    <div className="space-y-4 animate-slide-in">
      {/* Saltwater Recon Embed */}
      <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-4">
        <a href="https://saltwaterrecon.com" target="_blank" rel="noopener noreferrer">
          <img
            src={saltwaterBadge}
            alt="Saltwater Recon"
            className="h-[120px] w-[120px] rounded-lg shadow-lg"
          />
        </a>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Surveillance Grid</h2>
          <p className="text-sm text-muted-foreground font-mono">
            {sources.filter(Boolean).length} active feeds • {layoutConfig.value} layout • Caribbean & Americas
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Powered by <a href="https://saltwaterrecon.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-semibold">Saltwater Recon</a>
          </p>
        </div>
      </div>

      {/* Layout controls */}
      <div className="flex items-center gap-2 justify-end">
        <Select value={layout} onValueChange={handleLayoutChange}>
          <SelectTrigger className="w-24 h-8 text-xs">
            <Grid3X3 className="h-3 w-3 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LAYOUT_OPTIONS.map((l) => (
              <SelectItem key={l.value} value={l.value}>{l.label} ({l.count} slots)</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => setShowAddForm(!showAddForm)}>
          <Plus className="h-3 w-3 mr-1" /> Add Stream
        </Button>
      </div>

      {/* Add stream form */}
      {showAddForm && (
        <Card>
          <CardContent className="p-3 flex items-end gap-2">
            <div className="flex-1">
              <label className="text-[10px] font-mono text-muted-foreground">Label</label>
              <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Camera name..." className="h-7 text-xs bg-secondary" />
            </div>
            <div className="flex-[2]">
              <label className="text-[10px] font-mono text-muted-foreground">URL</label>
              <Input value={newSrc} onChange={(e) => setNewSrc(e.target.value)} placeholder="https://youtube.com/watch?v=..." className="h-7 text-xs bg-secondary" />
            </div>
            <div className="w-28">
              <label className="text-[10px] font-mono text-muted-foreground">Type</label>
              <Select value={newType} onValueChange={(v) => setNewType(v as any)}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="youtube">YouTube</SelectItem>
                  <SelectItem value="hls">HLS</SelectItem>
                  <SelectItem value="dash">DASH</SelectItem>
                  <SelectItem value="mp4">MP4</SelectItem>
                  <SelectItem value="iframe">iFrame</SelectItem>
                  <SelectItem value="rtsp_proxy">RTSP Proxy</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" className="h-7" onClick={addSource}>Add</Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setShowAddForm(false)}><X className="h-3 w-3" /></Button>
          </CardContent>
        </Card>
      )}

      {/* Video grid */}
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${layoutConfig.cols}, 1fr)`,
          gridTemplateRows: `repeat(${layoutConfig.rows}, 1fr)`,
        }}
      >
        {sources.slice(0, layoutConfig.count).map((source, i) => (
          <VideoCell key={i} source={source} index={i} onRemove={() => removeSource(i)} />
        ))}
      </div>
    </div>
  );
}
