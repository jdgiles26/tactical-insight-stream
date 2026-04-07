import { useDDILStatus } from '@/hooks/useDDILStatus';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Wifi, WifiOff, Activity } from 'lucide-react';

const STATUS_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  connected:     { color: 'text-emerald-400', bg: 'bg-emerald-500/20 border-emerald-500/30', label: 'ONLINE' },
  degraded:      { color: 'text-amber-400',   bg: 'bg-amber-500/20 border-amber-500/30',   label: 'DEGRADED' },
  intermittent:  { color: 'text-orange-400',  bg: 'bg-orange-500/20 border-orange-500/30',  label: 'INTERMITTENT' },
  disconnected:  { color: 'text-red-400',     bg: 'bg-red-500/20 border-red-500/30',        label: 'OFFLINE' },
};

export function DDILStatusBar() {
  const { networkState, queueSummary } = useDDILStatus();
  const style = STATUS_STYLES[networkState.status] || STATUS_STYLES.connected;

  const lastHB = networkState.last_heartbeat
    ? new Date(networkState.last_heartbeat).toLocaleTimeString()
    : 'never';

  return (
    <div className={`flex flex-col gap-1 rounded-lg border px-3 py-1.5 text-xs font-mono ${style.bg}`}>
      {/* Top row: status + metrics */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2">
            {networkState.online ? (
              <Wifi className={`h-3.5 w-3.5 shrink-0 ${style.color} ${
                networkState.status === 'intermittent' ? 'animate-pulse' : ''
              }`} />
            ) : (
              <WifiOff className={`h-3.5 w-3.5 shrink-0 ${style.color}`} />
            )}
            <span className={`font-bold ${style.color}`}>{style.label}</span>
            <span className="text-muted-foreground ml-auto">
              {networkState.bandwidth_kbps > 0
                ? `${networkState.bandwidth_kbps >= 1000
                    ? (networkState.bandwidth_kbps / 1000).toFixed(1) + ' Mbps'
                    : networkState.bandwidth_kbps + ' kbps'}`
                : '\u2014'}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="font-mono text-xs">
          <div className="space-y-1">
            <div>Status: {networkState.status}</div>
            <div>Bandwidth: {networkState.bandwidth_kbps} kbps</div>
            <div>RTT: {networkState.latency_ms} ms</div>
            <div>Effective: {networkState.effective_type}</div>
            <div>Connection: {networkState.connection_type}</div>
            <div>Last heartbeat: {lastHB}</div>
            {networkState.consecutive_failures > 0 && (
              <div className="text-destructive">
                Failed probes: {networkState.consecutive_failures}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>

      {/* Bottom row: RTT + effective type + queue depth */}
      <div className="flex items-center gap-2 text-muted-foreground">
        {networkState.latency_ms > 0 && (
          <span>{networkState.latency_ms}ms</span>
        )}
        <Badge variant="outline" className={`text-[8px] px-1 py-0 ${style.bg}`}>
          {networkState.effective_type.toUpperCase()}
        </Badge>
        {queueSummary.total > 0 && (
          <span className="ml-auto">
            <Activity className="inline h-2.5 w-2.5 mr-0.5" />
            {queueSummary.total} queued
          </span>
        )}
      </div>
    </div>
  );
}
