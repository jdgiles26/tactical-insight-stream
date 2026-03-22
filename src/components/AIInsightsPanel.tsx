import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, MapPin, TrendingUp, AlertTriangle, Clock } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface AIInsights {
  ai_summary?: string;
  ai_executive_summary?: string;
  ai_scene_description?: string;
  ai_entities?: string[];
  ai_sentiment?: "positive" | "negative" | "neutral" | "mixed";
  ai_location_prediction?: {
    description: string;
    confidence: number;
    coordinates?: { lat: number; lon: number };
  };
  ai_direction_of_travel?: string;
  ai_intent_prediction?: string;
  ai_risk_factors?: string[];
  ai_timeline?: Array<{
    timestamp: string;
    event: string;
    significance: string;
  }>;
}

interface AIInsightsPanelProps {
  insights: AIInsights;
  priorityScore?: number;
  threatLevel?: "critical" | "high" | "medium" | "low" | "routine";
}

export function AIInsightsPanel({ insights, priorityScore, threatLevel }: AIInsightsPanelProps) {
  const hasInsights = Object.keys(insights).some(key => insights[key as keyof AIInsights]);

  if (!hasInsights) {
    return null;
  }

  const threatColors = {
    critical: "bg-red-500",
    high: "bg-orange-500",
    medium: "bg-yellow-500",
    low: "bg-blue-500",
    routine: "bg-gray-500",
  };

  const sentimentColors = {
    positive: "text-green-500",
    negative: "text-red-500",
    neutral: "text-gray-500",
    mixed: "text-yellow-500",
  };

  return (
    <Card className="p-4 space-y-4 border-primary/20 bg-card/50">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-bold uppercase tracking-wider">AI Analysis</h3>
        </div>
        <div className="flex items-center gap-2">
          {priorityScore !== undefined && (
            <Badge variant="outline" className="text-[10px] font-mono">
              Priority: {priorityScore.toFixed(2)}
            </Badge>
          )}
          {threatLevel && (
            <Badge className={`${threatColors[threatLevel]} text-white text-[10px] uppercase`}>
              {threatLevel}
            </Badge>
          )}
        </div>
      </div>

      <Separator />

      {/* Executive Summary */}
      {insights.ai_executive_summary && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-accent" />
            <h4 className="text-xs font-bold uppercase text-muted-foreground">Executive Summary</h4>
          </div>
          <p className="text-sm text-foreground pl-6">{insights.ai_executive_summary}</p>
        </div>
      )}

      {/* Scene Description */}
      {insights.ai_scene_description && (
        <div className="space-y-1">
          <h4 className="text-xs font-bold uppercase text-muted-foreground">Scene Description</h4>
          <p className="text-sm text-foreground">{insights.ai_scene_description}</p>
        </div>
      )}

      {/* Location Prediction */}
      {insights.ai_location_prediction && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            <h4 className="text-xs font-bold uppercase text-muted-foreground">Location Prediction</h4>
            <Badge variant="outline" className="text-[9px]">
              {Math.round(insights.ai_location_prediction.confidence * 100)}% confidence
            </Badge>
          </div>
          <p className="text-sm text-foreground pl-6">{insights.ai_location_prediction.description}</p>
          {insights.ai_location_prediction.coordinates && (
            <p className="text-[10px] text-muted-foreground pl-6 font-mono">
              {insights.ai_location_prediction.coordinates.lat.toFixed(4)}°N, {insights.ai_location_prediction.coordinates.lon.toFixed(4)}°E
            </p>
          )}
        </div>
      )}

      {/* Intent & Direction */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {insights.ai_direction_of_travel && (
          <div className="space-y-1">
            <h4 className="text-xs font-bold uppercase text-muted-foreground">Direction of Travel</h4>
            <p className="text-sm text-foreground">{insights.ai_direction_of_travel}</p>
          </div>
        )}
        {insights.ai_intent_prediction && (
          <div className="space-y-1">
            <h4 className="text-xs font-bold uppercase text-muted-foreground">Intent Prediction</h4>
            <p className="text-sm text-foreground">{insights.ai_intent_prediction}</p>
          </div>
        )}
      </div>

      {/* Risk Factors */}
      {insights.ai_risk_factors && insights.ai_risk_factors.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <h4 className="text-xs font-bold uppercase text-muted-foreground">Risk Factors</h4>
          </div>
          <ul className="space-y-1 pl-6">
            {insights.ai_risk_factors.map((risk, i) => (
              <li key={i} className="text-sm text-foreground list-disc">{risk}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Entities */}
      {insights.ai_entities && insights.ai_entities.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase text-muted-foreground">Detected Entities</h4>
          <div className="flex flex-wrap gap-1">
            {insights.ai_entities.map((entity, i) => (
              <Badge key={i} variant="secondary" className="text-[10px] font-mono">
                {entity}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      {insights.ai_timeline && insights.ai_timeline.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-accent" />
            <h4 className="text-xs font-bold uppercase text-muted-foreground">Timeline</h4>
          </div>
          <div className="space-y-2 pl-6">
            {insights.ai_timeline.map((event, i) => (
              <div key={i} className="border-l-2 border-primary/30 pl-3 space-y-1">
                <p className="text-[10px] font-mono text-muted-foreground">{event.timestamp}</p>
                <p className="text-sm text-foreground font-medium">{event.event}</p>
                <p className="text-xs text-muted-foreground">{event.significance}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sentiment */}
      {insights.ai_sentiment && insights.ai_sentiment !== "neutral" && (
        <div className="flex items-center gap-2 pt-2">
          <span className="text-xs text-muted-foreground">Sentiment:</span>
          <Badge variant="outline" className={`text-[10px] ${sentimentColors[insights.ai_sentiment]}`}>
            {insights.ai_sentiment}
          </Badge>
        </div>
      )}
    </Card>
  );
}
