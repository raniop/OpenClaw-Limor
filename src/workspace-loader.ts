import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, join } from "path";

const WORKSPACE_DIR = resolve(__dirname, "..", "workspace");

// Cache for workspace files (they rarely change)
const fileCache = new Map<string, string>();

function readWorkspaceFile(relativePath: string): string {
  const cached = fileCache.get(relativePath);
  if (cached !== undefined) return cached;

  const fullPath = join(WORKSPACE_DIR, relativePath);
  if (!existsSync(fullPath)) {
    console.log(`⚠️ Workspace file not found: ${relativePath}`);
    return "";
  }
  const content = readFileSync(fullPath, "utf-8");
  fileCache.set(relativePath, content);
  return content;
}

// Clear cache (call if workspace files are edited at runtime)
export function clearWorkspaceCache(): void {
  fileCache.clear();
}

/**
 * Build the base system prompt from identity files (always loaded)
 */
export function getBasePrompt(): string {
  const identityFiles = [
    "identity/SOUL.md",
    "identity/VOICE.md",
    "identity/OPERATING_PRINCIPLES.md",
    "identity/CAPABILITIES_MAP.md",
  ];

  return identityFiles
    .map((f) => readWorkspaceFile(f))
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Topic rules for selective loading
 */
interface TopicRule {
  keywords: string[];
  files: string[];
}

const TOPIC_RULES: TopicRule[] = [
  {
    keywords: ["מסעדה", "הזמנה", "שולחן", "אונטופו", "טאביט", "ontopo", "tabit", "restaurant", "booking", "מקום", "סועדים"],
    files: ["policies/booking.md", "runbooks/book_restaurant.md", "integrations/ontopo.md", "integrations/tabit.md"],
  },
  {
    keywords: ["יומן", "פגישה", "זימון", "calendar", "meeting", "פנוי", "שיחה", "event", "לקבוע", "אירוע", "תזכורת"],
    files: ["policies/calendar.md", "runbooks/schedule_meeting.md", "integrations/google_calendar.md"],
  },
  {
    keywords: ["crm", "CRM", "פוליסה", "ביטוח", "דשבורד", "סוכן", "policy", "insurance", "תעודת זהות", "SMS"],
    files: ["policies/crm.md"],
  },
  {
    keywords: ["שלח", "הודעה", "תגיד", "תרשום", "תעני", "send", "message"],
    files: ["policies/messaging.md"],
  },
  {
    keywords: ["קבוצה", "group", "השתק", "mute", "תתעלמי"],
    files: ["policies/groups.md"],
  },
  {
    keywords: ["טיסה", "מלון", "חופשה", "נופש", "flight", "hotel", "travel", "vacation", "טסים"],
    files: ["integrations/travel.md"],
  },
  {
    keywords: ["איש קשר", "חסום", "block", "contact", "תוסיפי", "אנשי קשר"],
    files: ["policies/privacy.md"],
  },
  {
    keywords: ["אור", "אורות", "light", "וילון", "blind", "מזגן", "מאוורר", "fan", "דוד", "boiler", "בית חכם", "smart home", "הדלק", "כבה", "פתח", "סגור", "control4", "סלון", "מטבח", "חדר שינה", "גינה", "פרגולה"],
    files: ["policies/smarthome.md"],
  },
  {
    keywords: ["תתכנני", "תארגני", "תסדרי לי", "סדרי לי", "ערב", "plan", "organize", "arrange", "טיול", "אירוע", "מסיבה"],
    files: ["policies/multi_step.md"],
  },
];

/**
 * Get relevant workspace context based on message content and sender context.
 * Returns concatenated markdown content for matching topics.
 */
export function getRelevantContext(
  message: string,
  isGroup: boolean,
  isOwner: boolean
): string {
  const messageLower = message.toLowerCase();
  const loadedFiles = new Set<string>();
  const sections: string[] = [];

  // Always load privacy rules
  loadedFiles.add("policies/privacy.md");

  // Always load owner interaction rules for owner
  if (isOwner) {
    loadedFiles.add("policies/owner_interaction.md");
  }

  // Always load group rules for group messages
  if (isGroup) {
    loadedFiles.add("policies/groups.md");
  }

  // Match topics by keywords
  for (const rule of TOPIC_RULES) {
    const matched = rule.keywords.some((kw) => messageLower.includes(kw.toLowerCase()));
    if (matched) {
      for (const file of rule.files) {
        loadedFiles.add(file);
      }
    }
  }

  // If no topics matched, this is general chat - no extra context needed
  // (identity files are already in the base prompt)

  // Read and concatenate matched files
  for (const file of loadedFiles) {
    const content = readWorkspaceFile(file);
    if (content) {
      sections.push(content);
    }
  }

  if (sections.length > 0) {
    console.log(`📂 Workspace: loaded ${loadedFiles.size} context files: ${[...loadedFiles].join(", ")}`);
  }

  return sections.join("\n\n");
}
