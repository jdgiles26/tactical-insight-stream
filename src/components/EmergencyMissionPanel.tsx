import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  useActiveEmergencyTriggers,
  useMissionGroups,
  useGroupEvidence,
  useDeactivateTrigger,
  MissionGroup,
} from "@/hooks/useEmergencyTriggers";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  AlertTriangle, ChevronDown, ChevronRight, Siren, Shield,
  FileText, Eye, Link2, TrendingUp, XCircle, Clock, MapPin,
  Target, Radio,
} from "lucide-react";

// ─────────────────────────────────────────────────────────
// Colour helpers
// ─────────────────────────────────────────────────────────
const triggerTypeColour: Record<string, string> = {
  mayday: "text-red-400 border-red-500/50 bg-red-500/10",
  opord: "text-orange-400 border-orange-500/50 bg-orange-500/10",
  disaster: "text-yellow-400 border-yellow-500/50 bg-yellow-500/10",
  illegal: "text-purple-400 border-purple-500/50 bg-purple-500/10",
  injury: "text-red-300 border-red-400/50 bg-red-400/10",
  national_alert: "text-orange-300 border-orange-400/50 bg-orange-400/10",
};

const riskColour: Record<string, string> = {
  Critical: "bg-red-500/20 text-red-300 border-red-500/40",
  High: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  Medium: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  Low: "bg-green-500/20 text-green-300 border-green-500/40",
};

const evidenceIcon: Record<string, JSX.Element> = {
  document: <FileText className="h-3 w-3" />,
  yolo_detection: <Eye className="h-3 w-3" />,
  live_track: <Radio className="h-3 w-3" />,
  audio: <Radio className="h-3 w-3" />,
  image: <Eye className="h-3 w-3" />,
};

