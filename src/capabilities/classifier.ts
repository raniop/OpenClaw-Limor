/**
 * Classifies owner teaching requests into fact / instruction / capability.
 * Pure function — no I/O, no side effects.
 */
import type { ClassificationResult } from "./types";

// Patterns that indicate a capability request (not just a fact or instruction)
const CAPABILITY_PATTERNS = [
  /תלמד[יו]?\s+(איך|לעשות|ל)/,
  /תוסיפ[יו]?\s+(יכולת|תמיכה|אפשרות|כלי|tool)/,
  /תתכנת[יו]?\s/,
  /תפתח[יו]?\s/,
  /תבנ[יו]?\s/,
  /learn\s+(how\s+to|to)/i,
  /add\s+(support|capability|tool|feature)/i,
  /program\s+yourself/i,
  /teach\s+yourself/i,
  /מעכשיו\s+(תדע[יו]?|תוכל[יו]?)\s+(ל|איך)/,
  /שתוכל[יו]?\s+ל/,
  /תחבר[יו]?\s+(את עצמך|API|שירות|מערכת)/,
  /חבר[יו]?\s+(ל|את)/,
  /אין\s+לך.*תוסיפ[יו]?/,
  /למה\s+(לא|אי)\s+(יכולה|אפשר).*ת(עש[יו]?|למד[יו]?)/,
];

// Patterns that indicate an instruction (behavioral rule, not code change)
const INSTRUCTION_PATTERNS = [
  /תזכר[יו]?\s+ש/,
  /מעכשיו\s/,
  /כלל\s+חדש/,
  /כש(אני|מישהו)\s+(אומר|שואל|מבקש)/,
  /תמיד\s+(ת|ל)/,
  /אף\s+פעם\s+לא/,
  /remember\s+that/i,
  /from\s+now\s+on/i,
  /always\s/i,
  /never\s/i,
];

/**
 * Classify an owner's teaching message into fact / instruction / capability.
 */
export function classifyTeaching(message: string): ClassificationResult {
  const msg = message.trim();

  // Check capability patterns first (higher priority)
  for (const pattern of CAPABILITY_PATTERNS) {
    if (pattern.test(msg)) {
      return {
        level: "capability",
        confidence: "high",
        reason: `Matched capability pattern: ${pattern.source.substring(0, 30)}`,
      };
    }
  }

  // Check instruction patterns
  for (const pattern of INSTRUCTION_PATTERNS) {
    if (pattern.test(msg)) {
      return {
        level: "instruction",
        confidence: "high",
        reason: `Matched instruction pattern: ${pattern.source.substring(0, 30)}`,
      };
    }
  }

  // Default: treat as fact
  return {
    level: "fact",
    confidence: "low",
    reason: "No capability or instruction pattern matched",
  };
}
