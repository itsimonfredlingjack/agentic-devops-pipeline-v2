import { useAppStore } from "../stores/appStore";

export type StallProbability = "LOW" | "MEDIUM" | "HIGH";

export interface SessionIntelligence {
  successRate: number;
  stallProbability: StallProbability;
  burnRatePerMin: number;
  totalEvents: number;
  failedTools: string[];
}

export function useSessionIntelligence(): SessionIntelligence {
  const { events, cost, elapsedMs } = useAppStore();

  const totalEvents = events.length;
  if (totalEvents === 0) {
    return {
      successRate: 100,
      stallProbability: "LOW",
      burnRatePerMin: 0,
      totalEvents: 0,
      failedTools: [],
    };
  }

  // 1. Calculate Success Rate
  const successCount = events.filter((e) => e.success !== false).length;
  const successRate = Math.round((successCount / totalEvents) * 100);

  // 2. Identify Failed Tools
  const failedTools = Array.from(
    new Set(
      events
        .filter((e) => e.success === false)
        .map((e) => e.tool_name)
    )
  );

  // 3. Detect Stall Probability
  // Heuristic: If last 3 events are the same tool and failed, or last 5 are the same tool regardless of outcome
  let stallProbability: StallProbability = "LOW";
  if (totalEvents >= 3) {
    const last3 = events.slice(0, 3);
    const sameTool = last3.every((e) => e.tool_name === last3[0].tool_name);
    const allFailed = last3.every((e) => e.success === false);
    
    if (sameTool && allFailed) {
      stallProbability = "HIGH";
    } else if (sameTool) {
      stallProbability = "MEDIUM";
    }
  }

  // 4. Calculate Burn Rate ($/min)
  let burnRatePerMin = 0;
  if (cost && elapsedMs > 10000) { // Only calculate after 10s to avoid spikes
    const elapsedMinutes = elapsedMs / 60000;
    burnRatePerMin = cost.total_usd / elapsedMinutes;
  }

  return {
    successRate,
    stallProbability,
    burnRatePerMin,
    totalEvents,
    failedTools,
  };
}
