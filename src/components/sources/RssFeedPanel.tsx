import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  Loader2,
  Download,
  CheckCircle2,
  Clock,
  Hash,
  ChevronDown,
  ChevronRight,
  ToggleLeft,
  ToggleRight,
  Play,
  Zap,
  AlertTriangle,
  Webhook,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { RSS_FEED_CATALOG, type RssFeed, type RssFeedCategory } from "@/lib/rssFeedCatalog";
import { fetchAndParseRss } from "@/lib/webScraper";

const RSS_STATE_KEY = "mdg_rss_feed_state";

interface FeedState {
  active: boolean;
  lastFetch: string | null;
  articleCount: number;
  lastError: string | null;
}

type FeedStates = Record<string, FeedState>;

function loadFeedStates(): FeedStates {
  try {
    const raw = localStorage.getItem(RSS_STATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveFeedStates(states: FeedStates): void {
  localStorage.setItem(RSS_STATE_KEY, JSON.stringify(states));
}

function getDefaultFeedState(): FeedState {
  return { active: false, lastFetch: null, articleCount: 0, lastError: null };
}

export default function RssFeedPanel() {
  const [feedStates, setFeedStates] = useState<FeedStates>(loadFeedStates);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [loadingFeeds, setLoadingFeeds] = useState<Set<string>>(new Set());
  const [loadingCategories, setLoadingCategories] = useState<Set<string>>(new Set());
  const [globalLoading, setGlobalLoading] = useState(false);

  useEffect(() => { saveFeedStates(feedStates); }, [feedStates]);

  const getFeedState = useCallback(
    (feedId: string): FeedState => feedStates[feedId] || getDefaultFeedState(),
    [feedStates]
  );

  const updateFeedState = useCallback(
    (feedId: string, updates: Partial<FeedState>) => {
      setFeedStates((prev) => ({
        ...prev,
        [feedId]: { ...(prev[feedId] || getDefaultFeedState()), ...updates },
      }));
    },
    []
  );

  const toggleFeed = useCallback(
    (feedId: string) => {
      const current = getFeedState(feedId);
      updateFeedState(feedId, { active: !current.active });
    },
    [getFeedState, updateFeedState]
  );

  const toggleCategory = useCallback((categoryKey: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryKey)) next.delete(categoryKey);
      else next.add(categoryKey);
      return next;
    });
  }, []);

  const enableAllInCategory = useCallback((category: RssFeedCategory) => {
    setFeedStates((prev) => {
      const next = { ...prev };
      category.feeds.forEach((feed) => {
        next[feed.id] = { ...(next[feed.id] || getDefaultFeedState()), active: true };
      });
      return next;
    });
    toast.success(`Enabled all ${category.feeds.length} feeds in ${category.label}`);
  }, []);

  const disableAllInCategory = useCallback((category: RssFeedCategory) => {
    setFeedStates((prev) => {
      const next = { ...prev };
      category.feeds.forEach((feed) => {
        next[feed.id] = { ...(next[feed.id] || getDefaultFeedState()), active: false };
      });
      return next;
    });
    toast.success(`Disabled all feeds in ${category.label}`);
  }, []);

  const ingestFeed = useCallback(async (feed: RssFeed): Promise<number> => {
    setLoadingFeeds((prev) => new Set(prev).add(feed.id));
    try {
      // Try supabase edge function first
      try {
        const { data, error } = await supabase.functions.invoke("rss-ingester", {
          body: { action: "ingest_feed", feed_url: feed.url, feed_name: feed.name },
        });
        if (!error && data?.ingested) {
          updateFeedState(feed.id, {
            lastFetch: new Date().toISOString(),
            articleCount: (getFeedState(feed.id).articleCount || 0) + data.ingested,
            lastError: null,
          });
          return data.ingested;
        }
      } catch {
        // Edge function not available, fall through
      }

      // Client-side RSS fetch via CORS proxy
      const items = await fetchAndParseRss(feed.url);
      if (items.length === 0) {
        updateFeedState(feed.id, { lastFetch: new Date().toISOString(), lastError: "No items found in feed" });
        return 0;
      }

      let ingested = 0;
      for (const item of items.slice(0, 25)) {
        try {
          const { error } = await supabase.from("data_products").insert({
            title: item.title,
            source_type: "rss_feed",
            source_identifier: feed.id,
            status: "pending",
            content: {
              description: item.description?.substring(0, 5000),
              link: item.link,
              pub_date: item.pubDate,
              guid: item.guid,
              author: item.author,
              category: item.category || feed.category,
              feed_name: feed.name,
              feed_url: feed.url,
            },
            confidence_score: 0.6,
          } as any);
          if (!error) ingested++;
        } catch { /* skip individual item errors */ }
      }

      updateFeedState(feed.id, {
        lastFetch: new Date().toISOString(),
        articleCount: (getFeedState(feed.id).articleCount || 0) + ingested,
        lastError: null,
      });
      return ingested;
    } catch (err: any) {
      updateFeedState(feed.id, { lastFetch: new Date().toISOString(), lastError: err.message || "Fetch failed" });
      return 0;
    } finally {
      setLoadingFeeds((prev) => { const next = new Set(prev); next.delete(feed.id); return next; });
    }
  }, [getFeedState, updateFeedState]);

  const ingestCategory = useCallback(async (category: RssFeedCategory) => {
    setLoadingCategories((prev) => new Set(prev).add(category.key));
    let totalIngested = 0;
    let errors = 0;
    for (const feed of category.feeds) {
      try {
        const count = await ingestFeed(feed);
        totalIngested += count;
      } catch { errors++; }
    }
    setLoadingCategories((prev) => { const next = new Set(prev); next.delete(category.key); return next; });
    if (errors > 0) {
      toast.warning(`${category.label}: Ingested ${totalIngested} articles with ${errors} feed errors`);
    } else {
      toast.success(`${category.label}: Ingested ${totalIngested} articles from ${category.feeds.length} feeds`);
    }
  }, [ingestFeed]);

  const ingestAllActive = useCallback(async () => {
    setGlobalLoading(true);
    let totalIngested = 0;
    let feedCount = 0;
    let errors = 0;
    for (const category of RSS_FEED_CATALOG) {
      for (const feed of category.feeds) {
        if (getFeedState(feed.id).active) {
          try {
            const count = await ingestFeed(feed);
            totalIngested += count;
            feedCount++;
          } catch { errors++; }
        }
      }
    }
    setGlobalLoading(false);
    if (feedCount === 0) {
      toast.warning("No active feeds to ingest. Enable some feeds first.");
    } else if (errors > 0) {
      toast.warning(`Ingested ${totalIngested} articles from ${feedCount} feeds (${errors} errors)`);
    } else {
      toast.success(`Ingested ${totalIngested} articles from ${feedCount} active feeds`);
    }
  }, [getFeedState, ingestFeed]);

  const allFeeds = RSS_FEED_CATALOG.flatMap((c) => c.feeds);
  const activeCount = allFeeds.filter((f) => getFeedState(f.id).active).length;
  const totalArticles = allFeeds.reduce((sum, f) => sum + (getFeedState(f.id).articleCount || 0), 0);

  const formatTime = (iso: string | null) => {
    if (!iso) return "Never";
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  };

  return (
    <ScrollArea className="h-[calc(100vh-220px)]">
      <div className="space-y-6 pr-4">
        {/* Global Stats & Controls */}
        <Card className="border-border bg-card">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">{allFeeds.length}</p>
                  <p className="text-[10px] font-mono uppercase text-muted-foreground">Total Feeds</p>
                </div>
                <Separator orientation="vertical" className="h-10" />
                <div className="text-center">
                  <p className="text-2xl font-bold text-emerald-500">{activeCount}</p>
                  <p className="text-[10px] font-mono uppercase text-muted-foreground">Active</p>
                </div>
                <Separator orientation="vertical" className="h-10" />
                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">{RSS_FEED_CATALOG.length}</p>
                  <p className="text-[10px] font-mono uppercase text-muted-foreground">Categories</p>
                </div>
                <Separator orientation="vertical" className="h-10" />
                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">{totalArticles.toLocaleString()}</p>
                  <p className="text-[10px] font-mono uppercase text-muted-foreground">Total Ingested</p>
                </div>
              </div>
              <Button onClick={ingestAllActive} disabled={globalLoading || activeCount === 0} className="min-w-[180px]">
                {globalLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
                {globalLoading ? "Ingesting..." : `Ingest All Active (${activeCount})`}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Categories */}
        {RSS_FEED_CATALOG.map((category) => {
          const isCollapsed = collapsedCategories.has(category.key);
          const categoryActiveCount = category.feeds.filter((f) => getFeedState(f.id).active).length;
          const isCategoryLoading = loadingCategories.has(category.key);
          const categoryArticles = category.feeds.reduce((sum, f) => sum + (getFeedState(f.id).articleCount || 0), 0);

          return (
            <Card key={category.key} className="border-border bg-card">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <button type="button"
                    className="flex items-center gap-2 text-left hover:text-foreground transition-colors"
                    onClick={() => toggleCategory(category.key)}>
                    {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    <CardTitle className="text-sm font-semibold text-foreground">{category.label}</CardTitle>
                    <Badge variant="secondary" className="ml-1 font-mono text-[10px]">
                      {categoryActiveCount}/{category.feeds.length}
                    </Badge>
                    {categoryArticles > 0 && (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        <Hash className="h-2.5 w-2.5 mr-0.5" />{categoryArticles.toLocaleString()}
                      </Badge>
                    )}
                  </button>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => enableAllInCategory(category)}>
                      <ToggleRight className="h-3 w-3 mr-1" /> Enable All
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => disableAllInCategory(category)}>
                      <ToggleLeft className="h-3 w-3 mr-1" /> Disable All
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => ingestCategory(category)} disabled={isCategoryLoading}>
                      {isCategoryLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Download className="h-3 w-3 mr-1" />}
                      Ingest Category
                    </Button>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground ml-6">{category.description}</p>
              </CardHeader>

              {!isCollapsed && (
                <CardContent className="pt-0">
                  <div className="space-y-1.5">
                    {category.feeds.map((feed) => {
                      const state = getFeedState(feed.id);
                      const isLoading = loadingFeeds.has(feed.id);
                      return (
                        <div key={feed.id}
                          className={`flex items-center justify-between rounded-md border px-3 py-2.5 transition-colors ${
                            state.active ? "border-primary/30 bg-primary/5" : "border-border bg-secondary/20"
                          }`}>
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <Switch checked={state.active} onCheckedChange={() => toggleFeed(feed.id)} className="shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-xs font-medium text-foreground">{feed.name}</p>
                                <Badge variant="outline" className="font-mono text-[8px] shrink-0">{category.label}</Badge>
                              </div>
                              <p className="text-[10px] text-muted-foreground font-mono truncate max-w-md" title={feed.url}>
                                {feed.url}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 ml-3">
                            <div className="text-right hidden md:block">
                              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <Clock className="h-2.5 w-2.5" />{formatTime(state.lastFetch)}
                              </div>
                              {state.articleCount > 0 && (
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <Hash className="h-2.5 w-2.5" />{state.articleCount} articles
                                </div>
                              )}
                            </div>
                            {state.lastError ? (
                              <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" title={state.lastError} />
                            ) : state.lastFetch ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                            ) : null}
                            <Button variant="outline" size="sm" className="text-[10px] h-7 px-2"
                              onClick={async () => {
                                const count = await ingestFeed(feed);
                                if (count > 0) toast.success(`${feed.name}: Ingested ${count} articles`);
                                else toast.warning(`${feed.name}: No new articles found`);
                              }}
                              disabled={isLoading}>
                              {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Play className="h-2.5 w-2.5 mr-1" />Ingest</>}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </ScrollArea>
  );
}
