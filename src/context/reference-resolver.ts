/**
 * Reference Resolver — determines who/what the user is likely referring to.
 * Uses mentioned entities, open loops, and pronoun patterns.
 * Deterministic, no AI calls.
 */
import type { ResolvedReference, OpenLoopContext, ConversationContext, PersonContext } from "./context-types";

// Hebrew pronoun patterns that indicate implicit person references
const PRONOUN_PERSON_PATTERNS = /(^|\s)(לו|לה|אותו|אותה|איתו|איתה|עליו|עליה|ממנו|ממנה|שלו|שלה)(\s|$|[?.!,])/;

// Patterns that indicate "this thing" — referencing an open item
const THING_PATTERNS = /(^|\s)(את זה|על זה|בזה|לזה|מזה|זהו|הזה|תבדקי את זה|תטפלי בזה)(\s|$|[?.!,])/;

export function resolveReferences(
  message: string,
  input: {
    mentionedEntities: string[];
    openLoops: OpenLoopContext;
    conversation: ConversationContext;
    person: PersonContext;
  }
): ResolvedReference[] {
  const refs: ResolvedReference[] = [];
  const trimmed = message.trim();

  // 1. Explicit entity mentions — highest confidence
  for (const entity of input.mentionedEntities) {
    refs.push({
      kind: "person",
      displayName: entity,
      source: "mentioned_entity",
      confidence: 0.95,
    });
  }

  // 2. Pronoun-style person references — resolve from open loops
  if (PRONOUN_PERSON_PATTERNS.test(trimmed) && refs.length === 0) {
    // Try pending meeting requester first
    if (input.openLoops.pendingMeeting?.requesterName) {
      refs.push({
        kind: "person",
        displayName: input.openLoops.pendingMeeting.requesterName,
        source: "open_loop",
        confidence: 0.8,
      });
    }
    // Then try followup requesters
    else {
      for (const fu of input.openLoops.followups) {
        if (fu.requesterName) {
          refs.push({
            kind: "person",
            displayName: fu.requesterName,
            source: "open_loop",
            confidence: 0.75,
          });
          break; // most recent first
        }
      }
    }
  }

  // 3. "This thing" references — resolve to open followup
  if (THING_PATTERNS.test(trimmed) && input.openLoops.followups.length > 0) {
    const topFollowup = input.openLoops.followups[0];
    refs.push({
      kind: "followup",
      displayName: topFollowup.reason.substring(0, 60),
      source: "open_loop",
      confidence: 0.75,
    });
  }

  return refs;
}
