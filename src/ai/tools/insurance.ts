import Anthropic from "@anthropic-ai/sdk";

/** Insurance tools (owner only) */
export const insuranceTools: Anthropic.Tool[] = [
  {
    name: "fetch_insurance_policies",
    description:
      "משיכת רשימת כל פוליסות הביטוח של רני מהר הביטוח (אתר משרד האוצר). " +
      "פרטי ההזדהות נשמרים בקונפיג. התהליך דורש קוד OTP שמגיע ב-SMS לטלפון — " +
      "תשאלי את רני מה הקוד שקיבל ותעבירי אותו בפרמטר otp_code. " +
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
