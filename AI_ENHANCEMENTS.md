# AI-Enhanced On-Demand Data Ingestion

## Overview

This update transforms the Tactical Insight Stream platform from continuous polling to on-demand data ingestion with persistent Redis-like caching and comprehensive AI/ML analysis agents.

## Key Changes

### 1. On-Demand Polling (No Automatic Ingestion)

**Previous Behavior:**
- Background polling every 10 seconds
- Continuous API calls consuming daily rate limits
- Data refreshed automatically in development builds

**New Behavior:**
- All data ingestion is manual/on-demand only
- Click dedicated buttons in `LiveDataPanel` to fetch data
- No polling during development builds
- Respects API rate limits on free public sources

**Files Modified:**
- `src/hooks/useBackgroundIngestion.ts` - **Removed** (no longer needed)
- `src/components/sources/LiveDataPanel.tsx` - Removed auto-ingest toggle, kept manual fetch buttons

### 2. Redis-Like Persistent Caching

**Cache Manager (`supabase/functions/cache-manager/index.ts`)**

Provides Redis-like caching using Supabase storage as the persistence layer:

- **GET**: Retrieve cached data for a source
- **SET**: Store data with configurable TTL (default: 30 minutes)
- **INVALIDATE**: Clear cache for a source
- **LIST**: View all cached sources with expiry status

**Benefits:**
- Prevents excessive API calls during development
- Data persists across builds/restarts
- Configurable TTL per source
- Automatic expiry cleanup

**Usage:**
```typescript
// Get cached data
const { data } = await supabase.functions.invoke("cache-manager", {
  body: { action: "get", source: "opensky:caribbean_corridor" }
});

// Cache is automatically checked/set in live-data-ingester
```

**Database:**
- New table: `api_cache` (see `supabase/migrations/20260322_add_api_cache.sql`)

### 3. AI/ML Analysis Agents

**AI Analysis Agent (`supabase/functions/ai-analysis-agent/index.ts`)**

Dedicated AI agent powered by Claude API for comprehensive analysis:

#### Document Analysis
- **Full content reading** (not just keyword detection)
- Priority scoring (0-1) based on threat/urgency
- Military relevance assessment
- Named entity extraction (locations, vessels, personnel)
- Executive summary generation
- Risk factor identification
- Timeline extraction

#### Audio Analysis
- Transcription analysis
- Sentiment and tone detection
- Speaker intent prediction
- Threat indicator identification
- Priority scoring

#### Image/Video Analysis
- **Scene description** (objects, activities, context)
- Object detection (vehicles, vessels, aircraft, structures)
- **Location prediction** (landmarks, geographical features, vicinity estimation)
- Risk assessment
- Military relevance scoring

#### Live Stream Surveillance
- **Real-time scene analysis**
- Object tracking and detection
- **Direction of travel** for moving objects
- **Intent prediction** (why objects are in location)
- **Location estimation** with confidence scores
- Risk factor assessment
- Timeline of events
- **Creative, detailed descriptions** for actionable intelligence

#### Correlation Analysis
- Finds relationships between data sources
- Spatial correlations (proximity-based)
- Temporal correlations (time-based)
- Thematic correlations (content-based)
- Multi-source intelligence fusion
- Combined threat assessment

### 4. Integration with Existing Pipelines

**Document Processor (`supabase/functions/document-processor/index.ts`)**
- Calls AI agent after rule-based/ML detection
- Updates `data_products` with AI insights
- Non-blocking (continues on AI failure)

**Video Processor (`supabase/functions/video-processor/index.ts`)**
- Calls AI agent after YOLO object detection
- Enhances results with scene understanding
- Adds location predictions and intent analysis

**Live Data Ingester (`supabase/functions/live-data-ingester/index.ts`)**
- Integrated cache checks before API calls
- Automatic result caching with configurable TTL
- Cache-aware responses (indicates cache hits)

### 5. UI Components

**AIInsightsPanel** (`src/components/AIInsightsPanel.tsx`)

