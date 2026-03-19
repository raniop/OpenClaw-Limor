import Anthropic from "@anthropic-ai/sdk";

/** WhatsApp extra tools — group management, message ops, contact info, polls, labels, etc. (owner-only) */
export const whatsappExtraTools: Anthropic.Tool[] = [
  // 1. Group Members
  {
    name: "list_group_members",
    description: "הצגת חברי קבוצת וואטסאפ — שמות, טלפונים, ומי אדמין",
    input_schema: {
      type: "object" as const,
      properties: {
        group_name: {
          type: "string",
          description: "שם הקבוצה (או חלק ממנו)",
        },
      },
      required: ["group_name"],
    },
  },

  // 2. Message Search
  {
    name: "search_messages",
    description: "חיפוש הודעות בוואטסאפ — לפי טקסט, בכל הצ'אטים או בצ'אט ספציפי",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "טקסט לחיפוש",
        },
        contact_name: {
          type: "string",
          description: "שם איש קשר או קבוצה לחיפוש בתוכו (אופציונלי — בלי זה מחפש בכל הצ'אטים)",
        },
      },
      required: ["query"],
    },
  },

  // 3. Edit Message
  {
    name: "edit_message",
    description: "עריכת הודעה שלימור שלחה — מחפשת בהודעות האחרונות שנשלחו ומחליפה את הטקסט",
    input_schema: {
      type: "object" as const,
      properties: {
        chat_name: {
          type: "string",
          description: "שם הצ'אט/קבוצה שבו ההודעה נשלחה",
        },
        old_text: {
          type: "string",
          description: "חלק מהטקסט המקורי (כדי לזהות את ההודעה)",
        },
        new_text: {
          type: "string",
          description: "הטקסט החדש להחלפה",
        },
      },
      required: ["chat_name", "old_text", "new_text"],
    },
  },

  // 4. Delete Message
  {
    name: "delete_message",
    description: "מחיקת הודעה שלימור שלחה (מחיקה לכולם)",
    input_schema: {
      type: "object" as const,
      properties: {
        chat_name: {
          type: "string",
          description: "שם הצ'אט/קבוצה שבו ההודעה נשלחה",
        },
        message_text: {
          type: "string",
          description: "חלק מהטקסט של ההודעה למחיקה",
        },
      },
      required: ["chat_name", "message_text"],
    },
  },

  // 6. Check Read Receipt
  {
    name: "check_read_status",
    description: "בדיקה אם הודעה שנשלחה נקראה — מחזיר סטטוס: נשלחה/נמסרה/נקראה",
    input_schema: {
      type: "object" as const,
      properties: {
        chat_name: {
          type: "string",
          description: "שם הצ'אט שבו ההודעה נשלחה",
        },
        message_text: {
          type: "string",
          description: "חלק מהטקסט של ההודעה לבדיקה (אופציונלי — בלי זה בודק את ההודעה האחרונה)",
        },
      },
      required: ["chat_name"],
    },
  },

  // 7. Contact Profile Info
  {
    name: "get_contact_info",
    description: "קבלת מידע על איש קשר — תמונת פרופיל, ביו, קבוצות משותפות",
    input_schema: {
      type: "object" as const,
      properties: {
        phone_or_name: {
          type: "string",
          description: "מספר טלפון או שם איש קשר",
        },
      },
      required: ["phone_or_name"],
    },
  },

  // 8. Chat Labels
  {
    name: "list_labels",
    description: "הצגת כל התוויות (labels) הזמינות בוואטסאפ",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "add_label",
    description: "הוספת תווית (label) לצ'אט",
    input_schema: {
      type: "object" as const,
      properties: {
        label_name: {
          type: "string",
          description: "שם התווית",
        },
        chat_name: {
          type: "string",
          description: "שם הצ'אט/קבוצה להוספת התווית",
        },
      },
      required: ["label_name", "chat_name"],
    },
  },

  // 9. Pin Message
  {
    name: "pin_message",
    description: "הצמדת הודעה בצ'אט (ברירת מחדל: 7 ימים)",
    input_schema: {
      type: "object" as const,
      properties: {
        chat_name: {
          type: "string",
          description: "שם הצ'אט/קבוצה",
        },
        message_text: {
          type: "string",
          description: "חלק מהטקסט של ההודעה להצמדה",
        },
        duration_days: {
          type: "number",
          description: "כמה ימים להצמיד (ברירת מחדל: 7)",
        },
      },
      required: ["chat_name", "message_text"],
    },
  },

  // 10. Create Poll
  {
    name: "create_poll",
    description: "שליחת סקר (poll) לצ'אט או קבוצה",
    input_schema: {
      type: "object" as const,
      properties: {
        chat_name: {
          type: "string",
          description: "שם הצ'אט/קבוצה",
        },
        question: {
          type: "string",
          description: "שאלת הסקר",
        },
        options: {
          type: "array",
          items: { type: "string" },
          description: "רשימת אפשרויות לבחירה (2-12)",
        },
        allow_multiple: {
          type: "boolean",
          description: "האם לאפשר בחירה מרובה (ברירת מחדל: false)",
        },
      },
      required: ["chat_name", "question", "options"],
    },
  },

  // 11. Forward Message
  {
    name: "forward_message",
    description: "העברת הודעה מצ'אט אחד לצ'אט אחר",
    input_schema: {
      type: "object" as const,
      properties: {
        source_chat: {
          type: "string",
          description: "שם הצ'אט המקורי (שממנו להעביר)",
        },
        target_chat: {
          type: "string",
          description: "שם הצ'אט היעד (לאן להעביר)",
        },
        message_text: {
          type: "string",
          description: "חלק מהטקסט של ההודעה להעברה",
        },
      },
      required: ["source_chat", "target_chat", "message_text"],
    },
  },

  // 12. Group Management
  {
    name: "group_add_member",
    description: "הוספת משתתף לקבוצת וואטסאפ",
    input_schema: {
      type: "object" as const,
      properties: {
        group_name: {
          type: "string",
          description: "שם הקבוצה",
        },
        phone: {
          type: "string",
          description: "מספר טלפון של המשתתף להוספה (פורמט בינלאומי, למשל 972501234567)",
        },
      },
      required: ["group_name", "phone"],
    },
  },
  {
    name: "group_remove_member",
    description: "הסרת משתתף מקבוצת וואטסאפ",
    input_schema: {
      type: "object" as const,
      properties: {
        group_name: {
          type: "string",
          description: "שם הקבוצה",
        },
        phone: {
          type: "string",
          description: "מספר טלפון של המשתתף להסרה (פורמט בינלאומי)",
        },
      },
      required: ["group_name", "phone"],
    },
  },

  // 13. Check WhatsApp Number
  {
    name: "check_whatsapp_number",
    description: "בדיקה אם מספר טלפון רשום בוואטסאפ",
    input_schema: {
      type: "object" as const,
      properties: {
        phone: {
          type: "string",
          description: "מספר טלפון לבדיקה (פורמט בינלאומי, למשל 972501234567)",
        },
      },
      required: ["phone"],
    },
  },
];
