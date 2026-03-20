/**
 * Mood Detector — detects user emotional state from Hebrew text.
 * Deterministic regex-based, no AI calls.
 */
import type { MoodContext, UserMood } from "./context-types";

interface MoodSignal {
  mood: UserMood;
  patterns: RegExp[];
  weight: number;
}

const MOOD_SIGNALS: MoodSignal[] = [
  // Stressed
  {
    mood: "stressed",
    patterns: [
      /אין\s*לי\s*זמן/,
      /דחוף/,
      /בלחץ/,
      /לחוצ[ה]?/,
      /מטורפ[ת]?/,
      /עומס/,
      /בלאגן/,
      /לא\s*מספיק/,
      /נגמר\s*לי\s*הזמן/,
      /ברגע\s*האחרון/,
      /דדליין/,
      /deadline/i,
      /asap/i,
      /urgent/i,
    ],
    weight: 1,
  },
  // Frustrated
  {
    mood: "frustrated",
    patterns: [
      /נמאס/,
      /כבר\s*אמרתי/,
      /שוב\s*(את|אותו|אותה|זה)/,
      /לא\s*עובד/,
      /לא\s*מצליח/,
      /מעצבנ[ת]?/,
      /מתסכל/,
      /עזבי/,
      /בואי\s*נעזוב/,
      /חבל\s*על\s*הזמן/,
      /למה\s*(זה|את|היא)/,
      /wtf/i,
      /😤/,
      /🤦/,
    ],
    weight: 1,
  },
  // Happy
  {
    mood: "happy",
    patterns: [
      /מדהים/,
      /יש!/,
      /סוף\s*סוף/,
      /אחלה/,
      /מושלם/,
      /שמח[ה]?/,
      /נהדר/,
      /מצוין/,
      /וואו/,
      /תותח/,
      /🎉/,
      /🥳/,
      /❤️/,
      /😍/,
      /🔥/,
      /💪/,
    ],
    weight: 1,
  },
  // Rushed
  {
    mood: "rushed",
    patterns: [
      /מהר/,
      /עכשיו/,
      /ממהר[ת]?/,
      /רגע\s*אחד/,
      /בקיצור/,
      /תכלס/,
      /quickly/i,
      /fast/i,
    ],
    weight: 0.8,
  },
  // Sad
  {
    mood: "sad",
    patterns: [
      /עצוב[ה]?/,
      /קשה\s*לי/,
      /בדיכאון/,
      /מדוכדכ[ת]?/,
      /גרוע/,
      /נורא/,
      /לא\s*טוב\s*לי/,
      /😢/,
      /😞/,
      /😔/,
      /💔/,
    ],
    weight: 1,
  },
  // Excited
  {
    mood: "excited",
    patterns: [
      /לא\s*מאמינ[ה]?/,
      /מטורף/,
      /אדיר/,
      /וואי/,
      /יאללה!/,
      /כל\s*כך\s*שמח/,
      /!!!/, // Triple exclamation
      /🤩/,
      /😱/,
    ],
    weight: 1,
  },
];

/**
 * Detect user mood from message text.
 * Returns mood with confidence and matched signals.
 */
export function detectMood(message: string): MoodContext {
  const matchedSignals: Array<{ mood: UserMood; signal: string; weight: number }> = [];

  for (const moodSignal of MOOD_SIGNALS) {
    for (const pattern of moodSignal.patterns) {
      if (pattern.test(message)) {
        matchedSignals.push({
          mood: moodSignal.mood,
          signal: pattern.source,
          weight: moodSignal.weight,
        });
      }
    }
  }

  if (matchedSignals.length === 0) {
    // Check for rushed signals from message structure
    const isShort = message.length < 15 && !message.includes("?");
    if (isShort && /^[א-ת\w\s]{1,10}$/.test(message)) {
      return { mood: "neutral", confidence: 0.5, signals: [] };
    }
    return { mood: "neutral", confidence: 0.9, signals: [] };
  }

  // Count mood occurrences weighted
  const moodScores = new Map<UserMood, number>();
  const moodSignalTexts = new Map<UserMood, string[]>();

  for (const match of matchedSignals) {
    const current = moodScores.get(match.mood) || 0;
    moodScores.set(match.mood, current + match.weight);
    const texts = moodSignalTexts.get(match.mood) || [];
    texts.push(match.signal);
    moodSignalTexts.set(match.mood, texts);
  }

  // Find highest scoring mood
  let bestMood: UserMood = "neutral";
  let bestScore = 0;
  for (const [mood, score] of moodScores) {
    if (score > bestScore) {
      bestMood = mood;
      bestScore = score;
    }
  }

  // Confidence based on number of signals
  const confidence = Math.min(0.95, 0.5 + bestScore * 0.2);

  return {
    mood: bestMood,
    confidence,
    signals: moodSignalTexts.get(bestMood) || [],
  };
}
