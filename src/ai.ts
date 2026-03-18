import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config";
import { createEvent, listEvents } from "./calendar";
import { generateICS } from "./ics";
import { sendCalendarInviteEmail } from "./email";
import { addMeetingRequest, hasPendingRequest } from "./meeting-requests";
import { searchAvailability, bookOntopo } from "./ontopo";
import { searchTabit, bookTabit } from "./tabit";
import { findContactByName, getRecentContacts } from "./contacts";
import {
  searchPolicyByPersonId,
  getPolicyDetails,
  getPolicyCustomers,
  getTopPolicies,
  getDashboard,
  getAgentsReport,
  sendSms,
} from "./crm";
import { muteGroup, unmuteGroup, getMutedGroups, findGroupChatId } from "./muted-groups";
import { searchFlights } from "./flights";
import { searchHotels } from "./hotels";
import { saveInstruction, removeInstruction, listInstructions, getInstructionsContext } from "./instructions";
import { listFiles, readFile, saveFile } from "./files";

const client = new Anthropic({ apiKey: config.anthropicApiKey });

export interface Message {
  role: "user" | "assistant";
  content: string;
  imageData?: {
    base64: string;
    mediaType: string;
  };
}

const calendarTools: Anthropic.Tool[] = [
  {
    name: "create_event",
    description:
      "יצירת אירוע חדש ביומן של רני. השתמשי בזה רק כשרני עצמו (הבעלים) מבקש לקבוע אירוע.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: {
          type: "string",
          description: "שם האירוע (למשל: 'פגישה עם יוני')",
        },
        start_date: {
          type: "string",
          description:
            "תאריך ושעת התחלה בפורמט ISO 8601 (למשל: '2026-03-17T10:00:00')",
        },
        duration_minutes: {
          type: "number",
          description: "משך האירוע בדקות (ברירת מחדל: 60)",
        },
      },
      required: ["title", "start_date"],
    },
  },
  {
    name: "list_events",
    description:
      "הצגת אירועים ביומן של רני ליום מסוים. עובד עם Google Calendar.",
    input_schema: {
      type: "object" as const,
      properties: {
        date: {
          type: "string",
          description: "תאריך בפורמט ISO 8601 (למשל: '2026-03-17')",
        },
      },
      required: ["date"],
    },
  },
  {
    name: "request_meeting",
    description:
      "כשמישהו שהוא לא רני (לא הבעלים) רוצה לקבוע פגישה עם רני. השתמשי בזה כדי לשלוח בקשה לרני ולחכות לאישורו. אף פעם לא לקבוע ישירות ביומן כשמישהו אחר מבקש!",
    input_schema: {
      type: "object" as const,
      properties: {
        topic: {
          type: "string",
          description: "נושא הפגישה או תיאור קצר",
        },
        preferred_time: {
          type: "string",
          description: "הזמן המועדף שהמבקש ציין (אם ציין), למשל 'מחר ב-10 בבוקר'",
        },
      },
      required: ["topic"],
    },
  },
  {
    name: "notify_owner",
    description:
      "העברת הודעה לרני (הבעלים). ⚠️ שלחי פעם אחת בלבד לכל בקשה! בדקי בהיסטוריה שלא שלחת כבר על אותו נושא. אם כבר שלחת – לא לשלוח שוב!",
    input_schema: {
      type: "object" as const,
      properties: {
        message: {
          type: "string",
          description: "ההודעה להעביר לרני (למשל: 'יוני מבקש שתדבר איתו כשיש לך זמן')",
        },
      },
      required: ["message"],
    },
  },
  {
    name: "send_message",
    description:
      "שליחת הודעה לאיש קשר. רק רני (הבעלים) יכול לבקש לשלוח הודעות. השתמשי בזה כשרני מבקש לשלוח הודעה למישהו, להגיד למישהו משהו, או לענות למישהו.",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_name: {
          type: "string",
          description: "שם איש הקשר לשלוח אליו (למשל: 'עמית גולן', 'יוני')",
        },
        message: {
          type: "string",
          description: "ההודעה לשלוח",
        },
      },
      required: ["contact_name", "message"],
    },
  },
  {
    name: "send_calendar_invite",
    description:
      "שליחת זימון (הזמנת יומן ICS) למייל של איש קשר. ⚠️ חובה לבקש את כתובת המייל מהאיש קשר לפני השימוש בכלי הזה! אם אין לך את המייל – שאלי אותו.",
    input_schema: {
      type: "object" as const,
      properties: {
        email: {
          type: "string",
          description: "כתובת המייל של הנמען (למשל: 'david@gmail.com')",
        },
        title: {
          type: "string",
          description: "שם הפגישה/אירוע",
        },
        start_date: {
          type: "string",
          description: "תאריך ושעת התחלה בפורמט ISO 8601 (למשל: '2026-03-17T14:00:00')",
        },
        duration_minutes: {
          type: "number",
          description: "משך הפגישה בדקות (ברירת מחדל: 60)",
        },
      },
      required: ["email", "title", "start_date"],
    },
  },
  {
    name: "mute_group",
    description:
      "השתקת קבוצת וואטסאפ – לימור לא תגיב שם בכלל. רק רני (הבעלים) יכול להשתיק/לבטל השתקה.",
    input_schema: {
      type: "object" as const,
      properties: {
        group_name: {
          type: "string",
          description: "שם הקבוצה (למשל: 'מלחמת שאגת הארי')",
        },
        group_chat_id: {
          type: "string",
          description: "מזהה הצ'אט של הקבוצה (אם ידוע)",
        },
      },
      required: ["group_name"],
    },
  },
  {
    name: "unmute_group",
    description:
      "ביטול השתקת קבוצה – לימור תחזור להגיב שם.",
    input_schema: {
      type: "object" as const,
      properties: {
        group_name: {
          type: "string",
          description: "שם הקבוצה לביטול השתקה",
        },
      },
      required: ["group_name"],
    },
  },
  {
    name: "ontopo_search",
    description:
      "חיפוש שולחן פנוי במסעדה דרך אונטופו. צריך שם מסעדה (slug מהאתר), תאריך, שעה וכמות סועדים.",
    input_schema: {
      type: "object" as const,
      properties: {
        restaurant: {
          type: "string",
          description: "שם המסעדה כ-slug מאונטופו (למשל: 'ocd-restaurant', 'haachim', 'mashya'). זה החלק שמופיע ב-URL של המסעדה באתר ontopo.co.il",
        },
        date: {
          type: "string",
          description: "תאריך בפורמט YYYYMMDD (למשל: '20260320' ל-20 במרץ 2026)",
        },
        time: {
          type: "string",
          description: "שעה בפורמט HHMM (למשל: '2000' ל-20:00, '1930' ל-19:30)",
        },
        party_size: {
          type: "number",
          description: "מספר סועדים",
        },
      },
      required: ["restaurant", "date", "time", "party_size"],
    },
  },
  {
    name: "tabit_search",
    description:
      "חיפוש שולחן פנוי במסעדה דרך טאביט. מחפש לפי שם מסעדה, תאריך, שעה, כמות סועדים ועיר.",
    input_schema: {
      type: "object" as const,
      properties: {
        restaurant: {
          type: "string",
          description: "שם המסעדה (למשל: 'מסעדת הדגים', 'ZE SUSHI', 'קפה נחת'). אפשר בעברית או באנגלית.",
        },
        date: {
          type: "string",
          description: "תאריך בפורמט YYYYMMDD (למשל: '20260320' ל-20 במרץ 2026)",
        },
        time: {
          type: "string",
          description: "שעה בפורמט HHMM (למשל: '2000' ל-20:00, '1930' ל-19:30)",
        },
        party_size: {
          type: "number",
          description: "מספר סועדים",
        },
        city: {
          type: "string",
          description: "עיר לחיפוש (למשל: 'תל אביב', 'ירושלים', 'חיפה'). ברירת מחדל: תל אביב",
        },
      },
      required: ["restaurant", "date", "time", "party_size"],
    },
  },
];

