import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config";

/** Multi-step planning tools (owner-only) */
export const planTools: Anthropic.Tool[] = [
  {
    name: "create_plan",
    description: `יצירת תוכנית רב-שלבית למשימה מורכבת. השתמשי כש${config.ownerName} מבקש משהו שדורש כמה צעדים — חופשה, אירוע, פרויקט, רכישה מורכבת. פרקי למשימות קטנות עם סדר הגיוני.`,
    input_schema: {
      type: "object" as const,
      properties: {
        title: {
          type: "string",
          description: "כותרת קצרה לתוכנית (למשל: 'חופשה ביוון', 'יום הולדת לאורי')",
        },
        steps: {
          type: "array",
          items: { type: "string" },
          description: "רשימת שלבים בסדר ביצוע (למשל: ['לבחור תאריכים', 'למצוא טיסות', 'להזמין מלון'])",
        },
      },
      required: ["title", "steps"],
    },
  },
  {
    name: "update_plan_step",
    description: "עדכון סטטוס שלב בתוכנית — סיום, התחלה, דילוג, או הוספת הערות.",
    input_schema: {
      type: "object" as const,
      properties: {
        plan_id: {
          type: "string",
          description: "מזהה התוכנית (plan-xxx)",
        },
        step_id: {
          type: "number",
          description: "מספר השלב (1, 2, 3...)",
        },
        status: {
          type: "string",
          description: "סטטוס חדש: pending | in_progress | done | skipped",
        },
        notes: {
          type: "string",
          description: "הערות אופציונליות (למשל: 'הוזמן טיסה ב-28.4')",
        },
      },
      required: ["plan_id", "step_id", "status"],
    },
  },
  {
    name: "list_plans",
    description: "הצגת כל התוכניות הפעילות עם סטטוס השלבים.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];
