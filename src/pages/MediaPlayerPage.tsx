import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Grid3X3, Play, Pause, Maximize2, Volume2, VolumeX, Plus, X, Tv } from "lucide-react";

interface StreamSource {
  id: string;
  label: string;
  src: string;
  type: "hls" | "dash" | "mp4" | "youtube" | "rtsp_proxy" | "iframe";
}

const STORAGE_KEY = "media_player_sources_v1";
const LAYOUT_KEY = "media_player_layout_v1";

const LAYOUT_OPTIONS = [
  { value: "1x1", label: "1×1", cols: 1, rows: 1, count: 1 },
  { value: "2x2", label: "2×2", cols: 2, rows: 2, count: 4 },
  { value: "3x3", label: "3×3", cols: 3, rows: 3, count: 9 },
  { value: "2x5", label: "2×5", cols: 5, rows: 2, count: 10 },
  { value: "5x5", label: "5×5", cols: 5, rows: 5, count: 25 },
] as const;

const DEFAULT_SOURCES: StreamSource[] = [
  {
    id: "ozark-43rdst",
    label: "43rd St Live (Ozark)",
    src: "https://relay.ozark-tech.com/live/43rdst.stream/playlist.m3u8",
    type: "hls",
  },
  { id: "demo-hls-1", label: "Port Cam Alpha", src: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", type: "hls" },
  { id: "demo-hls-2", label: "Harbor Entrance", src: "https://cdn.jwplayer.com/manifests/pZxWPRg4.m3u8", type: "hls" },
  { id: "demo-mp4", label: "Patrol Feed", src: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4", type: "mp4" },
];

function getInitialLayout() {
  const saved = localStorage.getItem(LAYOUT_KEY);
  if (!saved) return "3x3";
  return LAYOUT_OPTIONS.some((opt) => opt.value === saved) ? saved : "3x3";
}

function getInitialSources(slotCount: number) {
  const fallback = Array(slotCount).fill(null);
  DEFAULT_SOURCES.forEach((source, index) => {
    if (index < slotCount) fallback[index] = source;
  });

  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return fallback;

  try {
    const parsed = JSON.parse(saved) as (StreamSource | null)[];
    if (!Array.isArray(parsed)) return fallback;

    const cleaned = parsed.filter((s) => s !== null) as StreamSource[];
    const hasPrimary = cleaned.some((s) => s.src === "https://relay.ozark-tech.com/live/43rdst.stream/playlist.m3u8");
    const normalized = hasPrimary
      ? cleaned
      : [DEFAULT_SOURCES[0], ...cleaned].slice(0, slotCount);

    const padded = Array(slotCount).fill(null);
    normalized.forEach((s, i) => {
      if (i < slotCount) padded[i] = s;
    });
    return padded;
  } catch {
    return fallback;
  }
}

function VideoCell({ source, index, onRemove }: { source: StreamSource | null; index: number; onRemove: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return;

    setHasError(false);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isHls = source.type === "hls" || source.src.toLowerCase().includes(".m3u8");

    if (isHls) {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = source.src;
      } else if (Hls.isSupported()) {
        const hls = new Hls({ lowLatencyMode: true, enableWorker: true });
        hlsRef.current = hls;
        hls.loadSource(source.src);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) setHasError(true);
        });
      } else {
        setHasError(true);
      }
    } else {
      video.src = source.src;
    }

    video.muted = true;
    video
      .play()
      .then(() => setPlaying(true))
      .catch(() => setHasError(true));

    const onVideoError = () => setHasError(true);
    video.addEventListener("error", onVideoError);

    return () => {
      video.removeEventListener("error", onVideoError);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [source]);

  if (!source) {
    return (
      <div className="flex items-center justify-center border border-dashed border-border rounded-md bg-secondary/30 aspect-video">
        <div className="text-center text-muted-foreground">
          <Tv className="h-6 w-6 mx-auto mb-1 opacity-30" />
          <p className="text-[9px] font-mono">Slot {index + 1}</p>
        </div>
      </div>
    );
  }

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setPlaying(true)).catch(() => setHasError(true));
    } else {
      video.pause();
      setPlaying(false);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  const toggleFullscreen = () => {
    videoRef.current?.requestFullscreen?.();
  };

  const isYoutube = source.type === "youtube";

  return (
    <div className="relative group border border-border rounded-md overflow-hidden bg-background aspect-video">
      {isYoutube ? (
        <iframe
          src={source.src.replace("watch?v=", "embed/") + "?autoplay=1&mute=1"}
          className="w-full h-full"
          allow="autoplay; encrypted-media"
          allowFullScreen
        />
      ) : (
        <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted loop playsInline />
      )}

      {hasError && !isYoutube && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
          <p className="text-xs font-mono text-muted-foreground px-2 text-center">Stream unavailable. Check URL/CORS/source access.</p>
        </div>
      )}

      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-1.5 py-0.5 bg-gradient-to-b from-background/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-20">
        <span className="text-[9px] font-mono text-foreground truncate">{source.label}</span>
        <Badge variant="outline" className="text-[8px] px-1 h-3">{source.type.toUpperCase()}</Badge>
      </div>

      <div className="absolute bottom-0 left-0 right-0 flex items-center gap-0.5 p-1 bg-gradient-to-t from-background/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-20">
        {!isYoutube && (
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

export default function MediaPlayerPage() {
  const [layout, setLayout] = useState<string>(getInitialLayout);
  const [sources, setSources] = useState<(StreamSource | null)[]>(() => getInitialSources(9));
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newSrc, setNewSrc] = useState("");
  const [newType, setNewType] = useState<StreamSource["type"]>("hls");

  const layoutConfig = LAYOUT_OPTIONS.find((l) => l.value === layout) || LAYOUT_OPTIONS[2];

  useEffect(() => {
    localStorage.setItem(LAYOUT_KEY, layout);
  }, [layout]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sources));
  }, [sources]);

  const handleLayoutChange = (val: string) => {
    const config = LAYOUT_OPTIONS.find((l) => l.value === val);
    if (!config) return;

    setLayout(val);
    setSources((prev) => {
      const next = Array(config.count).fill(null);
      prev.forEach((s, i) => {
        if (i < config.count) next[i] = s;
      });
      return next;
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
      setSources((prev) => {
        const next = [...prev];
        next[emptyIndex] = newSource;
        return next;
      });
    } else {
      setSources((prev) => {
        const next = [...prev];
        next[next.length - 1] = newSource;
        return next;
      });
    }

    setNewLabel("");
    setNewSrc("");
    setShowAddForm(false);
  };

  const removeSource = (index: number) => {
    setSources((prev) => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
  };

  return (
    <div className="space-y-4 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Surveillance Grid</h2>
          <p className="text-sm text-muted-foreground font-mono">
            {sources.filter(Boolean).length} active feeds • {layoutConfig.value} layout
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={layout} onValueChange={handleLayoutChange}>
            <SelectTrigger className="w-24 h-8 text-xs">
              <Grid3X3 className="h-3 w-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LAYOUT_OPTIONS.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label} ({l.count} slots)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button size="sm" variant="outline" onClick={() => setShowAddForm(!showAddForm)}>
            <Plus className="h-3 w-3 mr-1" /> Add Stream
          </Button>
        </div>
      </div>

      {showAddForm && (
        <Card>
          <CardContent className="p-3 flex items-end gap-2">
            <div className="flex-1">
              <label className="text-[10px] font-mono text-muted-foreground">Label</label>
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Camera name..."
                className="h-7 text-xs bg-secondary"
              />
            </div>

            <div className="flex-[2]">
              <label className="text-[10px] font-mono text-muted-foreground">URL</label>
              <Input
                value={newSrc}
                onChange={(e) => setNewSrc(e.target.value)}
                placeholder="https://..."
                className="h-7 text-xs bg-secondary"
              />
            </div>

            <div className="w-28">
              <label className="text-[10px] font-mono text-muted-foreground">Type</label>
              <Select value={newType} onValueChange={(v) => setNewType(v as StreamSource["type"])}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hls">HLS</SelectItem>
                  <SelectItem value="dash">DASH</SelectItem>
                  <SelectItem value="mp4">MP4</SelectItem>
                  <SelectItem value="youtube">YouTube</SelectItem>
                  <SelectItem value="rtsp_proxy">RTSP Proxy</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button size="sm" className="h-7" onClick={addSource}>Add</Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setShowAddForm(false)}>
              <X className="h-3 w-3" />
            </Button>
          </CardContent>
        </Card>
      )}

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