const travelTools: Anthropic.Tool[] = [
  {
    name: "flight_search",
    description:
      "חיפוש טיסות. מחפש טיסות בזמן אמת לפי מוצא, יעד, תאריך וכו'.",
    input_schema: {
      type: "object" as const,
      properties: {
        origin: {
          type: "string",
          description: "עיר/שדה תעופה מוצא (למשל: 'Tel Aviv', 'London', 'TLV')",
        },
        destination: {
          type: "string",
          description: "עיר/שדה תעופה יעד (למשל: 'Paris', 'New York', 'CDG')",
        },
        date: {
          type: "string",
          description: "תאריך טיסה בפורמט YYYY-MM-DD (למשל: '2026-04-15')",
        },
        return_date: {
          type: "string",
          description: "תאריך חזרה בפורמט YYYY-MM-DD (אופציונלי, לטיסה הלוך-חזור)",
        },
        adults: {
          type: "number",
          description: "מספר נוסעים מבוגרים (ברירת מחדל: 1)",
        },
        cabin_class: {
          type: "string",
          description: "מחלקה: economy, premium_economy, business, first (ברירת מחדל: economy)",
        },
      },
      required: ["origin", "destination", "date"],
    },
  },
  {
    name: "hotel_search",
    description:
      "חיפוש מלונות. מחפש מלונות בזמן אמת לפי יעד, תאריכי צ'ק-אין/צ'ק-אאוט.",
    input_schema: {
      type: "object" as const,
      properties: {
        destination: {
          type: "string",
          description: "עיר או יעד (למשל: 'Paris', 'ברצלונה', 'Tokyo')",
        },
        checkin_date: {
          type: "string",
          description: "תאריך צ'ק-אין בפורמט YYYY-MM-DD",
        },
        checkout_date: {
          type: "string",
          description: "תאריך צ'ק-אאוט בפורמט YYYY-MM-DD",
        },
        adults: {
          type: "number",
          description: "מספר מבוגרים (ברירת מחדל: 2)",
        },
        rooms: {
          type: "number",
          description: "מספר חדרים (ברירת מחדל: 1)",
        },
      },
      required: ["destination", "checkin_date", "checkout_date"],
    },
  },
];