// ─────────────────────────────────────────────────────────
// Evidence sub-component (lazy-loaded when group is opened)
// ─────────────────────────────────────────────────────────
function EvidenceList({ groupId }: { groupId: string }) {
  const { data: evidence = [] } = useGroupEvidence(groupId);
  if (!evidence.length) {
    return <p className="text-[10px] text-muted-foreground py-2">No evidence entries yet.</p>;
  }
  return (
    <div className="space-y-1.5 pt-1">
      {evidence.map((ev) => (
        <div key={ev.id} className="flex items-start gap-2 rounded border border-border/50 bg-background/40 px-2 py-1.5">
          <span className="mt-0.5 text-muted-foreground">{evidenceIcon[ev.evidence_type] ?? <Link2 className="h-3 w-3" />}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium leading-snug">{ev.description ?? ev.evidence_type}</p>
            {ev.timestamp_ref && (
              <p className="text-[9px] font-mono text-muted-foreground mt-0.5">
                <Clock className="inline h-2.5 w-2.5 mr-0.5" />
                {formatDistanceToNow(new Date(ev.timestamp_ref), { addSuffix: true })}
              </p>
            )}
          </div>
          <Badge variant="outline" className="text-[8px] shrink-0 uppercase">{ev.evidence_type.replace("_", " ")}</Badge>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Single Mission Group card
// ─────────────────────────────────────────────────────────
function MissionGroupCard({ group }: { group: MissionGroup }) {
  const [open, setOpen] = useState(false);
  const prediction = group.prediction as Record<string, string>;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className={`rounded-md border ${riskColour[group.risk_level] ?? "border-border"} overflow-hidden`}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors text-left">
            <span className="shrink-0">{open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate">{group.group_name}</p>
              <p className="text-[9px] font-mono text-muted-foreground truncate">{group.summary}</p>
            </div>
            <div className="flex gap-1 shrink-0">
              <Badge className={`text-[8px] border ${riskColour[group.risk_level]}`}>{group.risk_level}</Badge>
              <Badge variant="outline" className="text-[8px]">{group.confidence}</Badge>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-2 border-t border-current/20">
            {/* Prediction */}
            {prediction && Object.keys(prediction).length > 0 && (
              <div className="rounded bg-background/60 p-2 mt-2">
                <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                  <TrendingUp className="h-2.5 w-2.5" /> Prediction
                </p>
                <div className="space-y-0.5">
                  {Object.entries(prediction).map(([k, v]) => (
                    <p key={k} className="text-[10px]">
                      <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}: </span>
                      <span>{v}</span>
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Evidence */}
            <div>
              <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                <Link2 className="h-2.5 w-2.5" /> Paired Evidence
              </p>
              <EvidenceList groupId={group.id} />
            </div>

            <p className="text-[9px] font-mono text-muted-foreground">
              Correlation: {group.correlation_method} • {formatDistanceToNow(new Date(group.created_at), { addSuffix: true })}
            </p>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// ─────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────
export default function EmergencyMissionPanel() {
  const { data: triggers = [], isLoading } = useActiveEmergencyTriggers();
  const { data: allGroups = [] } = useMissionGroups();
  const deactivate = useDeactivateTrigger();
  const [expandedTrigger, setExpandedTrigger] = useState<string | null>(null);

  if (isLoading) return null;
  if (triggers.length === 0) return null;

  const groupsByTrigger = (triggerId: string) =>
    allGroups.filter((g) => g.trigger_id === triggerId);

  const handleDeactivate = (id: string) => {
    deactivate.mutate(id, {
      onSuccess: () => toast.info("Emergency trigger deactivated"),
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Siren className="h-4 w-4 text-red-400 animate-pulse" />
        <h3 className="text-sm font-bold text-red-400 uppercase tracking-wider">
          Mission Priority — Emergency Intelligence
        </h3>
        <Badge className="bg-red-500/20 text-red-300 border-red-500/40 text-[9px] animate-pulse">
          {triggers.length} ACTIVE
        </Badge>
      </div>

      {triggers.map((trigger) => {
        const colour = triggerTypeColour[trigger.trigger_type] ?? "text-orange-400 border-orange-500/50 bg-orange-500/10";
        const groups = groupsByTrigger(trigger.id);
        const isExpanded = expandedTrigger === trigger.id;

        return (
          <Card
            key={trigger.id}
            className={`border-2 ${colour} shadow-lg`}
          >
            <CardHeader className="py-2 px-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-xs flex items-center gap-2 flex-wrap">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span className="uppercase font-bold tracking-wide">
                      {trigger.trigger_type.replace("_", " ")}
                    </span>
                    <Badge className={`text-[8px] border ${riskColour[trigger.urgency_level === "critical" ? "Critical" : trigger.urgency_level === "high" ? "High" : "Medium"]}`}>
                      {trigger.urgency_level.toUpperCase()}
                    </Badge>
                    {groups.length > 0 && (
                      <Badge variant="outline" className="text-[8px]">
                        {groups.length} group{groups.length !== 1 ? "s" : ""}
                      </Badge>
                    )}
                  </CardTitle>

                  {/* Commander's Intent */}
                  {trigger.commander_intent && (
                    <div className="mt-1 flex items-start gap-1">
                      <Target className="h-2.5 w-2.5 shrink-0 mt-0.5 text-muted-foreground" />
                      <p className="text-[10px] font-medium leading-snug">{trigger.commander_intent}</p>
                    </div>
                  )}

                  {/* Key Elements */}
                  {Object.keys(trigger.key_elements ?? {}).length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {Object.entries(trigger.key_elements).slice(0, 6).map(([k, v]) => (
                        <span key={k} className="inline-flex items-center gap-0.5 rounded bg-background/50 border border-current/20 px-1.5 py-0.5 text-[9px] font-mono">
                          {k === "location" && <MapPin className="h-2 w-2" />}
                          <span className="text-muted-foreground">{k}:</span>
                          <span className="font-medium truncate max-w-[100px]">{v}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  <p className="mt-1 text-[9px] font-mono text-muted-foreground">
                    <Clock className="inline h-2.5 w-2.5 mr-0.5" />
                    {formatDistanceToNow(new Date(trigger.created_at), { addSuffix: true })}
                    {trigger.sentiment_score !== null && (
                      <> • urgency: {(Number(trigger.sentiment_score) * 100).toFixed(0)}%</>
                    )}
                  </p>
                </div>

                <div className="flex gap-1 shrink-0">
                  {groups.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[9px] px-2"
                      onClick={() => setExpandedTrigger(isExpanded ? null : trigger.id)}
                    >
                      <Shield className="h-2.5 w-2.5 mr-1" />
                      {isExpanded ? "Hide" : "View"} groups
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[9px] text-muted-foreground hover:text-foreground px-1"
                    onClick={() => handleDeactivate(trigger.id)}
                    title="Deactivate trigger"
                  >
                    <XCircle className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            {/* Mission Groups (click-to-expand) */}
            {isExpanded && groups.length > 0 && (
              <CardContent className="px-3 pb-3 pt-0">
                <ScrollArea className="max-h-[480px]">
                  <div className="space-y-2">
                    {groups.map((group) => (
                      <MissionGroupCard key={group.id} group={group} />
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            )}

            {isExpanded && groups.length === 0 && (
              <CardContent className="px-3 pb-3 pt-0">
                <p className="text-[10px] text-muted-foreground font-mono">
                  No correlated mission groups found yet — system is scanning the silent object registry.
                </p>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
