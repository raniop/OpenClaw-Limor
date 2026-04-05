import type { ToolHandler } from "./types";
import { calendarHandlers } from "./calendar";
import { bookingHandlers } from "./booking";
import { travelHandlers } from "./travel";
import { crmHandlers } from "./crm";
import { contactsHandlers } from "./contacts";
import { filesHandlers } from "./files";
import { instructionsHandlers } from "./instructions";
import { smarthomeHandlers } from "./smarthome";
import { modelHandlers } from "./model";
import { capabilitiesHandlers } from "./capabilities";
import { gettHandlers } from "./gett";
import { whatsappExtrasHandlers } from "./whatsapp-extras";
import { groupsHandlers } from "./groups";
import { smsHandlers } from "./sms";
import { webSearchHandlers } from "./web-search";
import { agentHandlers } from "./agents";
import { monitoringHandlers } from "./monitoring";
import { nimrodHandlers } from "./nimrod";
import { healthHandlers } from "./health";
import { officePcHandlers } from "./office-pc";
import { planHandlers } from "./plans";
import { selfAwarenessHandlers } from "./self-awareness";
import { emailHandlers } from "./email";
import { telegramHandlers } from "./telegram";

export type { ToolHandler } from "./types";

export const allHandlers: Record<string, ToolHandler> = {
  ...calendarHandlers,
  ...bookingHandlers,
  ...travelHandlers,
  ...crmHandlers,
  ...contactsHandlers,
  ...filesHandlers,
  ...instructionsHandlers,
  ...smarthomeHandlers,
  ...modelHandlers,
  ...capabilitiesHandlers,
  ...gettHandlers,
  ...whatsappExtrasHandlers,
  ...groupsHandlers,
  ...smsHandlers,
  ...webSearchHandlers,
  ...agentHandlers,
  ...monitoringHandlers,
  ...nimrodHandlers,
  ...healthHandlers,
  ...officePcHandlers,
  ...planHandlers,
  ...selfAwarenessHandlers,
  ...emailHandlers,
  ...telegramHandlers,
};
