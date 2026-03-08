import { useState, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/StatusBadge";
import {
  usePipelineStages,
  useEventBusItems,
  useEventBusMetrics,
  useDeadLetterQueue,
  useProcessEvents,
  useRetryDeadLetter,
  useRealtimeEventBus,
  type EventBusItem,
} from "@/hooks/useEventBus";
import {
  ArrowRight,
  Play,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Zap,
  Skull,
  Radio,
  Layers,
} from "lucide-react";
import { toast } from "sonner";

const STAGE_COLORS: Record<string, string> = {
  ingestion: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  processing: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  tagging: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  correlation: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  prioritization: "bg-rose-500/20 text-rose-400 border-rose-500/30",
  transport: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Clock className="h-3 w-3" />,
  processing: <Zap className="h-3 w-3 animate-pulse" />,
  completed: <CheckCircle2 className="h-3 w-3" />,
  retry: <RefreshCw className="h-3 w-3" />,
  dead_letter: <Skull className="h-3 w-3" />,
};

export default function PipelinePage() {
  const { data: stages = [] } = usePipelineStages();
  const { data: allEvents = [] } = useEventBusItems();
  const { data: metrics } = useEventBusMetrics();
  const { data: deadLetters = [] } = useDeadLetterQueue();
  const processEvents = useProcessEvents();
  const retryDlq = useRetryDeadLetter();
  const [realtimeCount, setRealtimeCount] = useState(0);

  const handleNewEvent = useCallback((event: EventBusItem) => {
    setRealtimeCount((c) => c + 1);
    toast.info(`Event: ${event.stage}`, { description: `Topic: ${event.topic}` });
  }, []);

  useRealtimeEventBus(handleNewEvent);

  const handleProcess = async (stage?: string) => {
    try {
      const result = await processEvents.mutateAsync({ stage, batch_size: 20 });
      toast.success(`Processed ${result?.processed || 0} events`);
    } catch {
      toast.error("Processing failed");
    }
  };

  const handleRetryDlq = async (id: string) => {
    try {
      await retryDlq.mutateAsync(id);
      toast.success("Event re-queued from dead letter");
    } catch {
      toast.error("Retry failed");
    }
  };

  const stageMetrics = metrics?.stageMetrics || {};
  const totalPending = allEvents.filter((e) => e.status === "pending").length;
  const totalProcessing = allEvents.filter((e) => e.status === "processing").length;
  const totalCompleted = allEvents.filter((e) => e.status === "completed").length;
  const totalRetrying = allEvents.filter((e) => e.status === "retry").length;

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Event Pipeline</h2>
          <p className="text-sm text-muted-foreground font-mono">
            Kafka-compatible event bus • {realtimeCount} realtime events received
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => handleProcess()}
            disabled={processEvents.isPending}
            size="sm"
          >
            <Play className="mr-1 h-3 w-3" />
            {processEvents.isPending ? "Processing…" : "Process All"}
          </Button>
        </div>
      </div>

      {/* Pipeline Stage Visualization */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {stages.map((stage, i) => {
          const sm = stageMetrics[stage.name] || {};
          const pending = sm.pending || 0;
          const processing = sm.processing || 0;
          const completed = sm.completed || 0;
          const retry = sm.retry || 0;
          const total = pending + processing + completed + retry;

          return (
            <div key={stage.id} className="flex items-center">
              <Card className={`min-w-[160px] border ${STAGE_COLORS[stage.name] || "border-border"}`}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">{stage.display_name}</span>
                    <Badge variant="outline" className="text-[10px] px-1">
                      {total}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[10px] font-mono">
                    <span className="text-muted-foreground">Pending:</span>
                    <span className="text-right">{pending}</span>
                    <span className="text-muted-foreground">Active:</span>
                    <span className="text-right">{processing}</span>
                    <span className="text-muted-foreground">Done:</span>
                    <span className="text-right">{completed}</span>
                    {retry > 0 && (
                      <>
                        <span className="text-destructive">Retry:</span>
                        <span className="text-right text-destructive">{retry}</span>
                      </>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full mt-2 h-6 text-[10px]"
                    onClick={() => handleProcess(stage.name)}
                    disabled={processEvents.isPending}
                  >
                    Process Stage
                  </Button>
                </CardContent>
              </Card>
              {i < stages.length - 1 && (
                <ArrowRight className="mx-1 h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: "Pending", value: totalPending, icon: Clock, color: "text-muted-foreground" },
          { label: "Processing", value: totalProcessing, icon: Zap, color: "text-primary" },
          { label: "Completed", value: totalCompleted, icon: CheckCircle2, color: "text-emerald-400" },
          { label: "Retrying", value: totalRetrying, icon: RefreshCw, color: "text-amber-400" },
          { label: "Dead Letters", value: metrics?.deadLetterCount || 0, icon: Skull, color: "text-destructive" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3 p-4">
              <Icon className={`h-5 w-5 ${color}`} />
              <div>
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs text-muted-foreground font-mono">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs: Events / Dead Letters */}
      <Tabs defaultValue="events">
        <TabsList>
          <TabsTrigger value="events" className="gap-1">
            <Layers className="h-3 w-3" />
            Event Log ({allEvents.length})
          </TabsTrigger>
          <TabsTrigger value="dlq" className="gap-1">
            <Skull className="h-3 w-3" />
            Dead Letters ({deadLetters.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="events">
          <Card>
            <CardHeader className="py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-mono">Event Bus Log</CardTitle>
                <div className="flex items-center gap-2">
                  <Radio className="h-3 w-3 text-primary animate-pulse" />
                  <span className="text-[10px] font-mono text-muted-foreground">Realtime</span>
                </div>
              </div>
            </CardHeader>
            <ScrollArea className="h-[400px]">
              <div className="divide-y divide-border/50">
                {allEvents.length === 0 ? (
                  <div className="flex flex-col items-center py-12 text-muted-foreground">
                    <Layers className="mb-2 h-8 w-8" />
                    <p className="text-sm">No events in the bus</p>
                    <p className="text-xs">Publish data products to start the pipeline</p>
                  </div>
                ) : (
                  allEvents.map((event) => (
                    <div key={event.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/30 transition-colors">
                      <div className="flex items-center gap-1.5">
                        {STATUS_ICONS[event.status] || <Clock className="h-3 w-3" />}
                      </div>
                      <Badge variant="outline" className={`text-[10px] px-1.5 ${STAGE_COLORS[event.stage] || ""}`}>
                        {event.stage}
                      </Badge>
                      <span className="text-xs font-mono text-muted-foreground truncate flex-1">
                        {event.topic}
                      </span>
                      <Badge variant={event.status === "completed" ? "default" : event.status === "retry" ? "destructive" : "secondary"} className="text-[10px]">
                        {event.status}
                      </Badge>
                      {event.retry_count > 0 && (
                        <span className="text-[10px] font-mono text-destructive">
                          ×{event.retry_count}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground w-20 text-right">
                        {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </Card>
        </TabsContent>

        <TabsContent value="dlq">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-mono flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Dead Letter Queue
              </CardTitle>
            </CardHeader>
            <ScrollArea className="h-[400px]">
              <div className="divide-y divide-border/50">
                {deadLetters.length === 0 ? (
                  <div className="flex flex-col items-center py-12 text-muted-foreground">
                    <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-500" />
                    <p className="text-sm">No dead letters</p>
                    <p className="text-xs">All events processed successfully</p>
                  </div>
                ) : (
                  deadLetters.map((dl) => (
                    <div key={dl.id} className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30">
                      <Skull className="h-4 w-4 text-destructive shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">{dl.stage}</Badge>
                          <span className="text-xs font-mono text-muted-foreground">{dl.topic}</span>
                        </div>
                        {dl.error_message && (
                          <p className="text-[10px] text-destructive truncate mt-0.5">{dl.error_message}</p>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground">×{dl.retry_count}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px]"
                        onClick={() => handleRetryDlq(dl.id)}
                      >
                        <RefreshCw className="mr-1 h-3 w-3" />
                        Retry
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
