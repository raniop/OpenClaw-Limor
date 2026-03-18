import Anthropic from "@anthropic-ai/sdk";

/** Flight and hotel search tools (available to all users) */
export const travelTools: Anthropic.Tool[] = [
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
