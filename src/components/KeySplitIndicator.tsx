import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Flame, Snowflake } from 'lucide-react';
import type { KeySplitResult } from '@/lib/keySplitter';

interface KeySplitIndicatorProps {
  result: KeySplitResult;
  compact?: boolean;
}

export function KeySplitIndicator({ result, compact = false }: KeySplitIndicatorProps) {
  if (result.is_hot_key) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className="bg-red-500/20 text-red-300 border-red-500/40 gap-1 text-[10px]">
            <Flame className="h-2.5 w-2.5" />
            {!compact && 'HOT KEY'}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="font-mono text-xs max-w-xs">
          <div className="space-y-1">
            <div className="font-bold text-red-400">TRUE HOT KEY — Fast Path</div>
            <div>Reason: {result.hot_key_reason?.replace(/_/g, ' ')}</div>
            <div>Fast-track to: {result.fast_path_stage}</div>
            <div>Priority boost: +{(result.priority_boost * 100).toFixed(0)}%</div>
            <div>Confidence: {(result.classification_confidence * 100).toFixed(0)}%</div>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }
  
  if (compact) return null;
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="text-[10px] text-muted-foreground gap-1">
          <Snowflake className="h-2.5 w-2.5" />
          COLD
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top" className="font-mono text-xs">
        <div className="space-y-1">
          <div>Standard processing path</div>
          {result.cold_key_deferral_minutes > 0 && (
            <div>Deferred: {result.cold_key_deferral_minutes} min</div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
