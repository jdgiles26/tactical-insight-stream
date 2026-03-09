import AlertsPanel from "@/components/AlertsPanel";
import StormEscalationHistory from "@/components/StormEscalationHistory";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, ShieldAlert } from "lucide-react";

export default function AlertsPage() {
  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Alerts</h2>
        <p className="text-sm text-muted-foreground font-mono">
          Correlation alerts and storm threat escalation events
        </p>
      </div>

      <Tabs defaultValue="correlation" className="space-y-3">
        <TabsList className="bg-secondary">
          <TabsTrigger value="correlation" className="gap-1.5">
            <Bell className="h-3.5 w-3.5" /> Correlation Alerts
          </TabsTrigger>
          <TabsTrigger value="storm" className="gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" /> Storm Escalations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="correlation">
          <AlertsPanel />
        </TabsContent>

        <TabsContent value="storm">
          <StormEscalationHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}
