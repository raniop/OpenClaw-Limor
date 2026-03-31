import Anthropic from "@anthropic-ai/sdk";

export const officePcTools: Anthropic.Tool[] = [
  {
    name: "office_pc_login",
    description: `מתחבר למחשב במשרד של רני ומבצע פעולות מרחוק.
פעולות:
- status: בודק אם המחשב דלוק ואם יש משתמש מחובר
- login: מבצע login אוטומטי (restart מהיר של 30 שניות)
- unlock: פותח את נעילת המסך (כשהמחשב מחובר אבל המסך נעול)
- lock: נועל את המסך
- restart: מפעיל מחדש את המחשב`,
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          enum: ["status", "login", "unlock", "lock", "restart"],
          description: "הפעולה לביצוע: status (בדיקת מצב), login (כניסה), unlock (פתיחת נעילת מסך), lock (נעילת מסך), restart (הפעלה מחדש)",
        },
      },
      required: ["action"],
    },
  },
];