React component for displaying AI-generated insights:
- Executive summary
- Scene descriptions
- Location predictions with confidence
- Direction of travel
- Intent predictions
- Risk factors
- Timeline of events
- Detected entities
- Sentiment analysis
- Priority scores and threat levels

**useCorrelationAnalysis** (`src/hooks/useCorrelationAnalysis.ts`)

React hook for triggering correlation analysis:
```typescript
const { loading, analysis, analyzeCorrelations } = useCorrelationAnalysis();

// Analyze all sources
await analyzeCorrelations();

// Analyze specific product
await analyzeCorrelations(productId);
```

## Configuration

### Environment Variables

**Required for AI Analysis:**
```bash
ANTHROPIC_API_KEY=sk-ant-xxxxx  # Claude API key for AI analysis
```

**Optional:**
```bash
# Cache TTL (seconds, default: 1800 = 30 minutes)
CACHE_TTL=3600

# Enable/disable cache (default: true)
USE_CACHE=true
```

### API Rate Limits

With caching enabled (default 30-minute TTL):
- OpenSky: ~48 requests/day (vs 8,640 continuous polling)
- AIS: ~48 requests/day
- NASA EONET: ~48 requests/day
- NOAA: ~48 requests/day

**Daily savings: ~99.4% reduction in API calls**

## Data Flow

### On-Demand Ingestion with Cache

```
User clicks "Fetch Aircraft"
    ↓
Check cache-manager for "opensky:caribbean_corridor"
    ↓
Cache Hit (age < 30min) → Return cached data immediately
    ↓
Cache Miss/Expired → Fetch from OpenSky API
    ↓
Store in cache (30min TTL)
    ↓
Insert into data_products
    ↓
Trigger AI analysis agent
    ↓
Update data_products with AI insights
```

### AI Analysis Pipeline

```
Data Product Created
    ↓
Basic processing (YOLO/NER/Rule-based)
    ↓
Call ai-analysis-agent with content
    ↓
Claude analyzes content deeply
    ↓
Returns: priority_score, threat_level, entities,
         summary, scene_description, location_prediction,
         intent, direction_of_travel, risk_factors, timeline
    ↓
Update data_products.content with AI fields
    ↓
UI displays enhanced insights via AIInsightsPanel
```

## Usage Examples

### Manual Data Ingestion

```typescript
// In LiveDataPanel.tsx
const handleLiveIngest = async (source: string) => {
  const { data, error } = await supabase.functions.invoke("live-data-ingester", {
    body: {
      action: "ingest",
      source,
      region: selectedRegion,
      use_cache: true,      // Use cache (default)
      cache_ttl: 1800,      // 30 minutes
    },
  });

  if (data.cached) {
    console.log(`Cache hit: ${data.cache_age_seconds}s old`);
  }
};
```

### Viewing AI Insights

```typescript
import { AIInsightsPanel } from "@/components/AIInsightsPanel";

// In your detail view
<AIInsightsPanel
  insights={{
    ai_executive_summary: product.content.ai_executive_summary,
    ai_scene_description: product.content.ai_scene_description,
    ai_location_prediction: product.content.ai_location_prediction,
    ai_entities: product.content.ai_entities,
    // ... other AI fields
  }}
  priorityScore={product.priority_score}
  threatLevel={product.priority}
/>
```

### Correlation Analysis

```typescript
import { useCorrelationAnalysis } from "@/hooks/useCorrelationAnalysis";

function CorrelationButton() {
  const { loading, analyzeCorrelations } = useCorrelationAnalysis();

  return (
    <Button
      onClick={() => analyzeCorrelations()}
      disabled={loading}
    >
      Find Correlations
    </Button>
  );
}
```

## Testing

### Test Cache Functionality

```bash
# Fetch data (cache miss)
curl -X POST https://your-project.supabase.co/functions/v1/live-data-ingester \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -d '{"action":"ingest","source":"opensky","region":"caribbean_corridor"}'

# Fetch again immediately (cache hit)
# Response will include: "cached": true, "cache_age_seconds": X

# List cached items
curl -X POST https://your-project.supabase.co/functions/v1/cache-manager \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -d '{"action":"list"}'
```

