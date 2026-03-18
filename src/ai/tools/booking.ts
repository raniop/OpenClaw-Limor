import Anthropic from "@anthropic-ai/sdk";

/** Restaurant booking tools (available to all users) */
export const bookingTools: Anthropic.Tool[] = [
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
            "page_slug של המסעדה מתוצאות ontopo_search (למשל: 'ester', 'mashya'). השתמשי בדיוק ב-page_slug שהוחזר מ-booking_data!",
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
