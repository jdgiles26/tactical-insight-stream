import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useDataSources } from "@/hooks/useDataSources";
import {
  Plug,
  Webhook,
  Globe,
  Rss,
  Activity,
} from "lucide-react";
import ApiConnectionForm from "@/components/sources/ApiConnectionForm";
import WebhookPanel from "@/components/sources/WebhookPanel";
import WebScraperPanel from "@/components/sources/WebScraperPanel";
import RssFeedPanel from "@/components/sources/RssFeedPanel";
import ActiveSourcesPanel from "@/components/sources/ActiveSourcesPanel";

export default function SourcesPage() {
  const { data: sources } = useDataSources();
  const [activeTab, setActiveTab] = useState("api-connections");

  const activeCount = sources?.filter((s) => s.status === "active").length || 0;
  const totalCount = sources?.length || 0;

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Data Sources</h2>
        <p className="text-sm text-muted-foreground font-mono">
          Configure, monitor, and ingest from live data feeds
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start bg-muted/50 border border-border">
          <TabsTrigger value="api-connections" className="flex items-center gap-1.5 data-[state=active]:bg-background">
            <Plug className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">API Connections</span>
            <span className="sm:hidden">API</span>
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="flex items-center gap-1.5 data-[state=active]:bg-background">
            <Webhook className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Webhooks</span>
            <span className="sm:hidden">Hooks</span>
          </TabsTrigger>
          <TabsTrigger value="web-scraper" className="flex items-center gap-1.5 data-[state=active]:bg-background">
            <Globe className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Web Scraper</span>
            <span className="sm:hidden">Scrape</span>
          </TabsTrigger>
          <TabsTrigger value="rss-feeds" className="flex items-center gap-1.5 data-[state=active]:bg-background">
            <Rss className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">RSS Feeds</span>
            <span className="sm:hidden">RSS</span>
          </TabsTrigger>
          <TabsTrigger value="active-sources" className="flex items-center gap-1.5 data-[state=active]:bg-background">
            <Activity className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Active Sources</span>
            <span className="sm:hidden">Active</span>
            {totalCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] justify-center text-[10px] font-mono">
                {activeCount}/{totalCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="api-connections" className="mt-4">
          <ApiConnectionForm />
        </TabsContent>

        <TabsContent value="webhooks" className="mt-4">
          <WebhookPanel />
        </TabsContent>

        <TabsContent value="web-scraper" className="mt-4">
          <WebScraperPanel />
        </TabsContent>

        <TabsContent value="rss-feeds" className="mt-4">
          <RssFeedPanel />
        </TabsContent>

        <TabsContent value="active-sources" className="mt-4">
          <ActiveSourcesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