const bookingTools: Anthropic.Tool[] = [
  {
    name: "book_tabit",
    description:
      "הזמנת שולחן בפועל דרך טאביט. השתמשי רק אחרי שמצאת שולחן פנוי עם tabit_search והמשתמש אישר שרוצה להזמין.",
    input_schema: {
      type: "object" as const,
      properties: {
        publicUrlLabel: {
          type: "string",
          description:
            "שם המסעדה ב-URL של טאביט (למשל: 'ocd-restaurant', 'ze-sushi'). מופיע בתוצאת החיפוש.",
        },
        date: {
          type: "string",
          description: "תאריך בפורמט YYYYMMDD (למשל: '20260320')",
        },
        time: {
          type: "string",
          description: "שעה בפורמט HH:MM (למשל: '20:00', '19:30')",
        },
        party_size: {
          type: "number",
          description: "מספר סועדים",
        },
        first_name: {
          type: "string",
          description: "שם פרטי למזמין",
        },
        last_name: {
          type: "string",
          description: "שם משפחה למזמין",
        },
        phone: {
          type: "string",
          description: "טלפון למזמין",
        },
        email: {
          type: "string",
          description: "אימייל למזמין (אופציונלי)",
        },
      },
      required: [
        "publicUrlLabel",
        "date",
        "time",
        "party_size",
        "first_name",
        "last_name",
        "phone",
      ],
    },
  },
  {
    name: "book_ontopo",
    description:
      "הזמנת שולחן בפועל דרך אונטופו. השתמשי רק אחרי שמצאת שולחן פנוי עם ontopo_search והמשתמש אישר שרוצה להזמין.",
    input_schema: {
      type: "object" as const,
      properties: {
        restaurant_slug: {
          type: "string",
          description:
            "slug של המסעדה באונטופו (למשל: 'ocd-restaurant', 'mashya')",
        },
        date: {
          type: "string",
          description: "תאריך בפורמט YYYYMMDD (למשל: '20260320')",
        },
        time: {
          type: "string",
          description: "שעה בפורמט HH:MM (למשל: '20:00', '19:30')",
        },
        party_size: {
          type: "number",
          description: "מספר סועדים",
        },
        first_name: {
          type: "string",
          description: "שם פרטי למזמין",
        },
        last_name: {
          type: "string",
          description: "שם משפחה למזמין",
        },
        phone: {
          type: "string",
          description: "טלפון למזמין",
        },
        email: {
          type: "string",
          description: "אימייל למזמין",
        },
      },
      required: [
        "restaurant_slug",
        "date",
        "time",
        "party_size",
        "first_name",
        "last_name",
        "phone",
        "email",
      ],
    },
  },
];

