import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * AI Analysis Agent
 *
 * Dedicated AI/ML agent for analyzing ingested data/metadata:
 * - Document analysis: Full content reading, priority scoring, entity extraction
 * - Audio analysis: Transcription, sentiment, threat detection
 * - Image/Video analysis: Scene description, object detection, location prediction
 * - Live stream surveillance: Scene analysis, intent prediction, direction of travel
 * - Correlation analysis: Find relationships between data sources
 *
 * Uses Claude API for advanced analysis tasks.
 */

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

interface AnalysisRequest {
  type: "document" | "audio" | "image" | "video" | "livestream" | "correlation";
  content: string | Record<string, any>;
  metadata?: Record<string, any>;
  context?: string[];
}

interface AnalysisResult {
  priority_score: number;
  threat_level: "critical" | "high" | "medium" | "low" | "routine";
  military_relevance: number;
  sentiment: "positive" | "negative" | "neutral" | "mixed";
  entities: string[];
  summary: string;
  executive_summary?: string;
  scene_description?: string;
  location_prediction?: {
    description: string;
    confidence: number;
    coordinates?: { lat: number; lon: number };
  };
  direction_of_travel?: string;
  intent_prediction?: string;
  risk_factors?: string[];
  correlations?: Array<{
    source_id: string;
    correlation_type: string;
    confidence: number;
    description: string;
  }>;
  timeline?: Array<{
    timestamp: string;
    event: string;
    significance: string;
  }>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body: AnalysisRequest = await req.json();
    const { type, content, metadata, context } = body;

    if (!type || !content) {
      return jsonResponse({ error: "type and content required" }, 400);
    }

    let result: AnalysisResult;

    switch (type) {
      case "document":
        result = await analyzeDocument(content as string, metadata);
        break;
      case "audio":
        result = await analyzeAudio(content as string, metadata);
        break;
      case "image":
        result = await analyzeImage(content, metadata);
        break;
      case "video":
        result = await analyzeVideo(content, metadata);
        break;
      case "livestream":
        result = await analyzeLivestream(content, metadata);
        break;
      case "correlation":
        result = await analyzeCorrelations(supabase, content, context);
        break;
      default:
        return jsonResponse({ error: "Unknown analysis type" }, 400);
    }