### Test AI Analysis

```bash
# Analyze a document
curl -X POST https://your-project.supabase.co/functions/v1/ai-analysis-agent \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -d '{
    "type": "document",
    "content": "Hostile submarine detected near USS Enterprise. Torpedo launch imminent."
  }'

# Expected response includes priority_score, threat_level, entities, etc.
```

## Migration

### Database Migration

Run the migration to create the `api_cache` table:

```bash
# If using Supabase CLI
supabase migration up

# Or manually execute:
# supabase/migrations/20260322_add_api_cache.sql
```

### Code Migration

No breaking changes for existing functionality. All changes are additive:
- Remove references to `useBackgroundIngestion` if any
- Optionally integrate `AIInsightsPanel` in detail views
- Optionally add correlation analysis buttons

## Benefits Summary

### Development Experience
- **No rate limit exhaustion** during dev/test cycles
- **Faster builds** (no waiting for API calls)
- **Consistent test data** (cached results)
- **Cost savings** (99% reduction in API calls)

### Intelligence Quality
- **Deeper analysis** than keyword matching
- **Contextual understanding** of content
- **Location predictions** from visual data
- **Intent analysis** for threat assessment
- **Multi-source correlations** for fusion intelligence
- **Executive summaries** for rapid briefings
- **Timeline extraction** for situational awareness

### Operational Features
- **On-demand ingestion** respects rate limits
- **Persistent caching** across deployments
- **Correlation detection** across sensor feeds
- **AI-powered prioritization** based on content
- **Detailed scene descriptions** for surveillance
- **Actionable intelligence** with risk factors

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        User Interface                        │
│  (LiveDataPanel, AIInsightsPanel, Correlation Controls)     │
└────────────────────┬────────────────────────────────────────┘
                     │ Manual Click
                     ↓
┌─────────────────────────────────────────────────────────────┐
│                   Live Data Ingester                         │
│  1. Check cache-manager                                      │
│  2. Fetch from API (if cache miss)                          │
│  3. Store in cache                                           │
│  4. Insert into data_products                                │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│            Processing Pipeline (document/video)              │
│  1. Rule-based detection / YOLO                             │
│  2. Call AI-analysis-agent                                   │
│  3. Update with AI insights                                  │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│                  AI Analysis Agent                           │
│  - Document: Full reading, entity extraction                 │
│  - Audio: Transcription, sentiment, threat detection         │
│  - Video: Scene description, object tracking                 │
│  - Livestream: Real-time analysis, intent prediction        │
│  - Correlation: Multi-source intelligence fusion            │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│                   Data Products Table                        │
│  Enhanced with:                                              │
│  - ai_executive_summary                                      │
│  - ai_scene_description                                      │
│  - ai_location_prediction                                    │
│  - ai_intent_prediction                                      │
│  - ai_risk_factors                                           │
│  - ai_timeline                                               │
└─────────────────────────────────────────────────────────────┘
```

## Future Enhancements

- **Scheduled cache invalidation** (cron job)
- **Cache warming** (pre-fetch popular regions)
- **AI model fine-tuning** on maritime/defense domain
- **Real-time correlation alerts** (webhook-based)
- **Multi-modal fusion** (combine visual + text + audio)
- **Predictive analytics** (forecast threats based on patterns)

## Troubleshooting

### Cache not working
- Verify `api_cache` table exists
- Check `cache-manager` function is deployed
- Ensure `use_cache: true` in request body

### AI analysis failing
- Verify `ANTHROPIC_API_KEY` is set
- Check API key has credits
- Review edge function logs for errors
- Fallback to rule-based scoring if AI fails (non-blocking)

### No correlations found
- Ensure multiple data sources are ingested
- Check date/time overlap between sources
- Review spatial proximity settings
- Verify correlation_alerts table schema

---

**Version**: 1.0.0
**Date**: 2026-03-22
**Author**: Claude Agent