const crmTools: Anthropic.Tool[] = [
  {
    name: "crm_search_policy",
    description: "חיפוש פוליסות ב-CRM לפי תעודת זהות של לקוח",
    input_schema: {
      type: "object" as const,
      properties: {
        person_id: {
          type: "string",
          description: "תעודת זהות של הלקוח (9 ספרות)",
        },
      },
      required: ["person_id"],
    },
  },
  {
    name: "crm_policy_details",
    description: "קבלת פרטים מלאים על פוליסה ספציפית לפי מזהה פוליסה",
    input_schema: {
      type: "object" as const,
      properties: {
        policy_index: {
          type: "number",
          description: "מזהה/אינדקס הפוליסה",
        },
      },
      required: ["policy_index"],
    },
  },
  {
    name: "crm_policy_customers",
    description: "קבלת פרטי לקוחות של פוליסה ספציפית",
    input_schema: {
      type: "object" as const,
      properties: {
        policy_index: {
          type: "number",
          description: "מזהה/אינדקס הפוליסה",
        },
      },
      required: ["policy_index"],
    },
  },
  {
    name: "crm_dashboard",
    description: "נתוני דשבורד כלליים או לפי חודש ושנה ספציפיים",
    input_schema: {
      type: "object" as const,
      properties: {
        month: {
          type: "number",
          description: "חודש (1-12). אופציונלי – אם לא צוין, מחזיר דשבורד כללי",
        },
        year: {
          type: "number",
          description: "שנה (למשל 2026). אופציונלי",
        },
      },
      required: [],
    },
  },
  {
    name: "crm_top_policies",
    description: "רשימת הפוליסות המובילות",
    input_schema: {
      type: "object" as const,
      properties: {
        top: {
          type: "number",
          description: "כמה פוליסות להחזיר (ברירת מחדל: 10)",
        },
      },
      required: [],
    },
  },
  {
    name: "crm_agents_report",
    description: "דוח סוכנים - נתוני ביצועים של סוכנים",
    input_schema: {
      type: "object" as const,
      properties: {
        page: { type: "number", description: "מספר עמוד (ברירת מחדל: 1)" },
        page_size: { type: "number", description: "גודל עמוד (ברירת מחדל: 50)" },
      },
      required: [],
    },
  },
  {
    name: "crm_send_sms",
    description: "שליחת הודעת SMS ללקוח דרך ה-CRM",
    input_schema: {
      type: "object" as const,
      properties: {
        mobile: {
          type: "string",
          description: "מספר טלפון של הנמען",
        },
        message: {
          type: "string",
          description: "תוכן ההודעה",
        },
      },
      required: ["mobile", "message"],
    },
  },
];

const instructionTools: Anthropic.Tool[] = [
  {
    name: "learn_instruction",
    description:
      "שמירת הוראה/כלל חדש שרני מלמד אותך. השתמשי כשרני אומר 'תזכרי ש...', 'מעכשיו...', 'כלל חדש:', או מלמד אותך התנהגות חדשה.",
    input_schema: {
      type: "object" as const,
      properties: {
        instruction: {
          type: "string",
          description: "ההוראה/כלל לזכור",
        },
      },
      required: ["instruction"],
    },
  },
  {
    name: "forget_instruction",
    description: "מחיקת הוראה שרני לימד אותך. אפשר לפי מספר סידורי או חיפוש טקסט.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "מספר ההוראה או טקסט לחיפוש",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "list_instructions",
    description: "הצגת כל ההוראות שרני לימד אותך.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];

const fileTools: Anthropic.Tool[] = [
  {
    name: "list_files",
    description: "הצגת רשימת קבצים בתיקייה",
    input_schema: {
      type: "object" as const,
      properties: {
        directory: {
          type: "string",
          description: "תיקיית משנה (אופציונלי, ברירת מחדל: תיקייה ראשית)",
        },
      },
      required: [],
    },
  },
  {
    name: "read_file",
    description: "קריאת תוכן קובץ טקסט",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "נתיב הקובץ (יחסי לתיקיית files)",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "save_file",
    description: "שמירת קובץ חדש",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "נתיב הקובץ (יחסי לתיקיית files)",
        },
        content: {
          type: "string",
          description: "תוכן הקובץ",
        },
      },
      required: ["path", "content"],
    },
  },
];

