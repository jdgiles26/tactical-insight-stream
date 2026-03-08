import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDataProductCorrelations, useCreateManualCorrelation, useDeleteManualCorrelation, useDeleteDataProduct } from "@/hooks/useCorrelations";
import { useSearchDataProducts } from "@/hooks/useDataProducts";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  Link2, Unlink, Search, AlertTriangle, Eye, Trash2,
  BrainCircuit, User, Percent, ArrowRight, ExternalLink, X,
} from "lucide-react";

interface Props {
  productId: string | null;
  productTitle?: string;
  onClose: () => void;
}

export default function CorrelationPanel({ productId, productTitle, onClose }: Props) {
  const { data, isLoading } = useDataProductCorrelations(productId);
  const createLink = useCreateManualCorrelation();
  const deleteLink = useDeleteManualCorrelation();
  const deleteProduct = useDeleteDataProduct();
  const [searchQuery, setSearchQuery] = useState("");
  const [justification, setJustification] = useState("");
  const { data: searchResults = [] } = useSearchDataProducts(searchQuery);

  if (!productId) return null;

  const breakdown = data?.breakdown || { auto_alerts: 0, detections: 0, manual_links: 0, total: 0, auto_pct: 0, detection_pct: 0, manual_pct: 0 };

  const handleLink = (targetId: string) => {
    createLink.mutate(
      { source_product_id: productId, target_product_id: targetId, justification: justification || undefined },
      {
        onSuccess: () => { toast.success("Manual correlation created"); setSearchQuery(""); setJustification(""); },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  const handleDelete = () => {
    if (confirm("Permanently delete this data product and all related data?")) {
      deleteProduct.mutate(productId, {
        onSuccess: () => { toast.success("Data product deleted"); onClose(); },
        onError: (err) => toast.error(err.message),
      });
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-[520px] border-l border-border bg-card shadow-xl flex flex-col animate-slide-in">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold truncate">{productTitle || "Correlation Details"}</h3>
          <p className="text-[10px] font-mono text-muted-foreground truncate">{productId}</p>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="text-destructive h-7" onClick={handleDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7" onClick={onClose}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Correlation Breakdown */}
          <Card>
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-xs font-mono flex items-center gap-1.5">
                <Percent className="h-3 w-3" /> Correlation Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 space-y-2">
              <div className="flex items-center gap-2">
                <BrainCircuit className="h-3 w-3 text-primary shrink-0" />
                <span className="text-[10px] font-mono w-24">Auto Alerts</span>
                <Progress value={breakdown.auto_pct} className="flex-1 h-2" />
                <span className="text-[10px] font-mono w-12 text-right">{breakdown.auto_alerts} ({breakdown.auto_pct}%)</span>
              </div>
              <div className="flex items-center gap-2">
                <Eye className="h-3 w-3 text-accent shrink-0" />
                <span className="text-[10px] font-mono w-24">Detections</span>
                <Progress value={breakdown.detection_pct} className="flex-1 h-2" />
                <span className="text-[10px] font-mono w-12 text-right">{breakdown.detections} ({breakdown.detection_pct}%)</span>
              </div>
              <div className="flex items-center gap-2">
                <User className="h-3 w-3 text-warning shrink-0" />
                <span className="text-[10px] font-mono w-24">Manual Links</span>
                <Progress value={breakdown.manual_pct} className="flex-1 h-2" />
                <span className="text-[10px] font-mono w-12 text-right">{breakdown.manual_links} ({breakdown.manual_pct}%)</span>
              </div>
              <div className="text-[10px] text-muted-foreground font-mono pt-1 border-t border-border">
                Total signals: {breakdown.total}
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="related">
            <TabsList className="w-full">
              <TabsTrigger value="related" className="flex-1 text-[10px]">Related ({data?.relatedProducts?.length || 0})</TabsTrigger>
              <TabsTrigger value="alerts" className="flex-1 text-[10px]">Alerts ({data?.alerts?.length || 0})</TabsTrigger>
              <TabsTrigger value="detections" className="flex-1 text-[10px]">Detections ({data?.detections?.length || 0})</TabsTrigger>
              <TabsTrigger value="manual" className="flex-1 text-[10px]">Manual ({data?.manualLinks?.length || 0})</TabsTrigger>
            </TabsList>

            {/* Related Products */}
            <TabsContent value="related" className="space-y-2 mt-2">
              {(data?.relatedProducts || []).length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No correlated data products found</p>
              ) : (
                data?.relatedProducts.map((rp: any) => (
                  <div key={rp.id} className="rounded-md border border-border p-2.5 space-y-1 hover:bg-secondary/30">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium truncate flex-1">{rp.title}</span>
                      <Badge variant="outline" className="text-[9px] ml-1">{rp.source_type}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {rp.shared_terms?.map((t: any, i: number) => (
                        <Badge key={i} variant="secondary" className="text-[9px] gap-0.5">
                          {t.term} <span className="text-muted-foreground">{(Number(t.score) * 100).toFixed(0)}%</span>
                        </Badge>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {rp.source_identifier} • {formatDistanceToNow(new Date(rp.created_at), { addSuffix: true })}
                    </p>
                  </div>
                ))
              )}
            </TabsContent>

            {/* Alerts */}
            <TabsContent value="alerts" className="space-y-2 mt-2">
              {(data?.alerts || []).map((a: any) => (
                <div key={a.id} className="rounded-md border border-border p-2.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="h-3 w-3 text-warning" />
                      <span className="text-xs font-medium">{a.matched_term}</span>
                      <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{a.matched_label}</span>
                    </div>
                    <Badge variant={a.match_type === "exact" ? "default" : "secondary"} className="text-[9px]">
                      {a.match_type}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                    <span>Score: {(Number(a.match_score) * 100).toFixed(0)}%</span>
                    <span>•</span>
                    <span>{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</span>
                  </div>
                </div>
              ))}
            </TabsContent>

            {/* Detections */}
            <TabsContent value="detections" className="space-y-2 mt-2">
              {(data?.detections || []).map((d) => (
                <div key={d.id} className="rounded-md border border-border p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{d.label}</span>
                    <Badge variant="outline" className="text-[9px]">{d.detector_type}</Badge>
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground mt-1">
                    Confidence: {d.confidence ? (Number(d.confidence) * 100).toFixed(0) + "%" : "—"}
                  </div>
                </div>
              ))}
            </TabsContent>

            {/* Manual Correlations */}
            <TabsContent value="manual" className="space-y-3 mt-2">
              {(data?.manualLinks || []).map((m) => (
                <div key={m.id} className="rounded-md border border-border p-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium">{m.correlation_type}</p>
                    {m.justification && <p className="text-[10px] text-muted-foreground">{m.justification}</p>}
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 text-destructive" onClick={() => deleteLink.mutate(m.id)}>
                    <Unlink className="h-3 w-3" />
                  </Button>
                </div>
              ))}

              {/* Manual link form */}
              <Card>
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-xs font-mono flex items-center gap-1.5">
                    <Link2 className="h-3 w-3" /> Create Manual Correlation
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search data products to link..."
                      className="h-7 text-xs pl-7 bg-secondary"
                    />
                  </div>
                  <Input
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    placeholder="Justification (optional)"
                    className="h-7 text-xs bg-secondary"
                  />
                  {searchQuery && searchResults
                    .filter((r) => r.id !== productId)
                    .slice(0, 5)
                    .map((r) => (
                      <div key={r.id} className="flex items-center justify-between rounded-md border border-border px-2 py-1.5 hover:bg-secondary/50">
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-medium truncate">{r.title}</p>
                          <p className="text-[9px] text-muted-foreground font-mono">{r.source_type}</p>
                        </div>
                        <Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={() => handleLink(r.id)}>
                          <Link2 className="h-3 w-3 mr-0.5" /> Link
                        </Button>
                      </div>
                    ))}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}
