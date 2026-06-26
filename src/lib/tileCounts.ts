/**
 * Tile count utilities for the Operations Dashboard.
 *
 * All tile counts are derived from the same in-memory products array that is
 * used by the drill-down dialogs, so the number shown on a tile is always
 * identical to the number of rows the user sees when they click through.
 */

export interface TileCountItem {
  priority?: string | null;
  status?: string | null;
}

export interface TileCounts {
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  routineCount: number;
  processingCount: number;
}

/**
 * Compute dashboard tile counts from a list of data products.
 *
 * @param products - Array of objects with at least `priority` and `status` fields.
 * @returns Counts per priority level and per processing status.
 */
export function computeTileCounts<T extends TileCountItem>(products: T[]): TileCounts {
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;
  let routineCount = 0;
  let processingCount = 0;

  for (const p of products) {
    switch (p.priority) {
      case "critical": criticalCount++; break;
      case "high":     highCount++;     break;
      case "medium":   mediumCount++;   break;
      case "low":      lowCount++;      break;
      case "routine":  routineCount++;  break;
    }
    if (p.status === "processing") processingCount++;
  }

  return { criticalCount, highCount, mediumCount, lowCount, routineCount, processingCount };
}
