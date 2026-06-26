export type ThreatLevel = "MINIMAL" | "GUARDED" | "ELEVATED" | "HIGH" | "SEVERE";

export const LEVEL_ORDER: ThreatLevel[] = ["MINIMAL", "GUARDED", "ELEVATED", "HIGH", "SEVERE"];

export const THREAT_CONFIG: Record<ThreatLevel, { color: string; bg: string; border: string; icon: string }> = {
  MINIMAL:  { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", icon: "🟢" },
  GUARDED:  { color: "text-sky-400",     bg: "bg-sky-500/10",     border: "border-sky-500/30",     icon: "🔵" },
  ELEVATED: { color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/30",   icon: "🟡" },
  HIGH:     { color: "text-orange-400",   bg: "bg-orange-500/10",  border: "border-orange-500/30",  icon: "🟠" },
  SEVERE:   { color: "text-red-400",      bg: "bg-red-500/10",     border: "border-red-500/30",     icon: "🔴" },
};

export const LEVEL_HEX: Record<string, string> = {
  MINIMAL: "#34d399", GUARDED: "#38bdf8", ELEVATED: "#fbbf24", HIGH: "#fb923c", SEVERE: "#f87171",
};

export interface SensorReading {
  title: string;
  stationId: string;
  waterLevel: number;
  trend: string;
  trendChange: number;
  priority: string;
  highWaterAlert: boolean;
  criticalAlert: boolean;
  lat: number;
  lng: number;
}

export interface StormAssessment {
  level: ThreatLevel;
  score: number;
  details: string[];
  criticalCount: number;
  highCount: number;
  risingFast: number;
  rising: number;
  avgLevel: number;
  maxLevel: number;
}

export function computeAssessment(sensors: SensorReading[]): StormAssessment {
  if (sensors.length === 0) {
    return { level: "MINIMAL", score: 0, details: [], criticalCount: 0, highCount: 0, risingFast: 0, rising: 0, avgLevel: 0, maxLevel: 0 };
  }

  const criticalCount = sensors.filter((s) => s.criticalAlert).length;
  const highCount = sensors.filter((s) => s.highWaterAlert).length;
  const risingFast = sensors.filter((s) => s.trend === "rising_fast").length;
  const rising = sensors.filter((s) => s.trend === "rising").length;
  const avgLevel = sensors.reduce((s, r) => s + r.waterLevel, 0) / sensors.length;
  const maxLevel = Math.max(...sensors.map((s) => s.waterLevel));

  let score = 0;
  score += criticalCount * 25;
  score += highCount * 12;
  score += risingFast * 8;
  score += rising * 3;
  if (avgLevel > 2) score += 15;
  if (avgLevel > 3) score += 15;
  if (maxLevel > 4) score += 10;
  score = Math.min(100, score);

  let level: ThreatLevel = "MINIMAL";
  if (score >= 75) level = "SEVERE";
  else if (score >= 50) level = "HIGH";
  else if (score >= 30) level = "ELEVATED";
  else if (score >= 10) level = "GUARDED";

  const details: string[] = [];
  if (criticalCount > 0) details.push(`${criticalCount} station(s) at CRITICAL storm surge`);
  if (highCount > 0) details.push(`${highCount} station(s) reporting HIGH water`);
  if (risingFast > 0) details.push(`${risingFast} station(s) rising rapidly`);
  if (maxLevel > 3) details.push(`Peak water level: ${maxLevel.toFixed(1)}ft MHHW`);
  if (avgLevel > 1.5) details.push(`Avg water level: ${avgLevel.toFixed(1)}ft MHHW`);
  if (details.length === 0) details.push("All stations reporting normal levels");

  return { level, score, details, criticalCount, highCount, risingFast, rising, avgLevel, maxLevel };
}

export function parseSensors(products: any[]): SensorReading[] {
  return products
    .filter((p) => {
      const c = p.content as Record<string, unknown> | null;
      return c && (c as any).sensor_type === "bayou_water_level";
    })
    .map((p) => {
      const c = p.content as any;
      return {
        title: p.title,
        stationId: p.source_identifier || "unknown",
        waterLevel: Number(c.water_level_ft) || 0,
        trend: c.trend_direction ?? "stable",
        trendChange: Number(c.trend_change_ft) || 0,
        priority: p.priority || "routine",
        highWaterAlert: !!c.high_water_alert,
        criticalAlert: !!c.critical_alert,
        lat: p.latitude ?? 0,
        lng: p.longitude ?? 0,
      };
    });
}
