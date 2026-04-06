import { useDDILStatus } from '@/hooks/useDDILStatus';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Wifi, WifiOff, Signal, Radio, Satellite, Activity } from 'lucide-react';

// Colors for network status
const STATUS_STYLES = {
  connected: { color: 'text-emerald-400', bg: 'bg-emerald-500/20 border-emerald-500/30', label: 'CONNECTED' },
  degraded: { color: 'text-amber-400', bg: 'bg-amber-500/20 border-amber-500/30', label: 'DEGRADED' },
  intermittent: { color: 'text-orange-400', bg: 'bg-orange-500/20 border-orange-500/30', label: 'INTERMITTENT' },
  disconnected: { color: 'text-red-400', bg: 'bg-red-500/20 border-red-500/30', label: 'DISCONNECTED' },
};

const LINK_ICONS = {
  satcom: Satellite,
  hf_radio: Radio,
  mesh: Activity,
  lte: Signal,
  wifi: Wifi,
  wired: Activity,
};

export function DDILStatusBar() {
  const { networkState } = useDDILStatus(2000);
  const style = STATUS_STYLES[networkState.status];
  const LinkIcon = LINK_ICONS[networkState.link_type] || Wifi;
  
  const isDisconnected = networkState.status === 'disconnected';
  
  return (
    <div className={`flex items-center gap-3 rounded-lg border px-3 py-1.5 text-xs font-mono ${style.bg}`}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5">
            {isDisconnected ? (
              <WifiOff className={`h-3.5 w-3.5 ${style.color} ${networkState.status === 'intermittent' ? 'animate-pulse' : ''}`} />
            ) : (
              <LinkIcon className={`h-3.5 w-3.5 ${style.color} ${networkState.status === 'intermittent' ? 'animate-pulse' : ''}`} />
            )}
            <span className={`font-bold ${style.color}`}>{style.label}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="font-mono text-xs">
          <div className="space-y-1">
            <div>Link: {networkState.link_type.toUpperCase()}</div>
            <div>Bandwidth: {networkState.bandwidth_kbps.toFixed(0)} kbps</div>
            <div>Latency: {networkState.latency_ms.toFixed(0)} ms</div>
            <div>Packet Loss: {networkState.packet_loss_pct.toFixed(1)}%</div>
            <div>Last HB: {new Date(networkState.last_heartbeat).toLocaleTimeString()}</div>
          </div>
        </TooltipContent>
      </Tooltip>
      
      <div className="flex items-center gap-2 text-muted-foreground">
        <span>{networkState.bandwidth_kbps.toFixed(0)} kbps</span>
        <span className="text-muted-foreground/50">|</span>
        <span>{networkState.latency_ms.toFixed(0)}ms</span>
        {networkState.packet_loss_pct > 5 && (
          <>
            <span className="text-muted-foreground/50">|</span>
            <span className="text-destructive">{networkState.packet_loss_pct.toFixed(1)}% loss</span>
          </>
        )}
      </div>
      
      <Badge variant="outline" className={`text-[9px] ${style.bg}`}>
        {networkState.link_type.toUpperCase()}
      </Badge>
    </div>
  );
}
