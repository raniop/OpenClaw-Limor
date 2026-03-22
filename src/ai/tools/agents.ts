import Anthropic from "@anthropic-ai/sdk";

/** Tool for delegating tasks to sub-agents */
export const agentTools: Anthropic.Tool[] = [
  {
    name: "delegate_to_agent",
    description:
      "העברת משימה לסוכנת מתמחה מהצוות שלך. השתמשי כשהמשימה מתאימה להתמחות של אחת הסוכנות:\n" +
      "- michal: סיכום קבוצות WhatsApp\n" +
      "- ronit: מחקר אינטרנט (חיפוש, השוואה, מציאת מידע)\n" +
      "- noa: ניתוח נתונים וסטטיסטיקות\n" +
      "- yael: תכנון אוטומציות ו-workflows\n" +
      "- tal: בדיקת אבטחה (ספאם, phishing, הודעות חשודות)\n" +
      "- maya: בית חכם (תאורה, מזגן, תרחישים)\n" +
      "- adi: ניהול יומן (פגישות, התנגשויות, זמנים פנויים)\n" +
      "- hila: מסעדות ובילויים (המלצות, הזמנות, ביקורות)\n" +
      "- dana: קניות והשוואת מחירים (מוצרים, דילים, קופונים)\n" +
      "- boris: בקרת מערכת ו-DevOps (סטטוס, שגיאות, ביצועים, בריאות המערכת)",
    input_schema: {
      type: "object" as const,
      properties: {
        agent_id: {
          type: "string",
          enum: ["michal", "ronit", "noa", "yael", "tal", "maya", "adi", "hila", "dana", "boris"],
          description: "מזהה הסוכנת",
        },
        task: {
          type: "string",
          description: "תיאור המשימה לסוכנת",
        },
        context: {
          type: "string",
          description: "הקשר נוסף (היסטוריית שיחה, הודעה חשודה, נתונים לניתוח וכו')",
        },
      },
      required: ["agent_id", "task"],
    },
  },
];
