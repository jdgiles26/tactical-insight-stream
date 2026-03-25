// VLM (Vision-Language Model) monitoring types
// TODO: Import these from ../hooks/useVLMMonitor once the hook is created

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  confidence: number;
}

export interface MatchedIntent {
  term: string;
  label: string;
  confidence: number;
  matchType: 'exact' | 'semantic' | 'related';
}

export type ThreatLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface VLMAlert {
  id: string;
  streamId: string;
  streamName: string;
  timestamp: number;          // seconds into the video/stream
  createdAt: string;          // ISO date string
  threatLevel: ThreatLevel;
  confidence: number;         // 0-1
  sceneDescription: string;
  detections: {
    label: string;
    confidence: number;
    boundingBox?: BoundingBox;
  }[];
  matchedIntents: MatchedIntent[];
  frameBase64?: string;       // data:image/jpeg;base64,... or raw base64
  depthMapBase64?: string;    // depth map visualization if available
  objectCount: number;
  objectTypes: string[];
}

export interface StreamDetectionState {
  streamId: string;
  streamName: string;
  isMonitoring: boolean;
  lastAnalysisTime: number;
  totalFramesAnalyzed: number;
  totalDetections: number;
  alertCount: number;
  monitoringStartedAt?: string;
}
