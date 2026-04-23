import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config";

/** Insurance tools (owner only) */
export const insuranceTools: Anthropic.Tool[] = [
  {
    name: "fetch_insurance_policies",
    description:
      `משיכת רשימת כל פוליסות הביטוח של ${config.ownerName} מהר הביטוח (אתר משרד האוצר). ` +
      "פרטי ההזדהות נשמרים בקונפיג. התהליך דורש קוד OTP שמגיע ב-SMS לטלפון — " +
      `תשאלי את ${config.ownerName} מה הקוד שקיבל ותעבירי אותו בפרמטר otp_code. ` +
      "אם אין otp_code, התחילי את תהליך ההתחברות וה-SMS יישלח אוטומטית.",
    input_schema: {
      type: "object" as const,
      properties: {
        otp_code: {
          type: "string",
          description: "קוד OTP שהתקבל ב-SMS. אם לא סופק — מתחיל תהליך התחברות חדש ושולח SMS.",
        },
      },
      required: [],
    },
  },
];
