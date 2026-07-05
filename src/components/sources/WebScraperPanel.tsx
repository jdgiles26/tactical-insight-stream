import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  Globe,
  Search,
  Loader2,
  FileText,
  Link2,
  Table2,
  Code,
  Clock,
  Trash2,
  Download,
  Eye,
  Calendar,
  Bot,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  scrapeUrl,
  type ExtractionMode,
  type ScrapeResult,
  getScrapeHistory,
  addScrapeHistory,
  clearScrapeHistory,
  type ScrapeHistoryEntry,
} from "@/lib/webScraper";
import { useQueryClient } from "@tanstack/react-query";
import { computePriorityScore, scoreToPriorityLevel } from "@/lib/priorityScoring";

const EXTRACTION_MODES: { value: ExtractionMode; label: string; icon: typeof FileText; description: string }[] = [
  { value: "auto", label: "Auto", icon: Bot, description: "Automatically detect best extraction" },
  { value: "article", label: "Article", icon: FileText, description: "Extract main article text" },
  { value: "table", label: "Table", icon: Table2, description: "Extract table data" },
  { value: "links", label: "Links", icon: Link2, description: "Extract all links" },
  { value: "raw_html", label: "Raw HTML", icon: Code, description: "Get raw HTML content" },
  { value: "structured_data", label: "Structured Data", icon: Code, description: "Extract JSON-LD / microdata" },
];

