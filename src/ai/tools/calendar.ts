import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config";

/** Calendar, meeting, messaging, and restaurant search tools (available to all users) */
export const calendarTools: Anthropic.Tool[] = [
  {
    name: "create_event",
    description:
      `יצירת אירוע חדש ביומן של ${config.ownerName}. השתמשי בזה רק כש${config.ownerName} עצמו (הבעלים) מבקש לקבוע אירוע.`,
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
    name: "delete_event",
    description:
      `מחיקת אירוע מהיומן של ${config.ownerName}. רק ${config.ownerName} (הבעלים) יכול למחוק אירועים! אפשר למחוק לפי שם אירוע + תאריך, או למחוק את כל האירועים ביום מסוים.`,
    input_schema: {
      type: "object" as const,
      properties: {
        date: {
          type: "string",
          description: "תאריך בפורמט ISO 8601 (למשל: '2026-03-23')",
        },
        title: {
          type: "string",
          description: "שם האירוע למחיקה (למשל: 'פגישה עם דורון'). אם ריק — ימחוק את כל האירועים ביום",
        },
      },
      required: ["date"],
    },
  },
  {
    name: "list_events",
    description:
      `הצגת אירועים ביומן של ${config.ownerName} ליום מסוים. רק ${config.ownerName} (הבעלים) יכול לראות את היומן!`,
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
      `כשמישהו שהוא לא ${config.ownerName} (לא הבעלים) רוצה לקבוע פגישה עם ${config.ownerName}. השתמשי בזה כדי לשלוח בקשה ל${config.ownerName} ולחכות לאישורו. אף פעם לא לקבוע ישירות ביומן כשמישהו אחר מבקש!`,
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
      `העברת הודעה ל${config.ownerName} (הבעלים). ⚠️ שלחי פעם אחת בלבד לכל בקשה! בדקי בהיסטוריה שלא שלחת כבר על אותו נושא. אם כבר שלחת – לא לשלוח שוב!`,
    input_schema: {
      type: "object" as const,
      properties: {
        message: {
          type: "string",
          description: `ההודעה להעביר ל${config.ownerName} (למשל: 'יוני מבקש שתדבר איתו כשיש לך זמן')`,
        },
      },
      required: ["message"],
    },
  },
  {
    name: "send_message",
    description:
      `שליחת הודעה לאיש קשר. רק ${config.ownerName} (הבעלים) יכול לבקש לשלוח הודעות. השתמשי בזה כש${config.ownerName} מבקש לשלוח הודעה למישהו, להגיד למישהו משהו, או לענות למישהו.`,
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
      `השתקת קבוצת וואטסאפ – ${config.botName} לא תגיב שם בכלל. רק ${config.ownerName} (הבעלים) יכול להשתיק/לבטל השתקה.`,
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
      `ביטול השתקת קבוצה – ${config.botName} תחזור להגיב שם.`,
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
