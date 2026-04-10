import type { Gap } from "../types.js";
import { normalizeAgentName } from "./normalize-agent-name.js";

/**
 * Extract structured gap objects from analyzer outputs
 */
export function extractStructuredGaps(analyzers: any[]): Gap[] {
  const gaps: Gap[] = [];

  analyzers.forEach((analyzer) => {
    if (analyzer.needs_verification && analyzer.needs_verification.length > 0) {
      analyzer.needs_verification.forEach((item: any) => {
        const isObject = typeof item === "object" && item !== null;
        const itemText = isObject
          ? item.item || JSON.stringify(item)
          : String(item);
        const questionText = isObject ? item.question : String(item);
        const reasonText = isObject ? item.reason : undefined;

        gaps.push({
          type: "needs_verification",
          agent: normalizeAgentName(analyzer.agent_name),
          item: itemText,
          question: questionText,
          reason: reasonText,
          priority: "medium",
        });
      });
    }
  });

  return gaps;
}