export interface SenderContext {
  chatId: string;
  name: string;
  isOwner: boolean;
}

// Callback for sending messages to owner - set by whatsapp.ts
let notifyOwnerCallback: ((message: string) => Promise<void>) | null = null;

export function setNotifyOwnerCallback(cb: (message: string) => Promise<void>): void {
  notifyOwnerCallback = cb;
}

// Callback for sending messages to any contact - set by whatsapp.ts
let sendMessageCallback: ((chatId: string, message: string) => Promise<void>) | null = null;

export function setSendMessageCallback(cb: (chatId: string, message: string) => Promise<void>): void {
  sendMessageCallback = cb;
}

// Callback for sending file to a contact - set by whatsapp.ts
let sendFileCallback: ((chatId: string, base64: string, filename: string, mimetype: string, caption?: string) => Promise<void>) | null = null;

export function setSendFileCallback(cb: (chatId: string, base64: string, filename: string, mimetype: string, caption?: string) => Promise<void>): void {
  sendFileCallback = cb;
}

async function handleToolCall(
  name: string,
  input: Record<string, any>,
  sender?: SenderContext
): Promise<string> {
  try {
    if (name === "create_event") {
      const start = new Date(input.start_date);
      const durationMs = (input.duration_minutes || 60) * 60 * 1000;
      const end = new Date(start.getTime() + durationMs);
      await createEvent(input.title, start, end);
      return `אירוע "${input.title}" נוצר בהצלחה ליום ${start.toLocaleDateString("he-IL")} בשעה ${start.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`;
    }
    if (name === "list_events") {
      const date = new Date(input.date);
      return await listEvents(date);
    }
    if (name === "request_meeting") {
      const requesterName = sender?.name || "מישהו";
      const chatId = sender?.chatId || "";

      // Check if there's already a pending request from this person
      if (hasPendingRequest(chatId)) {
        return `כבר שלחתי בקשה לרני בנושא הזה. מחכים לתשובה שלו – לא צריך לשלוח שוב.`;
      }

      addMeetingRequest(chatId, requesterName, input.topic, input.preferred_time);

      const timeInfo = input.preferred_time ? `\n⏰ זמן מועדף: ${input.preferred_time}` : "";
      const ownerMsg = `📅 בקשת פגישה חדשה!\n👤 ${requesterName} רוצה לקבוע פגישה עם רני\n📋 נושא: ${input.topic}${timeInfo}\n\nמתי נוח לך? ענה עם תאריך ושעה ואני אסדר הכל 😊`;

      if (notifyOwnerCallback) {
        notifyOwnerCallback(ownerMsg).catch((err) =>
          console.error("Failed to notify owner:", err)
        );
      }

      return `בקשת פגישה נשלחה לרני. הוא יחזור עם זמן מתאים.`;
    }
    if (name === "notify_owner") {
      if (notifyOwnerCallback) {
        notifyOwnerCallback(input.message).catch((err) =>
          console.error("Failed to notify owner:", err)
        );
      }
      return `ההודעה הועברה לרני.`;
    }

    // Send message to contact (owner only)
    if (name === "send_message") {
      if (!sender?.isOwner) {
        return "רק רני יכול לבקש לשלוח הודעות לאנשי קשר.";
      }
      const contact = findContactByName(input.contact_name);
      if (!contact) {
        const recent = getRecentContacts(5);
        const names = recent.map((c) => c.name).join(", ");
        return `❌ נכשל: לא מצאתי איש קשר בשם "${input.contact_name}". ההודעה לא נשלחה! אנשי קשר זמינים: ${names || "אין"}. נסי שוב עם אחד מהשמות האלה.`;
      }
      if (sendMessageCallback) {
        await sendMessageCallback(contact.chatId, input.message);
        return `✅ ההודעה נשלחה ל-${contact.name} בהצלחה!`;
      }
      return "❌ נכשל: לא הצלחתי לשלוח את ההודעה.";
    }

    // Mute/unmute groups (owner only)
    if (name === "mute_group") {
      if (!sender?.isOwner) return "רק רני יכול להשתיק קבוצות.";
      const chatId = input.group_chat_id || findGroupChatId(input.group_name);
      if (!chatId) return `❌ לא מצאתי קבוצה בשם "${input.group_name}". תוסיף אותי קודם לקבוצה.`;
      muteGroup(chatId, input.group_name);
      return `✅ השתקתי את הקבוצה "${input.group_name}". לא אגיב שם יותר.`;
    }
    if (name === "unmute_group") {
      if (!sender?.isOwner) return "רק רני יכול לבטל השתקת קבוצות.";
      const muted = getMutedGroups();
      const match = muted.find((g) => g.name.includes(input.group_name) || input.group_name.includes(g.name));
      if (!match) return `❌ הקבוצה "${input.group_name}" לא מושתקת.`;
      unmuteGroup(match.chatId);
      return `✅ ביטלתי השתקה של "${match.name}". אחזור להגיב שם.`;
    }

    // Send calendar invite (ICS) via email
    if (name === "send_calendar_invite") {
      const startDate = new Date(input.start_date);
      const duration = input.duration_minutes || 60;
      await sendCalendarInviteEmail({
        to: input.email,
        title: input.title,
        startDate,
        durationMinutes: duration,
        description: "פגישה עם רני - נקבעה דרך לימור",
      });
      return `✅ זימון נשלח למייל ${input.email}! (הזמנת יומן)`;
    }

    // Ontopo restaurant search
    if (name === "ontopo_search") {
      return await searchAvailability(input.restaurant, input.date, input.time, input.party_size);
    }

    // Tabit restaurant search
    if (name === "tabit_search") {
      return await searchTabit(input.restaurant, input.date, input.time, input.party_size, input.city);
    }

    // Restaurant booking
    if (name === "book_tabit") {
      return await bookTabit({
        publicUrlLabel: input.publicUrlLabel,
        date: input.date,
        time: input.time,
        partySize: input.party_size,
        firstName: input.first_name,
        lastName: input.last_name,
        phone: input.phone,
        email: input.email,
      });
    }
    if (name === "book_ontopo") {
      return await bookOntopo({
        restaurantSlug: input.restaurant_slug,
        date: input.date,
        time: input.time,
        partySize: input.party_size,
        firstName: input.first_name,
        lastName: input.last_name,
        phone: input.phone,
        email: input.email,
      });
    }

    // Travel tools
    if (name === "flight_search") {
      return await searchFlights(
        input.origin,
        input.destination,
        input.date,
        input.return_date,
        input.adults || 1,
        input.cabin_class || "economy"
      );
    }
    if (name === "hotel_search") {
      return await searchHotels(
        input.destination,
        input.checkin_date,
        input.checkout_date,
        input.adults || 2,
        input.rooms || 1
      );
    }

    // CRM tools - owner only
    if (name.startsWith("crm_")) {
      if (!sender?.isOwner) {
        return "אין לך הרשאה לגשת ל-CRM. רק רני יכול לבקש מידע זה.";
      }
      if (name === "crm_search_policy") {
        return await searchPolicyByPersonId(input.person_id);
      }
      if (name === "crm_policy_details") {
        return await getPolicyDetails(input.policy_index);
      }
      if (name === "crm_policy_customers") {
        return await getPolicyCustomers(input.policy_index);
      }
      if (name === "crm_dashboard") {
        return await getDashboard(input.month, input.year);
      }
      if (name === "crm_top_policies") {
        return await getTopPolicies(input.top || 10);
      }
      if (name === "crm_agents_report") {
        return await getAgentsReport(input.page || 1, input.page_size || 50);
      }
      if (name === "crm_send_sms") {
        return await sendSms(input.mobile, input.message);
      }
    }

    // File tools (owner only)
    if (name === "list_files") {
      if (!sender?.isOwner) return "רק רני יכול לגשת לקבצים.";
      return listFiles(input.directory);
    }
    if (name === "read_file") {
      if (!sender?.isOwner) return "רק רני יכול לגשת לקבצים.";
      return readFile(input.path);
    }
    if (name === "save_file") {
      if (!sender?.isOwner) return "רק רני יכול לשמור קבצים.";
      return saveFile(input.path, input.content);
    }

    // Instruction tools (owner only)
    if (name === "learn_instruction") {
      if (!sender?.isOwner) return "רק רני יכול ללמד אותי דברים חדשים.";
      saveInstruction(input.instruction);
      return `✅ שמרתי! מעכשיו אזכור: "${input.instruction}"`;
    }
    if (name === "forget_instruction") {
      if (!sender?.isOwner) return "רק רני יכול למחוק הוראות.";
      return removeInstruction(input.query);
    }
    if (name === "list_instructions") {
      if (!sender?.isOwner) return "רק רני יכול לראות הוראות.";
      return listInstructions();
    }

    return "פעולה לא מוכרת";
  } catch (error: any) {
    return `שגיאה: ${error.message}`;
  }
}

