import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Grid3X3, Play, Pause, Maximize2, Volume2, VolumeX, Plus, X, Tv, AlertTriangle } from "lucide-react";
import type { StreamSource, StreamProtocol, StreamStatus } from "@/lib/streamTypes";
import { detectProtocol } from "@/lib/streamTypes";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "surveillance_streams_v3";
const LAYOUT_KEY = "surveillance_layout_v1";

const LAYOUT_OPTIONS = [
  { value: "1x1", label: "1×1", cols: 1, rows: 1, count: 1 },
  { value: "2x2", label: "2×2", cols: 2, rows: 2, count: 4 },
  { value: "3x3", label: "3×3", cols: 3, rows: 3, count: 9 },
  { value: "2x5", label: "2×5", cols: 5, rows: 2, count: 10 },
  { value: "5x5", label: "5×5", cols: 5, rows: 5, count: 25 },
] as const;

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function getInitialLayout(): string {
  const saved = localStorage.getItem(LAYOUT_KEY);
  if (!saved) return "3x3";
  return LAYOUT_OPTIONS.some((opt) => opt.value === saved) ? saved : "3x3";
}

function getInitialSources(slotCount: number): (StreamSource | null)[] {
  const fallback: (StreamSource | null)[] = Array(slotCount).fill(null);
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return fallback;

  try {
    const parsed = JSON.parse(saved) as (StreamSource | null)[];
    if (!Array.isArray(parsed)) return fallback;
    const padded: (StreamSource | null)[] = Array(slotCount).fill(null);
    parsed.forEach((s, i) => {
      if (i < slotCount) padded[i] = s;
    });
    return padded;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// VideoCell — renders a single stream slot with real protocol handling
// ---------------------------------------------------------------------------

function VideoCell({
  source,
  index,
  onRemove,
}: {
  source: StreamSource | null;
  index: number;
  onRemove: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState<StreamStatus>("inactive");

  // Connect to stream whenever source changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) {
      setStatus("inactive");
      return;
    }

    setStatus("connecting");

    // Tear down any previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const url = source.url;
    const proto = source.protocol;

    // ------------------------------------------------------------------
    // HLS streams (.m3u8)
    // ------------------------------------------------------------------
    if (proto === "hls" || url.toLowerCase().includes(".m3u8")) {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Safari native HLS
        video.src = url;
      } else if (Hls.isSupported()) {
        const hls = new Hls({ lowLatencyMode: true, enableWorker: true });
        hlsRef.current = hls;
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) setStatus("error");
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video
            .play()
            .then(() => {
              setPlaying(true);
              setStatus("active");
            })
            .catch(() => setStatus("error"));
        });
        return () => {
          hls.destroy();
          hlsRef.current = null;
        };
      } else {
        setStatus("error");
        return;
      }
    }
    // ------------------------------------------------------------------
    // RTSP streams — browsers cannot play RTSP natively.
    // A WebSocket-to-RTSP proxy (e.g. rtsp-relay, go2rtc, mediamtx)
    // must re-stream as HLS or WebRTC. The user should provide the
    // proxy's HTTP/HLS endpoint. We attempt to load the URL directly;
    // if the proxy exposes an HLS endpoint this will work.
    // ------------------------------------------------------------------
    else if (proto === "rtsp") {
      // Try loading as-is — a properly configured proxy will expose
      // an HTTP-accessible stream at this URL.
      video.src = url;
    }
    // ------------------------------------------------------------------
    // HTTP / HTTPS direct video streams (MP4, MJPEG, WebM, etc.)
    // ------------------------------------------------------------------
    else {
      video.src = url;
    }

    video.muted = true;
    video
      .play()
      .then(() => {
        setPlaying(true);
        setStatus("active");
      })
      .catch(() => setStatus("error"));

    const onVideoError = () => setStatus("error");
    video.addEventListener("error", onVideoError);

    return () => {
      video.removeEventListener("error", onVideoError);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [source]);

  // --- Empty slot ---
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

  // --- Controls ---
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setPlaying(true)).catch(() => setStatus("error"));
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

  const statusColor =
    status === "active"
      ? "bg-green-500"
      : status === "connecting"
      ? "bg-yellow-500 animate-pulse"
      : status === "error"
      ? "bg-red-500"
      : "bg-gray-500";

  return (
    <div className="relative group border border-border rounded-md overflow-hidden bg-background aspect-video">
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        autoPlay
        muted
        loop
        playsInline
      />

      {/* Error overlay */}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 z-10 gap-1">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <p className="text-xs font-mono text-muted-foreground px-2 text-center">
            Stream unavailable.
          </p>
          <p className="text-[9px] font-mono text-muted-foreground px-2 text-center">
            {source.protocol === "rtsp"
              ? "RTSP requires a proxy (go2rtc / mediamtx). Provide the proxy HLS endpoint."
              : "Check URL, CORS, and source access."}
          </p>
        </div>
      )}

      {/* Top bar: label + protocol badge + status dot */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-1.5 py-0.5 bg-gradient-to-b from-background/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-20">
        <div className="flex items-center gap-1">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${statusColor}`} />
          <span className="text-[9px] font-mono text-foreground truncate max-w-[120px]">
            {source.label}
          </span>
        </div>
        <Badge variant="outline" className="text-[8px] px-1 h-3">
          {source.protocol.toUpperCase()}
        </Badge>
      </div>

      {/* Bottom bar: playback controls */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center gap-0.5 p-1 bg-gradient-to-t from-background/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-20">
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={togglePlay}>
          {playing ? <Pause className="h-2.5 w-2.5" /> : <Play className="h-2.5 w-2.5" />}
        </Button>
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={toggleMute}>
          {muted ? <VolumeX className="h-2.5 w-2.5" /> : <Volume2 className="h-2.5 w-2.5" />}
        </Button>
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={toggleFullscreen}>
          <Maximize2 className="h-2.5 w-2.5" />
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-destructive" onClick={onRemove}>
          <X className="h-2.5 w-2.5" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MediaPlayerPage — the full surveillance grid
// ---------------------------------------------------------------------------

export default function MediaPlayerPage() {
  const [layout, setLayout] = useState<string>(getInitialLayout);
  const [sources, setSources] = useState<(StreamSource | null)[]>(() => getInitialSources(9));
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newProtocol, setNewProtocol] = useState<StreamProtocol>("hls");

  const layoutConfig = LAYOUT_OPTIONS.find((l) => l.value === layout) || LAYOUT_OPTIONS[2];

  // Persist layout & sources
  useEffect(() => {
    localStorage.setItem(LAYOUT_KEY, layout);
  }, [layout]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sources));
  }, [sources]);

  // Auto-detect protocol when user types a URL
  const handleUrlChange = useCallback((url: string) => {
    setNewUrl(url);
    if (url.trim().length > 5) {
      setNewProtocol(detectProtocol(url));
    }
  }, []);

  const handleLayoutChange = (val: string) => {
    const config = LAYOUT_OPTIONS.find((l) => l.value === val);
    if (!config) return;
    setLayout(val);
    setSources((prev) => {
      const next: (StreamSource | null)[] = Array(config.count).fill(null);
      prev.forEach((s, i) => {
        if (i < config.count) next[i] = s;
      });
      return next;
    });
  };

  const addSource = () => {
    if (!newUrl.trim()) return;
    const src: StreamSource = {
      id: `stream-${Date.now()}`,
      label: newLabel || `Camera ${sources.filter(Boolean).length + 1}`,
      url: newUrl.trim(),
      protocol: newProtocol,
    };
    const emptyIdx = sources.findIndex((s) => s === null);
    setSources((prev) => {
      const next = [...prev];
      if (emptyIdx >= 0) {
        next[emptyIdx] = src;
      } else {
        next[next.length - 1] = src;
      }
      return next;
    });
    setNewLabel("");
    setNewUrl("");
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
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Surveillance Grid</h2>
          <p className="text-sm text-muted-foreground font-mono">
            {sources.filter(Boolean).length} active feeds • {layoutConfig.value} layout •
            RTSP / HLS / HTTP / HTTPS
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

      {/* Add-stream form */}
      {showAddForm && (
        <Card>
          <CardContent className="p-3 flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-[120px]">
              <label className="text-[10px] font-mono text-muted-foreground">Label</label>
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Camera name..."
                className="h-7 text-xs bg-secondary"
              />
            </div>

            <div className="flex-[2] min-w-[200px]">
              <label className="text-[10px] font-mono text-muted-foreground">
                Stream URL (rtsp:// , https:// , http:// , .m3u8)
              </label>
              <Input
                value={newUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="rtsp://camera:554/stream  or  https://host/feed.m3u8"
                className="h-7 text-xs bg-secondary"
              />
            </div>

            <div className="w-32">
              <label className="text-[10px] font-mono text-muted-foreground">Protocol</label>
              <Select
                value={newProtocol}
                onValueChange={(v) => setNewProtocol(v as StreamProtocol)}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rtsp">RTSP</SelectItem>
                  <SelectItem value="hls">HLS (.m3u8)</SelectItem>
                  <SelectItem value="http">HTTP</SelectItem>
                  <SelectItem value="https">HTTPS</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button size="sm" className="h-7" onClick={addSource}>
              Add
            </Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setShowAddForm(false)}>
              <X className="h-3 w-3" />
            </Button>
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