const SCHEDULE_OPTIONS = [
  { value: "one-time", label: "One-time" },
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

const DEPTH_OPTIONS = [
  { value: "single", label: "Single page" },
  { value: "depth-1", label: "Follow links (depth 1)" },
  { value: "depth-2", label: "Follow links (depth 2)" },
];

export default function WebScraperPanel() {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<ExtractionMode>("auto");
  const [cssSelector, setCssSelector] = useState("");
  const [schedule, setSchedule] = useState("one-time");
  const [depth, setDepth] = useState("single");
  const [respectRobots, setRespectRobots] = useState(true);
  const [userAgent, setUserAgent] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [history, setHistory] = useState<ScrapeHistoryEntry[]>([]);
  const [savingProduct, setSavingProduct] = useState(false);

  useEffect(() => {
    setHistory(getScrapeHistory());
  }, []);

  const handleFetchAndAnalyze = async () => {
    if (!url.trim()) { toast.error("Enter a URL to scrape"); return; }
    try { new URL(url); } catch { toast.error("Invalid URL format"); return; }

    setLoading(true);
    setResult(null);
    try {
      const scrapeResult = await scrapeUrl({
        url: url.trim(), mode,
        cssSelector: cssSelector.trim() || undefined,
        userAgent: userAgent.trim() || undefined,
        respectRobots,
      });
      setResult(scrapeResult);
      const historyEntry: ScrapeHistoryEntry = {
        id: `scrape_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        url: url.trim(), title: scrapeResult.title,
        wordCount: scrapeResult.wordCount, mode,
        scrapedAt: new Date().toISOString(),
      };
      addScrapeHistory(historyEntry);
      setHistory(getScrapeHistory());
      toast.success(`Scraped ${scrapeResult.wordCount} words from ${scrapeResult.title}`);
    } catch (err: any) {
      toast.error("Scrape failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAsProduct = async () => {
    if (!result) return;
    setSavingProduct(true);
    try {
      const textForScoring = `${result.title} ${result.content}`;
      const priority_score = computePriorityScore(textForScoring);
      const priority_level = scoreToPriorityLevel(priority_score);
      const { error } = await supabase.from("data_products").insert({
        title: `[Scraped] ${result.title}`,
        source_type: "document",
        source_identifier: result.url,
        status: "ingested",
        content: {
          text: result.content.substring(0, 50000),
          url: result.url,
          extraction_mode: result.mode,
          word_count: result.wordCount,
          metadata: result.metadata,
          links_count: result.links.length,
          images_count: result.images.length,
          tables_count: result.tables.length,
          scraped_at: result.extractedAt,
          raw_html_length: result.rawHtmlLength,
        },
        confidence_score: 0.7,
        priority_score,
        priority_level,
      } as any);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["data_products"] });
      queryClient.invalidateQueries({ queryKey: ["data_products_geo"] });
      toast.success("Saved as data product");
    } catch (err: any) {
      toast.error("Failed to save: " + err.message);
    } finally {
      setSavingProduct(false);
    }
  };

  const handleClearHistory = () => {
    clearScrapeHistory();
    setHistory([]);
    toast.success("Scrape history cleared");
  };

  const formatTime = (iso: string) => {
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  };

  return (
    <ScrollArea className="h-[calc(100vh-220px)]">
      <div className="space-y-6 pr-4">
        {/* URL Input */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Globe className="h-4 w-4" /> Web Scraper
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">URL to Scrape</label>
              <div className="flex gap-2">
                <Input value={url} onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/article"
                  className="bg-secondary border-border font-mono text-xs flex-1"
                  onKeyDown={(e) => { if (e.key === "Enter") handleFetchAndAnalyze(); }} />
                <Button onClick={handleFetchAndAnalyze} disabled={loading || !url.trim()}>
                  {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                  {loading ? "Fetching..." : "Fetch & Analyze"}
                </Button>
              </div>
            </div>

            {/* Extraction Mode */}
            <div>
              <label className="mb-2 block text-xs font-mono uppercase text-muted-foreground">Extraction Mode</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {EXTRACTION_MODES.map((m) => {
                  const Icon = m.icon;
                  return (
                    <button key={m.value} type="button" onClick={() => setMode(m.value)}
                      className={`flex items-center gap-2 rounded-md border p-2.5 text-left text-xs transition-colors ${
                        mode === m.value
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/60"
                      }`}>
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <div>
                        <div className="font-medium">{m.label}</div>
                        <div className="text-[10px] text-muted-foreground">{m.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* CSS Selector */}
            <div>
              <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">CSS Selector (optional)</label>
              <Input value={cssSelector} onChange={(e) => setCssSelector(e.target.value)}
                placeholder="article .content, #main-text, .post-body"
                className="bg-secondary border-border font-mono text-xs" />
              <p className="mt-1 text-[10px] text-muted-foreground">Override extraction mode with a specific CSS selector.</p>
            </div>

            {/* Schedule & Depth */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">
                  <Calendar className="inline h-3 w-3 mr-1" />Schedule
                </label>
                <select value={schedule} onChange={(e) => setSchedule(e.target.value)}
                  className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground">
                  {SCHEDULE_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Crawl Depth</label>
                <select value={depth} onChange={(e) => setDepth(e.target.value)}
                  className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground">
                  {DEPTH_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">
                  <Bot className="inline h-3 w-3 mr-1" />User-Agent
                </label>
                <Input value={userAgent} onChange={(e) => setUserAgent(e.target.value)}
                  placeholder="Mozilla/5.0 ..." className="bg-secondary border-border font-mono text-xs" />
              </div>
            </div>

            {/* Robots.txt */}
            <div className="flex items-center gap-3">
              <Switch checked={respectRobots} onCheckedChange={setRespectRobots} />
              <div>
                <label className="text-xs font-medium text-foreground flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" /> Respect robots.txt
                </label>
                <p className="text-[10px] text-muted-foreground">Check robots.txt before scraping (recommended)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results Preview */}
        {result && (
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Eye className="h-4 w-4" /> Extraction Results
                </CardTitle>
                <Button size="sm" onClick={handleSaveAsProduct} disabled={savingProduct}>
                  {savingProduct ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1" />}
                  Save as Data Product
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Summary stats */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="rounded-md bg-secondary/50 p-2.5 text-center">
                  <p className="text-[10px] font-mono uppercase text-muted-foreground">Title</p>
                  <p className="text-xs font-medium text-foreground truncate" title={result.title}>{result.title}</p>
                </div>
                <div className="rounded-md bg-secondary/50 p-2.5 text-center">
                  <p className="text-[10px] font-mono uppercase text-muted-foreground">Words</p>
                  <p className="text-sm font-bold text-foreground">{result.wordCount.toLocaleString()}</p>
                </div>
                <div className="rounded-md bg-secondary/50 p-2.5 text-center">
                  <p className="text-[10px] font-mono uppercase text-muted-foreground">Links</p>
                  <p className="text-sm font-bold text-foreground">{result.links.length}</p>
                </div>
                <div className="rounded-md bg-secondary/50 p-2.5 text-center">
                  <p className="text-[10px] font-mono uppercase text-muted-foreground">Images</p>
                  <p className="text-sm font-bold text-foreground">{result.images.length}</p>
                </div>
                <div className="rounded-md bg-secondary/50 p-2.5 text-center">
                  <p className="text-[10px] font-mono uppercase text-muted-foreground">HTML Size</p>
                  <p className="text-sm font-bold text-foreground">{(result.rawHtmlLength / 1024).toFixed(1)}KB</p>
                </div>
              </div>

              {/* Metadata */}
              {Object.keys(result.metadata).length > 0 && (
                <div>
                  <p className="text-[10px] font-mono uppercase text-muted-foreground mb-1.5">Page Metadata</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(result.metadata).slice(0, 12).map(([key, value]) => (
                      <Badge key={key} variant="outline" className="font-mono text-[9px]">
                        {key}: {value.substring(0, 50)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {/* Content preview */}
              <div>
                <p className="text-[10px] font-mono uppercase text-muted-foreground mb-1.5">
                  Extracted Content ({result.mode} mode)
                </p>
                <div className="rounded-md bg-secondary/50 p-3 max-h-80 overflow-auto">
                  <pre className="whitespace-pre-wrap text-xs font-mono text-foreground">
                    {result.content.substring(0, 5000)}
                    {result.content.length > 5000 && (
                      <span className="text-muted-foreground">
                        {"\n\n"}... [{result.content.length - 5000} more characters]
                      </span>
                    )}
                  </pre>
                </div>
              </div>

              {/* Links preview */}
              {result.links.length > 0 && (
                <div>
                  <p className="text-[10px] font-mono uppercase text-muted-foreground mb-1.5">
                    Extracted Links ({result.links.length})
                  </p>
                  <div className="rounded-md bg-secondary/50 p-3 max-h-40 overflow-auto space-y-1">
                    {result.links.slice(0, 20).map((link, i) => (
                      <div key={i} className="flex items-center gap-2 text-[10px]">
                        <Link2 className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                        <a href={link.href} target="_blank" rel="noopener noreferrer"
                          className="text-primary hover:underline truncate">
                          {link.text || link.href}
                        </a>
                      </div>
                    ))}
                    {result.links.length > 20 && (
                      <p className="text-[10px] text-muted-foreground">... and {result.links.length - 20} more links</p>
                    )}
                  </div>
                </div>
              )}

              {/* Tables preview */}
              {result.tables.length > 0 && (
                <div>
                  <p className="text-[10px] font-mono uppercase text-muted-foreground mb-1.5">
                    Extracted Tables ({result.tables.length} rows)
                  </p>
                  <div className="rounded-md bg-secondary/50 p-3 max-h-40 overflow-auto">
                    <table className="w-full text-[10px] font-mono">
                      <tbody>
                        {result.tables.slice(0, 20).map((row, i) => (
                          <tr key={i} className={i === 0 ? "font-bold" : ""}>
                            {row.map((cell, j) => (
                              <td key={j} className="border border-border/30 px-2 py-1">{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Scrape History */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" /> Scrape History
                {history.length > 0 && <Badge variant="secondary" className="ml-2">{history.length}</Badge>}
              </CardTitle>
              {history.length > 0 && (
                <Button variant="outline" size="sm" onClick={handleClearHistory}>
                  <Trash2 className="h-3 w-3 mr-1" /> Clear
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <div className="text-center py-8">
                <Globe className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No scrape history</p>
                <p className="text-xs text-muted-foreground mt-1">Enter a URL above and click \"Fetch & Analyze\"</p>
              </div>
            ) : (
              <div className="space-y-2">
                {history.map((entry) => (
                  <div key={entry.id}
                    className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2 cursor-pointer hover:bg-secondary/50 transition-colors"
                    onClick={() => { setUrl(entry.url); setMode(entry.mode); }}>
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{entry.title}</p>
                        <p className="text-[10px] text-muted-foreground font-mono truncate">{entry.url}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <Badge variant="outline" className="font-mono text-[9px]">{entry.mode}</Badge>
                      <span className="text-[10px] text-muted-foreground">{entry.wordCount.toLocaleString()} words</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{formatTime(entry.scrapedAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}