export async function sendMessage(
  history: Message[],
  memoryContext?: string,
  sender?: SenderContext
): Promise<string> {
  let systemPrompt = config.systemPrompt;
  if (memoryContext) {
    systemPrompt += "\n\n" + memoryContext;
  }

  // Load owner-defined instructions
  const instructionsContext = getInstructionsContext();
  if (instructionsContext) {
    systemPrompt += "\n\n" + instructionsContext;
  }

  // Add current date/time context
  const now = new Date();
  systemPrompt += `\n\nהתאריך והשעה הנוכחיים: ${now.toLocaleDateString("he-IL")} ${now.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}. היום: ${now.toLocaleDateString("he-IL", { weekday: "long" })}.`;

  // Add known contacts list so AI uses exact stored names
  const recentContacts = getRecentContacts(20);
  if (recentContacts.length > 0) {
    const contactsList = recentContacts.map((c) => c.name).join(", ");
    systemPrompt += `\n\nאנשי קשר מוכרים (השתמשי בשמות האלה בדיוק כשמשתמשת ב-send_message): ${contactsList}`;
  }

  // Scan conversation history for state indicators
  const assistantMessages = history.filter((m) => m.role === "assistant").map((m) => m.content);
  const raniApproved = assistantMessages.some((msg) =>
    /רני (פנוי|זמין|אישר|מאשר|מסכים)/.test(msg) ||
    /קבעתי (ביומן|את הפגישה|אירוע)/.test(msg) ||
    /הפגישה נקבעה/.test(msg)
  );

  // Extract time mentioned in conversation for calendar invites
  let mentionedTime = "";
  if (raniApproved) {
    for (const msg of assistantMessages) {
      // Match times like "14:30", "ב-14:00", "בשעה 15:00"
      const timeMatch = msg.match(/(\d{1,2}:\d{2})/);
      if (timeMatch) {
        mentionedTime = timeMatch[1];
      }
      // Match "בעוד שעה" type patterns - calculate from now
      if (/בעוד שעה/.test(msg) && !timeMatch) {
        const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
        mentionedTime = inOneHour.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
      }
    }
  }

  // Add sender context so bot knows who's talking
  if (sender) {
    if (sender.isOwner) {
      systemPrompt += `\n\nהמשתמש הנוכחי: רני (הבעלים שלך). אפשר לקבוע לו אירועים ישירות ביומן. יש לך גם גישה ל-CRM של ביטוח אופיר.`;
      if (config.ownerName && config.ownerPhone) {
        systemPrompt += `\n\n📋 פרטי רני להזמנת מסעדות (השתמשי בהם אוטומטית בלי לשאול!): שם: ${config.ownerName}, טלפון: ${config.ownerPhone}, מייל: ${config.ownerEmail || ""}`;
      }
    } else {
      if (raniApproved) {
        const timeInfo = mentionedTime ? ` השעה שסוכמה: ${mentionedTime} היום (${now.toISOString().split("T")[0]}T${mentionedTime}:00).` : "";
        systemPrompt += `\n\nהמשתמש הנוכחי: ${sender.name} (לא הבעלים). ⚠️ רני כבר אישר!${timeInfo} אם ${sender.name} מבקש זימון – בקשי ממנו את כתובת המייל שלו ואז שלחי עם send_calendar_invite! נושא: "שיחה עם רני". לא צריך request_meeting ולא notify_owner.`;
      } else {
        systemPrompt += `\n\nהמשתמש הנוכחי: ${sender.name} (לא הבעלים). אם הוא רוצה לקבוע פגישה עם רני – השתמשי ב-request_meeting ואמרי שאת בודקת עם רני.`;
      }
    }
  }

  const messages: Anthropic.MessageParam[] = history.map((m) => {
    // Build vision content blocks when image data is attached
    if (m.role === "user" && m.imageData) {
      return {
        role: "user" as const,
        content: [
          {
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: m.imageData.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: m.imageData.base64,
            },
          },
          { type: "text" as const, text: m.content || "מה יש בתמונה?" },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });

  // Include CRM + instruction + file tools only for owner, travel + booking tools for everyone
  const tools = sender?.isOwner
    ? [...calendarTools, ...travelTools, ...bookingTools, ...crmTools, ...instructionTools, ...fileTools]
    : [...calendarTools, ...travelTools, ...bookingTools];

  let response = await client.messages.create({
    model: config.model,
    max_tokens: config.maxTokens,
    system: systemPrompt,
    messages,
    tools,
  });

  // Handle tool use loop (supports multiple parallel tool calls)
  while (response.stop_reason === "tool_use") {
    const toolBlocks = response.content.filter((b) => b.type === "tool_use") as Anthropic.ToolUseBlock[];
    if (toolBlocks.length === 0) break;

    // Execute all tool calls (in parallel)
    const toolResults = await Promise.all(
      toolBlocks.map(async (toolBlock) => {
        const result = await handleToolCall(
          toolBlock.name,
          toolBlock.input as Record<string, any>,
          sender
        );
        console.log(`🔧 Tool: ${toolBlock.name} → ${result.substring(0, 200)}`);
        return { id: toolBlock.id, result };
      })
    );

    // Send all tool results back
    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: toolResults.map((tr) => ({
        type: "tool_result" as const,
        tool_use_id: tr.id,
        content: tr.result,
      })),
    });

    response = await client.messages.create({
      model: config.model,
      max_tokens: config.maxTokens,
      system: systemPrompt,
      messages,
      tools,
    });
  }

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock ? textBlock.text : "אופס, לא הצלחתי לייצר תשובה 😅 נסה שוב?";
}

