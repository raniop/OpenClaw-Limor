import Anthropic from "@anthropic-ai/sdk";

/** Gett taxi booking tools (owner-only) */
export const gettTools: Anthropic.Tool[] = [
  {
    name: "gett_book_ride",
    description: "הזמנת מונית דרך Gett. השתמשי כשרני מבקש מונית, טקסי, או נסיעה.",
    input_schema: {
      type: "object" as const,
      properties: {
        pickup_address: {
          type: "string",
          description: "כתובת איסוף (למשל: 'רוטשילד 1, תל אביב')",
        },
        dropoff_address: {
          type: "string",
          description: "כתובת יעד (למשל: 'דיזנגוף 50, תל אביב')",
        },
        scheduled_at: {
          type: "string",
          description: "זמן מתוזמן בפורמט ISO (אופציונלי, למשל: '2026-03-19T14:00:00+02:00'). אם לא צוין — מונית עכשיו.",
        },
        note: {
          type: "string",
          description: "הערה לנהג (אופציונלי)",
        },
      },
      required: ["pickup_address", "dropoff_address"],
    },
  },
  {
    name: "gett_ride_status",
    description: "בדיקת סטטוס של הזמנת מונית קיימת",
    input_schema: {
      type: "object" as const,
      properties: {
        order_id: {
          type: "string",
          description: "מזהה ההזמנה",
        },
      },
      required: ["order_id"],
    },
  },
  {
    name: "gett_cancel_ride",
    description: "ביטול הזמנת מונית",
    input_schema: {
      type: "object" as const,
      properties: {
        order_id: {
          type: "string",
          description: "מזהה ההזמנה לביטול",
        },
      },
      required: ["order_id"],
    },
  },
];