    return jsonResponse({ success: true, analysis: result });
  } catch (err) {
    console.error("AI analysis error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});

async function analyzeDocument(
  content: string,
  metadata?: Record<string, any>
): Promise<AnalysisResult> {
  const prompt = `Analyze this military/intelligence document in detail:

${content}

Provide a comprehensive analysis including:
1. Priority score (0-1) based on threat level and urgency
2. Threat level classification (critical, high, medium, low, routine)
3. Military relevance score (0-1)
4. Sentiment analysis
5. Extract all named entities (locations, organizations, people, vessels, equipment)
6. Executive summary (2-3 sentences)
7. Key risk factors
8. Timeline of events mentioned

Format response as JSON with these exact keys:
{
  "priority_score": 0.0,
  "threat_level": "routine",
  "military_relevance": 0.0,
  "sentiment": "neutral",
  "entities": [],
  "summary": "",
  "executive_summary": "",
  "risk_factors": [],
  "timeline": []
}`;

  const analysis = await callClaude(prompt);
  return parseAnalysisResponse(analysis);
}

async function analyzeAudio(
  content: string,
  metadata?: Record<string, any>
): Promise<AnalysisResult> {
  // For audio, content would be a transcription or audio URL
  const prompt = `Analyze this audio transcription for military intelligence:

${content}

Provide:
1. Priority score based on urgency and threat indicators
2. Threat level
3. Military relevance
4. Sentiment and tone analysis
5. Speaker intent
6. Key entities mentioned
7. Executive summary
8. Risk assessment

Return JSON format with priority_score, threat_level, military_relevance, sentiment, entities, summary, executive_summary, intent_prediction, risk_factors.`;

  const analysis = await callClaude(prompt);
  return parseAnalysisResponse(analysis);
}

async function analyzeImage(
  content: any,
  metadata?: Record<string, any>
): Promise<AnalysisResult> {
  const imageUrl = typeof content === "string" ? content : content.url;

  const prompt = `Analyze this military/surveillance image in detail:

Image URL: ${imageUrl}

Provide comprehensive analysis:
1. Scene description (what's visible, objects, activities)
2. Military relevance and threat assessment
3. Location prediction (landmarks, structures, geographical features)
4. Risk factors
5. Priority score
6. Entities detected (vehicles, vessels, aircraft, personnel, structures)
7. Estimated location/vicinity based on visible features
8. Executive summary

Return JSON with: priority_score, threat_level, military_relevance, sentiment, entities, summary, executive_summary, scene_description, location_prediction (with description and confidence), risk_factors.`;

  const analysis = await callClaude(prompt);
  return parseAnalysisResponse(analysis);
}

async function analyzeVideo(
  content: any,
  metadata?: Record<string, any>
): Promise<AnalysisResult> {
  const videoUrl = typeof content === "string" ? content : content.url;

  const prompt = `Analyze this surveillance video for intelligence value:

Video URL: ${videoUrl}

Provide:
1. Scene description and timeline of events
2. Object detection (vehicles, vessels, people, equipment)
3. Direction of travel for moving objects
4. Intent prediction for observed activities
5. Location estimation
6. Priority and threat assessment
7. Military relevance
8. Risk factors
9. Executive summary with timeline

Return JSON with: priority_score, threat_level, military_relevance, sentiment, entities, summary, executive_summary, scene_description, timeline, direction_of_travel, intent_prediction, location_prediction, risk_factors.`;

  const analysis = await callClaude(prompt);
  return parseAnalysisResponse(analysis);
}

async function analyzeLivestream(
  content: any,
  metadata?: Record<string, any>
): Promise<AnalysisResult> {
  const streamUrl = typeof content === "string" ? content : content.url;
  const frameData = typeof content === "object" ? content.frame : null;

  const prompt = `Analyze this live surveillance stream frame for real-time intelligence:

Stream: ${streamUrl}
${frameData ? `Frame data: ${JSON.stringify(frameData)}` : ""}

Provide real-time analysis:
1. Scene description (current activity, visible objects)
2. Object detection and tracking
3. Risk factor assessment
4. Direction of travel for moving objects
5. Intent prediction (why are objects in this location?)
6. Location estimation (landmarks, structures, geographical features)
7. Threat level and priority
8. Military relevance
9. Predicted next actions
10. Executive summary

Be creative and helpful in describing:
- The overall scene and context
- Objects and their relationships
- Potential threats or anomalies
- Estimated location/vicinity
- Intent and predicted behavior
- Actionable intelligence

Return comprehensive JSON with: priority_score, threat_level, military_relevance, sentiment, entities, summary, executive_summary, scene_description, direction_of_travel, intent_prediction, location_prediction (description, confidence, coordinates if possible), risk_factors, timeline.`;

  const analysis = await callClaude(prompt);
  return parseAnalysisResponse(analysis);
}

async function analyzeCorrelations(
  supabase: any,
  content: any,
  context?: string[]
): Promise<AnalysisResult> {
  // Fetch recent data products for correlation analysis
  const { data: products, error } = await supabase
    .from("data_products")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(`Failed to fetch data for correlation: ${error.message}`);
  }

  const productsData = products || [];

  const prompt = `Analyze these recent intelligence data products for correlations and patterns:

Data Products:
${JSON.stringify(productsData, null, 2)}

Current Item:
${JSON.stringify(content, null, 2)}

${context ? `Additional Context:\n${context.join("\n")}` : ""}

Find and describe:
1. Correlations between data sources (spatial, temporal, thematic)
2. Patterns and trends
3. Potential connections (e.g., aircraft near vessels, events near locations)
4. Multi-source intelligence fusion
5. Priority assessment based on correlated data
6. Threat level from combined sources
7. Actionable insights from correlations

Return JSON with: priority_score, threat_level, military_relevance, sentiment, entities, summary, executive_summary, correlations array (source_id, correlation_type, confidence, description), risk_factors.`;

  const analysis = await callClaude(prompt);
  return parseAnalysisResponse(analysis);
}

async function callClaude(prompt: string): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    // Fallback to rule-based analysis if no API key
    console.warn("No ANTHROPIC_API_KEY found, using fallback analysis");
    return JSON.stringify({
      priority_score: 0.5,
      threat_level: "medium",
      military_relevance: 0.5,
      sentiment: "neutral",
      entities: [],
      summary: "AI analysis unavailable - using fallback scoring",
      executive_summary: "AI analysis requires ANTHROPIC_API_KEY configuration",
    });
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

function parseAnalysisResponse(analysis: string): AnalysisResult {
  try {
    // Extract JSON from response (may be wrapped in markdown code blocks)
    const jsonMatch = analysis.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Ensure required fields with defaults
    return {
      priority_score: parsed.priority_score || 0.5,
      threat_level: parsed.threat_level || "medium",
      military_relevance: parsed.military_relevance || 0.5,
      sentiment: parsed.sentiment || "neutral",
      entities: parsed.entities || [],
      summary: parsed.summary || "",
      executive_summary: parsed.executive_summary,
      scene_description: parsed.scene_description,
      location_prediction: parsed.location_prediction,
      direction_of_travel: parsed.direction_of_travel,
      intent_prediction: parsed.intent_prediction,
      risk_factors: parsed.risk_factors,
      correlations: parsed.correlations,
      timeline: parsed.timeline,
    };
  } catch (err) {
    console.error("Failed to parse analysis response:", err);
    console.error("Raw response:", analysis);

    // Return fallback result
    return {
      priority_score: 0.5,
      threat_level: "medium",
      military_relevance: 0.5,
      sentiment: "neutral",
      entities: [],
      summary: "Failed to parse AI analysis",
      executive_summary: `Raw analysis: ${analysis.substring(0, 500)}`,
    };
  }
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
