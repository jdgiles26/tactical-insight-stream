import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  Loader2,
  Trash2,
  Zap,
  CheckCircle2,
  XCircle,
  Globe,
  Key,
  ShieldCheck,
  Network,
  MapPin,
  Clock,
  RefreshCw,
  FileJson,
  Send,
} from "lucide-react";
import { useCreateDataSource } from "@/hooks/useDataSources";
import { toast } from "sonner";

const SOURCE_TYPE_OPTIONS = [
  { value: "rtsp_camera", label: "RTSP Camera", description: "IP cameras and video surveillance streams" },
  { value: "audio_feed", label: "Audio Feed", description: "Radio comms, distress calls, VHF/UHF" },
  { value: "document", label: "Document", description: "PDF reports, logs, manifests" },
  { value: "sensor_telemetry", label: "Sensor Telemetry", description: "Buoy data, AIS, radar, sonar" },
  { value: "rss_feed", label: "RSS Feed", description: "Maritime alerts, weather, news" },
  { value: "ais_tracker", label: "AIS Vessel Tracker", description: "Live AIS vessel positions" },
  { value: "opensky", label: "OpenSky Aircraft", description: "Live aircraft tracking via OpenSky" },
  { value: "webhook", label: "Webhook", description: "Incoming webhook receiver endpoint" },
  { value: "rest_api", label: "REST API", description: "Generic RESTful API source" },
  { value: "graphql", label: "GraphQL", description: "GraphQL endpoint subscription" },
  { value: "websocket", label: "WebSocket", description: "Real-time WebSocket data stream" },
  { value: "mqtt", label: "MQTT", description: "MQTT broker topic subscription" },
  { value: "grpc_stream", label: "gRPC Stream", description: "gRPC bidirectional streaming" },
  { value: "radio_scanner", label: "Radio Scanner", description: "SDR / radio frequency scanner" },
  { value: "sonar_array", label: "Sonar Array", description: "Underwater sonar sensor array" },
  { value: "radar_feed", label: "Radar Feed", description: "Radar data feed (marine, air)" },
  { value: "weather_station", label: "Weather Station", description: "Weather station telemetry" },
  { value: "seismic_sensor", label: "Seismic Sensor", description: "Seismograph data feed" },
  { value: "tide_gauge", label: "Tide Gauge", description: "Tide and water level sensors" },
] as const;

const AUTH_TYPE_OPTIONS = [
  { value: "none", label: "None" },
  { value: "api_key", label: "API Key" },
  { value: "basic", label: "Basic Auth" },
  { value: "bearer", label: "Bearer Token" },
  { value: "oauth2", label: "OAuth 2.0" },
  { value: "certificate", label: "Certificate" },
  { value: "webhook_secret", label: "Webhook Secret" },
] as const;

type AuthType = (typeof AUTH_TYPE_OPTIONS)[number]["value"];

interface CustomHeader {
  key: string;
  value: string;
}

interface TestResult {
  success: boolean;
  status?: number;
  statusText?: string;
  responseTime?: number;
  error?: string;
  bodyPreview?: string;
}

