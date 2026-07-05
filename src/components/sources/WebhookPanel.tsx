import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Webhook,
  Copy,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Clock,
  CheckCircle2,
  XCircle,
  FileJson,
  Filter,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";

const WEBHOOK_LOG_KEY = "mdg_webhook_log";
const WEBHOOK_CONFIG_KEY = "mdg_webhook_config";

interface WebhookConfig {
  endpointId: string;
  secret: string;
  eventFilter: string;
  payloadFormat: "json" | "xml" | "form-urlencoded";
  transformTemplate: string;
}

interface WebhookDelivery {
  id: string;
  receivedAt: string;
  eventType: string;
  payloadSize: number;
  status: "success" | "error";
  statusCode?: number;
  headers?: Record<string, string>;
  bodyPreview: string;
}

function generateEndpointId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "whk_";
  for (let i = 0; i < 24; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateSecret(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "whsec_";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function getStoredConfig(): WebhookConfig {
  try {
    const raw = localStorage.getItem(WEBHOOK_CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* use default */ }
  return {
    endpointId: generateEndpointId(),
    secret: generateSecret(),
    eventFilter: "",
    payloadFormat: "json",
    transformTemplate: "",
  };
}

function saveConfig(config: WebhookConfig): void {
  localStorage.setItem(WEBHOOK_CONFIG_KEY, JSON.stringify(config));
}

function getDeliveryLog(): WebhookDelivery[] {
  try {
    const raw = localStorage.getItem(WEBHOOK_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function addDeliveryToLog(delivery: WebhookDelivery): void {
  const log = getDeliveryLog();
  log.unshift(delivery);
  localStorage.setItem(WEBHOOK_LOG_KEY, JSON.stringify(log.slice(0, 100)));
}

function clearDeliveryLog(): void {
  localStorage.removeItem(WEBHOOK_LOG_KEY);
}

export default function WebhookPanel() {
  const [config, setConfig] = useState<WebhookConfig>(getStoredConfig);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>(getDeliveryLog);
  const [showSecret, setShowSecret] = useState(false);
  const [expandedDelivery, setExpandedDelivery] = useState<string | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  useEffect(() => {
    saveConfig(config);
  }, [config]);

  const webhookUrl = `${window.location.origin}/api/webhooks/${config.endpointId}`;

  const copyToClipboard = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard`);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      toast.success(`${label} copied to clipboard`);
    }
  }, []);

  const regenerateSecret = () => {
    const newSecret = generateSecret();
    setConfig((prev) => ({ ...prev, secret: newSecret }));
    toast.success("Webhook secret regenerated");
  };

  const regenerateEndpoint = () => {
    const newId = generateEndpointId();
    setConfig((prev) => ({ ...prev, endpointId: newId }));
    toast.success("Webhook endpoint regenerated");
  };

  const handleTestWebhook = async () => {
    setTestLoading(true);
    try {
      const testDelivery: WebhookDelivery = {
        id: `del_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        receivedAt: new Date().toISOString(),
        eventType: "test.ping",
        payloadSize: 142,
        status: "success",
        statusCode: 200,
        headers: {
          "content-type": "application/json",
          "x-webhook-signature": `sha256=${config.secret.substring(0, 16)}...`,
          "x-webhook-event": "test.ping",
          "x-webhook-delivery": `del_${Date.now()}`,
        },
        bodyPreview: JSON.stringify(
          {
            event: "test.ping",
            timestamp: new Date().toISOString(),
            data: { message: "Webhook test delivery", endpoint_id: config.endpointId },
          },
          null,
          2
        ),
      };
      await new Promise((r) => setTimeout(r, 800));
      addDeliveryToLog(testDelivery);
      setDeliveries(getDeliveryLog());
      toast.success("Test webhook delivered successfully");
    } catch (err: any) {
      toast.error("Test failed: " + err.message);
    } finally {
      setTestLoading(false);
    }
  };

  const handleClearLog = () => {
    clearDeliveryLog();
    setDeliveries([]);
    toast.success("Delivery log cleared");
  };

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  return (
    <ScrollArea className="h-[calc(100vh-220px)]">
      <div className="space-y-6 pr-4">
        {/* Webhook Endpoint */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Webhook className="h-4 w-4" /> Webhook Endpoint
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Endpoint URL</label>
              <div className="flex gap-2">
                <Input value={webhookUrl} readOnly className="bg-secondary border-border font-mono text-xs flex-1" />
                <Button variant="outline" size="sm" onClick={() => copyToClipboard(webhookUrl, "Webhook URL")}>
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                </Button>
                <Button variant="outline" size="sm" onClick={regenerateEndpoint}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> New
                </Button>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Send POST requests to this URL to deliver webhook payloads.
              </p>
            </div>
            <Separator />
            <div>
              <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">
                <ShieldCheck className="inline h-3 w-3 mr-1" />Signing Secret (HMAC-SHA256)
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input type={showSecret ? "text" : "password"} value={config.secret} readOnly
                    className="bg-secondary border-border font-mono text-xs pr-10" />
                  <button type="button" onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <Button variant="outline" size="sm" onClick={() => copyToClipboard(config.secret, "Secret")}>
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                </Button>
                <Button variant="outline" size="sm" onClick={regenerateSecret}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Regenerate
                </Button>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Payloads are signed with HMAC-SHA256. Verify the
                <code className="mx-1 bg-secondary px-1 py-0.5 rounded">X-Webhook-Signature</code> header.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Configuration */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Filter className="h-4 w-4" /> Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Event Type Filter</label>
                <Input value={config.eventFilter}
                  onChange={(e) => setConfig((prev) => ({ ...prev, eventFilter: e.target.value }))}
                  placeholder="alert.*, incident.created, report.new"
                  className="bg-secondary border-border font-mono text-xs" />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Comma-separated event types to accept. Leave empty for all.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Payload Format</label>
                <select value={config.payloadFormat}
                  onChange={(e) => setConfig((prev) => ({ ...prev, payloadFormat: e.target.value as any }))}
                  className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground">
                  <option value="json">JSON (application/json)</option>
                  <option value="xml">XML (application/xml)</option>
                  <option value="form-urlencoded">Form URL-Encoded</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">
                Transform Template (JSONPath)
              </label>
              <Textarea value={config.transformTemplate}
                onChange={(e) => setConfig((prev) => ({ ...prev, transformTemplate: e.target.value }))}
                placeholder="$.data.events[*].{title: $.name, lat: $.location.lat, lng: $.location.lng}"
                className="bg-secondary border-border font-mono text-xs min-h-[80px]" />
              <p className="mt-1 text-[10px] text-muted-foreground">
                JSONPath expression to extract and transform fields from webhook payloads.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleTestWebhook} disabled={testLoading}>
                {testLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Webhook className="h-4 w-4 mr-2" />}
                Send Test Webhook
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Delivery Log */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" /> Recent Deliveries
                {deliveries.length > 0 && <Badge variant="secondary" className="ml-2">{deliveries.length}</Badge>}
              </CardTitle>
              {deliveries.length > 0 && (
                <Button variant="outline" size="sm" onClick={handleClearLog}>
                  <Trash2 className="h-3 w-3 mr-1" /> Clear Log
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {deliveries.length === 0 ? (
              <div className="text-center py-8">
                <Webhook className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No webhook deliveries yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Send a POST request to your endpoint URL or click \"Send Test Webhook\"
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {deliveries.map((delivery) => (
                  <div key={delivery.id}
                    className="rounded-md border border-border bg-secondary/30 p-3 cursor-pointer hover:bg-secondary/50 transition-colors"
                    onClick={() => setExpandedDelivery(expandedDelivery === delivery.id ? null : delivery.id)}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {delivery.status === "success" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-destructive" />
                        )}
                        <Badge variant="outline" className="font-mono text-[10px]">{delivery.eventType}</Badge>
                        {delivery.statusCode && (
                          <span className="text-[10px] font-mono text-muted-foreground">{delivery.statusCode}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                        <span>{delivery.payloadSize}B</span>
                        <span>{formatTime(delivery.receivedAt)}</span>
                      </div>
                    </div>
                    {expandedDelivery === delivery.id && (
                      <div className="mt-3 space-y-2">
                        {delivery.headers && (
                          <div>
                            <p className="text-[10px] font-mono uppercase text-muted-foreground mb-1">Headers</p>
                            <pre className="text-[10px] font-mono text-muted-foreground bg-secondary p-2 rounded overflow-auto max-h-20">
                              {JSON.stringify(delivery.headers, null, 2)}
                            </pre>
                          </div>
                        )}
                        <div>
                          <p className="text-[10px] font-mono uppercase text-muted-foreground mb-1">Payload</p>
                          <pre className="text-[10px] font-mono text-muted-foreground bg-secondary p-2 rounded overflow-auto max-h-40">
                            {delivery.bodyPreview}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Integration Guide */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <FileJson className="h-4 w-4" /> Integration Guide
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md bg-secondary/50 p-4 font-mono text-xs space-y-3">
              <p className="text-muted-foreground">Send webhooks using cURL:</p>
              <pre className="whitespace-pre-wrap text-[10px] text-foreground bg-secondary p-3 rounded overflow-auto">
{`curl -X POST ${webhookUrl} \\
  -H "Content-Type: application/json" \\
  -H "X-Webhook-Event: alert.created" \\
  -H "X-Webhook-Signature: sha256=<hmac_hex>" \\
  -d '{
    "event": "alert.created",
    "timestamp": "${new Date().toISOString()}",
    "data": {
      "title": "Suspicious vessel detected",
      "latitude": 25.7617,
      "longitude": -80.1918,
      "severity": "high"
    }
  }'`}
              </pre>
              <Separator />
              <p className="text-muted-foreground">Verify signature (Node.js):</p>
              <pre className="whitespace-pre-wrap text-[10px] text-foreground bg-secondary p-3 rounded overflow-auto">
{`const crypto = require('crypto');
const signature = req.headers['x-webhook-signature'];
const expected = 'sha256=' + crypto
  .createHmac('sha256', '${showSecret ? config.secret : "<your_secret>"}')
  .update(JSON.stringify(req.body))
  .digest('hex');
const valid = crypto.timingSafeEqual(
  Buffer.from(signature), Buffer.from(expected)
);`}
              </pre>
            </div>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}