const EXTRACT_PROMPT = `אתה מנתח שיחות. תפקידך לחלץ מידע חשוב ו**קבוע** מהשיחה שצריך לזכור לטווח ארוך.

החזר JSON בלבד בפורמט הזה (בלי markdown, בלי backticks):
{"name": "שם המשתמש אם נאמר, או null", "facts": ["עובדה 1", "עובדה 2"]}

מה כן לשמור:
- עובדות אישיות קבועות (שם, עבודה, תחביבים, העדפות, משפחה, מיקום)
- תזכורות עתידיות שהמשתמש ביקש

מה לא לשמור:
- פעולות זמניות ("לימור מחכה לתשובה", "לימור שלחה הודעה") - אלה לא עובדות לזכור
- בקשות חד-פעמיות שכבר טופלו ("ביקש לחפש מסעדה", "שאל על פוליסה")
- מידע על מה שלימור עשתה או לא עשתה
- מידע שהמשתמש רק שאל עליו (שאלות זה לא עובדות)
- דברים כלליים וברורים מאליהם

כלל חשוב: שמור רק 0-2 עובדות מכל שיחה. רוב השיחות לא מכילות מידע חדש לזכור.
אם אין מידע חדש, החזר: {"name": null, "facts": []}
כתוב בצורה קצרה וברורה בעברית`;

export async function extractFacts(
  history: Message[]
): Promise<{ name: string | null; facts: string[] }> {
  try {
    const lastMessages = history.slice(-4);
    const conversation = lastMessages
      .map((m) => `${m.role === "user" ? "משתמש" : "לימור"}: ${m.content}`)
      .join("\n");

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514", // Keep cheap model for fact extraction
      max_tokens: 256,
      system: EXTRACT_PROMPT,
      messages: [{ role: "user", content: conversation }],
    });

    const text = response.content.find((b) => b.type === "text")?.text || "{}";
    const parsed = JSON.parse(text);
    return {
      name: parsed.name || null,
      facts: Array.isArray(parsed.facts) ? parsed.facts : [],
    };
  } catch (error) {
    console.error("Memory extraction failed:", error);
    return { name: null, facts: [] };
  }
}
