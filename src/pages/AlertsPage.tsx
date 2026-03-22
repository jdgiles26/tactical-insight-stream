import AlertsPanel from "@/components/AlertsPanel";
import StormEscalationHistory from "@/components/StormEscalationHistory";
import EmergencyMissionPanel from "@/components/EmergencyMissionPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, ShieldAlert, Siren } from "lucide-react";
import { useActiveEmergencyTriggers } from "@/hooks/useEmergencyTriggers";

export default function AlertsPage() {
  const { data: activeTriggers = [] } = useActiveEmergencyTriggers();

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Alerts</h2>
        <p className="text-sm text-muted-foreground font-mono">
          Correlation alerts, emergency mission groups, and storm threat escalation events
        </p>
      </div>

      {/* Emergency Mission Groups — always shown at top when active */}
      {activeTriggers.length > 0 && (
        <EmergencyMissionPanel />
      )}

      <Tabs defaultValue="correlation" className="space-y-3">
        <TabsList className="bg-secondary">
          <TabsTrigger value="correlation" className="gap-1.5">
            <Bell className="h-3.5 w-3.5" /> Correlation Alerts
          </TabsTrigger>
          <TabsTrigger value="emergency" className="gap-1.5 relative">
            <Siren className="h-3.5 w-3.5" /> Mission Groups
            {activeTriggers.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">
                {activeTriggers.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="storm" className="gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" /> Storm Escalations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="correlation">
          <AlertsPanel />
        </TabsContent>

        <TabsContent value="emergency">
          <EmergencyMissionPanel />
        </TabsContent>

        <TabsContent value="storm">
          <StormEscalationHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}