export default function ApiConnectionForm() {
  const [name, setName] = useState("");
  const [sourceType, setSourceType] = useState("rest_api");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [authType, setAuthType] = useState<AuthType>("none");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyHeader, setApiKeyHeader] = useState("X-API-Key");
  const [basicUsername, setBasicUsername] = useState("");
  const [basicPassword, setBasicPassword] = useState("");
  const [bearerToken, setBearerToken] = useState("");
  const [oauth2ClientId, setOauth2ClientId] = useState("");
  const [oauth2ClientSecret, setOauth2ClientSecret] = useState("");
  const [oauth2TokenUrl, setOauth2TokenUrl] = useState("");
  const [oauth2Scope, setOauth2Scope] = useState("");
  const [certPlaceholder, setCertPlaceholder] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [pollingInterval, setPollingInterval] = useState("60");
  const [maxRetries, setMaxRetries] = useState("5");
  const [retryDelay, setRetryDelay] = useState("30");
  const [customHeaders, setCustomHeaders] = useState<CustomHeader[]>([]);
  const [requestBody, setRequestBody] = useState("");
  const [jsonPathMapping, setJsonPathMapping] = useState("");
  const [defaultLat, setDefaultLat] = useState("");
  const [defaultLng, setDefaultLng] = useState("");
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const createSource = useCreateDataSource();

  const addHeader = () => setCustomHeaders((prev) => [...prev, { key: "", value: "" }]);
  const removeHeader = (index: number) => setCustomHeaders((prev) => prev.filter((_, i) => i !== index));
  const updateHeader = (index: number, field: "key" | "value", val: string) => {
    setCustomHeaders((prev) => prev.map((h, i) => (i === index ? { ...h, [field]: val } : h)));
  };

  const buildAuthHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = {};
    switch (authType) {
      case "api_key":
        if (apiKey) headers[apiKeyHeader || "X-API-Key"] = apiKey;
        break;
      case "basic":
        if (basicUsername) headers["Authorization"] = `Basic ${btoa(`${basicUsername}:${basicPassword}`)}`;
        break;
      case "bearer":
        if (bearerToken) headers["Authorization"] = `Bearer ${bearerToken}`;
        break;
      default:
        break;
    }
    customHeaders.forEach((h) => { if (h.key.trim()) headers[h.key.trim()] = h.value; });
    return headers;
  }, [authType, apiKey, apiKeyHeader, basicUsername, basicPassword, bearerToken, customHeaders]);

  const buildAuthCredentials = (): Record<string, unknown> => {
    switch (authType) {
      case "api_key": return { api_key: apiKey, header_name: apiKeyHeader };
      case "basic": return { username: basicUsername, password: basicPassword };
      case "bearer": return { token: bearerToken };
      case "oauth2": return { client_id: oauth2ClientId, client_secret: oauth2ClientSecret, token_url: oauth2TokenUrl, scope: oauth2Scope };
      case "certificate": return { cert_reference: certPlaceholder };
      case "webhook_secret": return { secret: webhookSecret };
      default: return {};
    }
  };

  const handleTestConnection = async () => {
    if (!endpointUrl) { toast.error("Enter an endpoint URL to test"); return; }
    setTestLoading(true);
    setTestResult(null);
    const start = performance.now();
    try {
      const headers = buildAuthHeaders();
      headers["Accept"] = "application/json, text/plain, */*";
      const fetchOptions: RequestInit = { method: requestBody.trim() ? "POST" : "GET", headers };
      if (requestBody.trim()) { fetchOptions.body = requestBody; headers["Content-Type"] = "application/json"; }
      let res: Response;
      try { res = await fetch(endpointUrl, fetchOptions); }
      catch { res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(endpointUrl)}`); }
      const elapsed = Math.round(performance.now() - start);
      const text = await res.text();
      setTestResult({ success: res.ok, status: res.status, statusText: res.statusText, responseTime: elapsed, bodyPreview: text.substring(0, 500) });
      if (res.ok) toast.success(`Connection successful (${res.status} in ${elapsed}ms)`);
      else toast.error(`Connection failed: ${res.status} ${res.statusText}`);
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - start);
      setTestResult({ success: false, responseTime: elapsed, error: err.message || "Connection failed" });
      toast.error("Connection test failed: " + err.message);
    } finally { setTestLoading(false); }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("Name is required"); return; }
    const headerObj: Record<string, string> = {};
    customHeaders.forEach((h) => { if (h.key.trim()) headerObj[h.key.trim()] = h.value; });
    createSource.mutate({
      name: name.trim(), source_type: sourceType, endpoint_url: endpointUrl || null,
      auth_type: authType, auth_credentials: buildAuthCredentials(), status: "inactive",
      max_retries: parseInt(maxRetries) || 5, retry_delay_seconds: parseInt(retryDelay) || 30,
      config: {
        polling_interval_seconds: parseInt(pollingInterval) || 60, custom_headers: headerObj,
        request_body_template: requestBody || null, response_jsonpath: jsonPathMapping || null,
        ...(defaultLat && defaultLng ? { default_latitude: parseFloat(defaultLat), default_longitude: parseFloat(defaultLng) } : {}),
      },
    } as any, {
      onSuccess: () => { toast.success(`Source "${name}" created successfully`); resetForm(); },
      onError: (err: any) => { toast.error("Failed to create source: " + err.message); },
    });
  };

  const resetForm = () => {
    setName(""); setSourceType("rest_api"); setEndpointUrl(""); setAuthType("none");
    setApiKey(""); setApiKeyHeader("X-API-Key"); setBasicUsername(""); setBasicPassword("");
    setBearerToken(""); setOauth2ClientId(""); setOauth2ClientSecret(""); setOauth2TokenUrl("");
    setOauth2Scope(""); setCertPlaceholder(""); setWebhookSecret(""); setPollingInterval("60");
    setMaxRetries("5"); setRetryDelay("30"); setCustomHeaders([]); setRequestBody("");
    setJsonPathMapping(""); setDefaultLat(""); setDefaultLng(""); setTestResult(null);
  };

  const lbl = "mb-1 block text-xs font-mono uppercase text-muted-foreground";

  const renderAuthFields = () => {
    switch (authType) {
      case "api_key":
        return (
          <div className="grid grid-cols-2 gap-4">
            <div><label className={lbl}><Key className="inline h-3 w-3 mr-1" />API Key</label>
              <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." className="bg-secondary border-border font-mono text-xs" /></div>
            <div><label className={lbl}>Header Name</label>
              <Input value={apiKeyHeader} onChange={(e) => setApiKeyHeader(e.target.value)} placeholder="X-API-Key" className="bg-secondary border-border font-mono text-xs" /></div>
          </div>
        );
      case "basic":
        return (
          <div className="grid grid-cols-2 gap-4">
            <div><label className={lbl}>Username</label>
              <Input value={basicUsername} onChange={(e) => setBasicUsername(e.target.value)} placeholder="username" className="bg-secondary border-border font-mono text-xs" /></div>
            <div><label className={lbl}>Password</label>
              <Input type="password" value={basicPassword} onChange={(e) => setBasicPassword(e.target.value)} placeholder="••••••••" className="bg-secondary border-border font-mono text-xs" /></div>
          </div>
        );
      case "bearer":
        return (
          <div><label className={lbl}><ShieldCheck className="inline h-3 w-3 mr-1" />Bearer Token</label>
            <Input type="password" value={bearerToken} onChange={(e) => setBearerToken(e.target.value)} placeholder="eyJhbGciOi..." className="bg-secondary border-border font-mono text-xs" /></div>
        );
      case "oauth2":
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div><label className={lbl}>Client ID</label>
                <Input value={oauth2ClientId} onChange={(e) => setOauth2ClientId(e.target.value)} placeholder="client_id" className="bg-secondary border-border font-mono text-xs" /></div>
              <div><label className={lbl}>Client Secret</label>
                <Input type="password" value={oauth2ClientSecret} onChange={(e) => setOauth2ClientSecret(e.target.value)} placeholder="••••••••" className="bg-secondary border-border font-mono text-xs" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={lbl}>Token URL</label>
                <Input value={oauth2TokenUrl} onChange={(e) => setOauth2TokenUrl(e.target.value)} placeholder="https://auth.example.com/oauth/token" className="bg-secondary border-border font-mono text-xs" /></div>
              <div><label className={lbl}>Scope</label>
                <Input value={oauth2Scope} onChange={(e) => setOauth2Scope(e.target.value)} placeholder="read write" className="bg-secondary border-border font-mono text-xs" /></div>
            </div>
          </div>
        );
      case "certificate":
        return (
          <div><label className={lbl}>Certificate Reference</label>
            <Input value={certPlaceholder} onChange={(e) => setCertPlaceholder(e.target.value)} placeholder="Path or reference to client certificate (.pem, .p12)" className="bg-secondary border-border font-mono text-xs" />
            <p className="mt-1 text-[10px] text-muted-foreground">Upload handled server-side. Enter the path or vault reference.</p></div>
        );
      case "webhook_secret":
        return (
          <div><label className={lbl}><ShieldCheck className="inline h-3 w-3 mr-1" />HMAC Secret Key</label>
            <Input type="password" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder="whsec_..." className="bg-secondary border-border font-mono text-xs" />
            <p className="mt-1 text-[10px] text-muted-foreground">Used for HMAC-SHA256 payload verification.</p></div>
        );
      default:
        return <p className="text-xs text-muted-foreground italic">No authentication required.</p>;
    }
  };

  return (
    <ScrollArea className="h-[calc(100vh-220px)]">
      <form onSubmit={handleSubmit} className="space-y-6 pr-4">
        {/* Source Configuration */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Globe className="h-4 w-4" /> Source Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><label className={lbl}>Name *</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Port Camera Alpha-1" className="bg-secondary border-border" required /></div>
              <div><label className={lbl}>Source Type</label>
                <select value={sourceType} onChange={(e) => setSourceType(e.target.value)} className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground">
                  {SOURCE_TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label} — {t.description}</option>)}
                </select></div>
              <div><label className={lbl}>Endpoint URL</label>
                <Input value={endpointUrl} onChange={(e) => setEndpointUrl(e.target.value)} placeholder="https://api.example.com/v1/data" className="bg-secondary border-border font-mono text-xs" /></div>
            </div>
          </CardContent>
        </Card>

        {/* Authentication */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Key className="h-4 w-4" /> Authentication
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div><label className={lbl}>Auth Type</label>
              <select value={authType} onChange={(e) => setAuthType(e.target.value as AuthType)} className="w-full max-w-xs rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground">
                {AUTH_TYPE_OPTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select></div>
            <Separator />
            {renderAuthFields()}
          </CardContent>
        </Card>

        {/* Polling & Retry */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" /> Polling & Retry
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div><label className={lbl}>Polling Interval (sec)</label>
                <Input type="number" min="1" value={pollingInterval} onChange={(e) => setPollingInterval(e.target.value)} className="bg-secondary border-border" /></div>
              <div><label className={lbl}>Max Retries</label>
                <Input type="number" min="0" value={maxRetries} onChange={(e) => setMaxRetries(e.target.value)} className="bg-secondary border-border" /></div>
              <div><label className={lbl}>Retry Delay (sec)</label>
                <Input type="number" min="1" value={retryDelay} onChange={(e) => setRetryDelay(e.target.value)} className="bg-secondary border-border" /></div>
            </div>
          </CardContent>
        </Card>

        {/* Custom Headers */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Network className="h-4 w-4" /> Custom Headers
              </CardTitle>
              <Button type="button" size="sm" variant="outline" onClick={addHeader}>
                <Plus className="h-3 w-3 mr-1" /> Add Header
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {customHeaders.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No custom headers configured.</p>
            ) : (
              <div className="space-y-2">
                {customHeaders.map((header, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <Input value={header.key} onChange={(e) => updateHeader(idx, "key", e.target.value)} placeholder="Header name" className="bg-secondary border-border font-mono text-xs flex-1" />
                    <Input value={header.value} onChange={(e) => updateHeader(idx, "value", e.target.value)} placeholder="Header value" className="bg-secondary border-border font-mono text-xs flex-1" />
                    <Button type="button" size="sm" variant="outline" className="text-destructive hover:bg-destructive/10 shrink-0" onClick={() => removeHeader(idx)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Request & Response */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <FileJson className="h-4 w-4" /> Request & Response
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div><label className={lbl}>Request Body Template (JSON, for POST sources)</label>
              <Textarea value={requestBody} onChange={(e) => setRequestBody(e.target.value)} placeholder={'{\n  "query": "...",\n  "params": {}\n}'} className="bg-secondary border-border font-mono text-xs min-h-[100px]" /></div>
            <div><label className={lbl}>Response JSONPath Mapping</label>
              <Input value={jsonPathMapping} onChange={(e) => setJsonPathMapping(e.target.value)} placeholder="$.data.results[*] or $.items" className="bg-secondary border-border font-mono text-xs" />
              <p className="mt-1 text-[10px] text-muted-foreground">JSONPath expression to extract data from the API response.</p></div>
          </CardContent>
        </Card>

        {/* Geo-tagging */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <MapPin className="h-4 w-4" /> Default Geo-tagging
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={lbl}>Default Latitude</label>
                <Input type="number" step="any" value={defaultLat} onChange={(e) => setDefaultLat(e.target.value)} placeholder="34.0522" className="bg-secondary border-border" /></div>
              <div><label className={lbl}>Default Longitude</label>
                <Input type="number" step="any" value={defaultLng} onChange={(e) => setDefaultLng(e.target.value)} placeholder="-118.2437" className="bg-secondary border-border" /></div>
            </div>
          </CardContent>
        </Card>

        {/* Test Connection */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Zap className="h-4 w-4" /> Test Connection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button type="button" variant="outline" onClick={handleTestConnection} disabled={testLoading || !endpointUrl} className="w-full">
              {testLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
              {testLoading ? "Testing..." : "Test Connection"}
            </Button>
            {testResult && (
              <div className={`rounded-md p-3 text-xs font-mono space-y-1 ${testResult.success ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-destructive/10 border border-destructive/30"}`}>
                <div className="flex items-center gap-2">
                  {testResult.success ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-destructive" />}
                  <span className={testResult.success ? "text-emerald-400" : "text-destructive"}>
                    {testResult.success ? "Connection Successful" : "Connection Failed"}
                  </span>
                </div>
                {testResult.status && <p>Status: {testResult.status} {testResult.statusText}</p>}
                {testResult.responseTime !== undefined && <p>Response time: {testResult.responseTime}ms</p>}
                {testResult.error && <p className="text-destructive">Error: {testResult.error}</p>}
                {testResult.bodyPreview && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Response preview</summary>
                    <pre className="mt-1 whitespace-pre-wrap text-[10px] text-muted-foreground max-h-40 overflow-auto bg-secondary/50 p-2 rounded">{testResult.bodyPreview}</pre>
                  </details>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3 pb-6">
          <Button type="submit" disabled={createSource.isPending || !name.trim()} className="flex-1">
            {createSource.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Create Data Source
          </Button>
          <Button type="button" variant="outline" onClick={resetForm}>
            <RefreshCw className="mr-2 h-4 w-4" /> Reset
          </Button>
        </div>
      </form>
    </ScrollArea>
  );
}
