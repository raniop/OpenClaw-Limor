/**
 * Unified tool call dispatcher.
 * Extracted from ai-core.ts — exact same logic, no behavior changes.
 */
import { createEvent, listEvents } from "../calendar";
import { sendCalendarInviteEmail } from "../email";
import { approvalStore, meetingStore } from "../stores";
import { searchAvailability, bookOntopo } from "../ontopo";
import { searchTabit, bookTabit } from "../tabit";
import { findContactByName, getRecentContacts, addManualContact, listAllContacts } from "../contacts";
import { getHistory } from "../conversation";
import { controlDevice, getDeviceStatus, listRooms, listDevices, findDevice } from "../control4";
import { createSpec, listPending, listApproved } from "../capabilities";
import { createWorktree, runInWorktree, readProjectFile, writeProjectFile, buildAndTest, getDiff, applyWorktree, cleanupWorktree } from "../capabilities/sandbox";
import { bookRide, getRideStatus, cancelRide } from "../gett";
import { implementCapability } from "../capabilities/claude-code";
// removeApproved now via approvalStore (imported above)
import {
  searchPolicyByPersonId,
  getPolicyDetails,
  getPolicyCustomers,
  getTopPolicies,
  getDashboard,
  getAgentsReport,
  sendSms,
} from "../crm";
import { muteGroup, unmuteGroup, getMutedGroups, findGroupChatId } from "../muted-groups";
import { searchFlights } from "../flights";
import { searchHotels } from "../hotels";
import { saveInstruction, removeInstruction, listInstructions } from "../instructions";
import { listFiles, readFile, saveFile } from "../files";
import { getNotifyOwnerCallback, getSendMessageCallback } from "./callbacks";
import type { SenderContext } from "./types";

export async function handleToolCall(
  name: string,
  input: Record<string, any>,
  sender?: SenderContext
): Promise<string> {
  try {
    if (name === "create_event") {
      const start = new Date(input.start_date);
      const durationMs = (input.duration_minutes || 60) * 60 * 1000;
      const end = new Date(start.getTime() + durationMs);
      await createEvent(input.title, start, end);
      return `אירוע "${input.title}" נוצר בהצלחה ליום ${start.toLocaleDateString("he-IL")} בשעה ${start.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`;
    }
    if (name === "list_events") {
      const date = new Date(input.date);
      return await listEvents(date);
    }
    if (name === "request_meeting") {
      const requesterName = sender?.name || "מישהו";
      const chatId = sender?.chatId || "";

      // Check if there's already a pending request from this person
      if (meetingStore.hasPendingRequest(chatId)) {
        return `כבר שלחתי בקשה לרני בנושא הזה. מחכים לתשובה שלו – לא צריך לשלוח שוב.`;
      }

      const meetingId = meetingStore.addMeetingRequest(chatId, requesterName, input.topic, input.preferred_time);

      const timeInfo = input.preferred_time ? `\n⏰ זמן מועדף: ${input.preferred_time}` : "";
      const ownerMsg = `📅 בקשת פגישה חדשה! (${meetingId})\n👤 ${requesterName} רוצה לקבוע פגישה עם רני\n📋 נושא: ${input.topic}${timeInfo}\n\n✅ לאשר: *אשר פגישה ${meetingId}*\nאו פשוט ענה עם תאריך ושעה ואני אסדר הכל 😊`;

      if (getNotifyOwnerCallback()) {
        getNotifyOwnerCallback()!(ownerMsg).catch((err) =>
          console.error("Failed to notify owner:", err)
        );
      }

      return `בקשת פגישה נשלחה לרני. הוא יחזור עם זמן מתאים.`;
    }
    if (name === "notify_owner") {
      if (getNotifyOwnerCallback()) {
        getNotifyOwnerCallback()!(input.message).catch((err) =>
          console.error("Failed to notify owner:", err)
        );
      }
      return `ההודעה הועברה לרני.`;
    }

    // Send message to contact (owner only)
    if (name === "send_message") {
      if (!sender?.isOwner) {
        return "רק רני יכול לבקש לשלוח הודעות לאנשי קשר.";
      }
      const contact = findContactByName(input.contact_name);
      if (!contact) {
        const recent = getRecentContacts(5);
        const names = recent.map((c) => c.name).join(", ");
        return `❌ נכשל: לא מצאתי איש קשר בשם "${input.contact_name}". ההודעה לא נשלחה! אנשי קשר זמינים: ${names || "אין"}. נסי שוב עם אחד מהשמות האלה.`;
      }
      if (getSendMessageCallback()) {
        // Use personal chatId if available, otherwise try phone number
        let targetChatId = contact.chatId;
        if (targetChatId.startsWith("manual_") || targetChatId.endsWith("@g.us")) {
          // Can't send to manual/group chatId - try phone number instead
          const phone = contact.phone.replace(/\D/g, "");
          if (phone) {
            targetChatId = `${phone}@c.us`;
          } else {
            return `❌ נכשל: אין ל-${contact.name} chatId אישי. הוא צריך לשלוח הודעה ללימור קודם.`;
          }
        }
        await getSendMessageCallback()!(targetChatId, input.message);
        return `✅ ההודעה נשלחה ל-${contact.name} בהצלחה!`;
      }
      return "❌ נכשל: לא הצלחתי לשלוח את ההודעה.";
    }

    // Mute/unmute groups (owner only)
    if (name === "mute_group") {
      if (!sender?.isOwner) return "רק רני יכול להשתיק קבוצות.";
      const chatId = input.group_chat_id || findGroupChatId(input.group_name);
      if (!chatId) return `❌ לא מצאתי קבוצה בשם "${input.group_name}". תוסיף אותי קודם לקבוצה.`;
      muteGroup(chatId, input.group_name);
      return `✅ השתקתי את הקבוצה "${input.group_name}". לא אגיב שם יותר.`;
    }
    if (name === "unmute_group") {
      if (!sender?.isOwner) return "רק רני יכול לבטל השתקת קבוצות.";
      const muted = getMutedGroups();
      const match = muted.find((g) => g.name.includes(input.group_name) || input.group_name.includes(g.name));
      if (!match) return `❌ הקבוצה "${input.group_name}" לא מושתקת.`;
      unmuteGroup(match.chatId);
      return `✅ ביטלתי השתקה של "${match.name}". אחזור להגיב שם.`;
    }

    // Send calendar invite (ICS) via email
    if (name === "send_calendar_invite") {
      const startDate = new Date(input.start_date);
      const duration = input.duration_minutes || 60;
      await sendCalendarInviteEmail({
        to: input.email,
        title: input.title,
        startDate,
        durationMinutes: duration,
        description: "פגישה עם רני - נקבעה דרך לימור",
      });
      return `✅ זימון נשלח למייל ${input.email}! (הזמנת יומן)`;
    }

    // Ontopo restaurant search
    if (name === "ontopo_search") {
      return await searchAvailability(input.restaurant, input.date, input.time, input.party_size);
    }

    // Tabit restaurant search
    if (name === "tabit_search") {
      return await searchTabit(input.restaurant, input.date, input.time, input.party_size, input.city);
    }

    // Restaurant booking
    if (name === "book_tabit") {
      return await bookTabit({
        publicUrlLabel: input.publicUrlLabel,
        date: input.date,
        time: input.time,
        partySize: input.party_size,
        firstName: input.first_name,
        lastName: input.last_name,
        phone: input.phone,
        email: input.email,
      });
    }
    if (name === "book_ontopo") {
      return await bookOntopo({
        restaurantSlug: input.restaurant_slug,
        date: input.date,
        time: input.time,
        partySize: input.party_size,
        firstName: input.first_name,
        lastName: input.last_name,
        phone: input.phone,
        email: input.email,
      });
    }

    // Travel tools
    if (name === "flight_search") {
      return await searchFlights(
        input.origin,
        input.destination,
        input.date,
        input.return_date,
        input.adults || 1,
        input.cabin_class || "economy"
      );
    }
    if (name === "hotel_search") {
      return await searchHotels(
        input.destination,
        input.checkin_date,
        input.checkout_date,
        input.adults || 2,
        input.rooms || 1
      );
    }

    // CRM tools - owner only
    if (name.startsWith("crm_")) {
      if (!sender?.isOwner) {
        return "אין לך הרשאה לגשת ל-CRM. רק רני יכול לבקש מידע זה.";
      }
      if (name === "crm_search_policy") {
        return await searchPolicyByPersonId(input.person_id);
      }
      if (name === "crm_policy_details") {
        return await getPolicyDetails(input.policy_index);
      }
      if (name === "crm_policy_customers") {
        return await getPolicyCustomers(input.policy_index);
      }
      if (name === "crm_dashboard") {
        return await getDashboard(input.month, input.year);
      }
      if (name === "crm_top_policies") {
        return await getTopPolicies(input.top || 10);
      }
      if (name === "crm_agents_report") {
        return await getAgentsReport(input.page || 1, input.page_size || 50);
      }
      if (name === "crm_send_sms") {
        return await sendSms(input.mobile, input.message);
      }
    }

    // Contact tools (owner only)
    if (name === "add_contact") {
      if (!sender?.isOwner) return "רק רני יכול להוסיף אנשי קשר.";
      return addManualContact(input.name, input.phone);
    }
    if (name === "list_contacts") {
      if (!sender?.isOwner) return "רק רני יכול לראות אנשי קשר.";
      return listAllContacts();
    }
    if (name === "block_contact") {
      if (!sender?.isOwner) return "רק רני יכול לחסום אנשי קשר.";
      const contact = findContactByName(input.contact_name);
      if (!contact) return `❌ לא מצאתי איש קשר בשם "${input.contact_name}"`;
      if (contact.chatId.startsWith("manual_") || contact.chatId.endsWith("@g.us")) {
        return `❌ ${contact.name} לא מאושר כרגע (הוא מקבוצה או manual). אין מה לחסום.`;
      }
      const removed = approvalStore.removeApproved(contact.chatId);
      if (removed) {
        return `✅ חסמתי את ${contact.name}. הוא לא יוכל לדבר איתי עד שתאשר אותו מחדש.`;
      }
      return `${contact.name} לא היה מאושר.`;
    }

    if (name === "get_contact_history") {
      if (!sender?.isOwner) return "רק רני יכול לראות היסטוריית שיחות.";
      const contact = findContactByName(input.contact_name);
      if (!contact) return `❌ לא מצאתי איש קשר בשם "${input.contact_name}"`;
      const history = getHistory(contact.chatId);
      if (history.length === 0) return `אין היסטוריית שיחה עם ${contact.name}.`;
      const lastN = input.last_n || 10;
      const recent = history.slice(-lastN);
      return recent.map((m: any) => `${m.role === "user" ? contact.name : "לימור"}: ${m.content}`).join("\n");
    }

    if (name === "get_group_history") {
      if (!sender?.isOwner) return "רק רני יכול לראות היסטוריית קבוצות.";
      // Find group chatId by name
      const groupChatId = findGroupChatId(input.group_name);
      if (!groupChatId) return `❌ לא מצאתי קבוצה בשם "${input.group_name}". אני צריכה לראות הודעה בקבוצה קודם כדי לזהות אותה.`;
      const history = getHistory(groupChatId);
      if (history.length === 0) return `אין היסטוריית שיחה בקבוצה "${input.group_name}".`;
      const lastN = input.last_n || 20;
      const recent = history.slice(-lastN);
      return recent.map((m: any) => m.content).join("\n");
    }

    // File tools (owner only)
    if (name === "list_files") {
      if (!sender?.isOwner) return "רק רני יכול לגשת לקבצים.";
      return listFiles(input.directory);
    }
    if (name === "read_file") {
      if (!sender?.isOwner) return "רק רני יכול לגשת לקבצים.";
      return readFile(input.path);
    }
    if (name === "save_file") {
      if (!sender?.isOwner) return "רק רני יכול לשמור קבצים.";
      return saveFile(input.path, input.content);
    }

    // Instruction tools (owner only)
    if (name === "learn_instruction") {
      if (!sender?.isOwner) return "רק רני יכול ללמד אותי דברים חדשים.";
      saveInstruction(input.instruction);
      return `✅ שמרתי! מעכשיו אזכור: "${input.instruction}"`;
    }
    if (name === "forget_instruction") {
      if (!sender?.isOwner) return "רק רני יכול למחוק הוראות.";
      return removeInstruction(input.query);
    }
    if (name === "list_instructions") {
      if (!sender?.isOwner) return "רק רני יכול לראות הוראות.";
      return listInstructions();
    }

    // Smart home tools (owner only)
    if (name === "smart_home_control") {
      if (!sender?.isOwner) return "רק רני יכול לשלוט בבית החכם.";
      return controlDevice(input.device_name, input.action, input.value);
    }
    if (name === "smart_home_status") {
      if (!sender?.isOwner) return "רק רני יכול לבדוק סטטוס בית חכם.";
      const device = await findDevice(input.device_name);
      if (!device) return `❌ לא מצאתי מכשיר בשם "${input.device_name}"`;
      return getDeviceStatus(device.id);
    }
    if (name === "smart_home_list") {
      if (!sender?.isOwner) return "רק רני יכול לראות מכשירי בית חכם.";
      if (input.type === "rooms") return listRooms();
      return listDevices();
    }

    // Model switching (owner only)
    if (name === "switch_model") {
      if (!sender?.isOwner) return "רק רני יכול להחליף מודל.";
      const MODEL_MAP: Record<string, string> = {
        sonnet: "claude-sonnet-4-6",
        opus: "claude-opus-4-6",
      };
      const target = input.model?.toLowerCase();
      const modelId = MODEL_MAP[target];
      if (!modelId) return `❌ מודל לא מוכר: "${input.model}". אפשרויות: sonnet, opus`;
      const { config } = require("../config");
      const previous = config.model;
      config.model = modelId;
      console.log(`[model] Switched from ${previous} to ${modelId}`);
      return `✅ עברתי ל-${target.charAt(0).toUpperCase() + target.slice(1)}! (${modelId})\nשים לב: זה חוזר ל-Sonnet אחרי restart.`;
    }
    if (name === "get_current_model") {
      const { config } = require("../config");
      const name_ = config.model.includes("opus") ? "Opus" : "Sonnet";
      return `המודל הנוכחי: **${name_}** (${config.model})`;
    }

    // Capability learning tools (owner only)
    if (name === "create_capability_request") {
      if (!sender?.isOwner) return "רק רני יכול לבקש יכולות חדשות.";
      const spec = createSpec({
        title: input.title,
        requestedBy: sender.name,
        problem: input.problem,
        whyCurrentSystemCantDoIt: input.why_cant_do_it,
        proposedSolution: input.proposed_solution,
        affectedModules: input.affected_modules ? input.affected_modules.split(",").map((s: string) => s.trim()) : [],
        requiredTools: [],
        risks: input.risks ? input.risks.split(",").map((s: string) => s.trim()) : [],
        validationPlan: input.validation_plan || "",
        level: input.level || "code_change",
      });
      console.log(`[capability] New capability request: ${spec.id} — ${spec.title}`);
      return `✅ בקשת יכולת נוצרה!\n\n📋 **${spec.title}** (${spec.id})\nסטטוס: ממתין לאישור\nרמה: ${spec.level}\n\nהבעיה: ${spec.problem}\nפתרון מוצע: ${spec.proposedSolution}\n\nכדי לאשר: *אשר יכולת ${spec.id}*`;
    }
    if (name === "list_capability_requests") {
      if (!sender?.isOwner) return "רק רני יכול לראות בקשות יכולת.";
      const status = input.status || "pending";
      const specs = status === "approved" ? listApproved() :
        status === "all" ? [...listPending(), ...listApproved()] : listPending();
      if (specs.length === 0) return `אין בקשות יכולת ${status === "pending" ? "ממתינות" : ""}.`;
      return specs.map(s => `- **${s.title}** (${s.id}) [${s.status}] — ${s.level}`).join("\n");
    }

    // Coding / self-programming tools (owner only)
    if (name === "code_start_session") {
      if (!sender?.isOwner) return "רק רני יכול להתחיל session תכנות.";
      return createWorktree(input.capability_id);
    }
    if (name === "code_read") {
      if (!sender?.isOwner) return "רק רני יכול לקרוא קוד.";
      return readProjectFile(input.path, input.capability_id);
    }
    if (name === "code_write") {
      if (!sender?.isOwner) return "רק רני יכול לכתוב קוד.";
      return writeProjectFile(input.capability_id, input.path, input.content);
    }
    if (name === "code_execute") {
      if (!sender?.isOwner) return "רק רני יכול להריץ פקודות.";
      return runInWorktree(input.capability_id, input.command);
    }
    if (name === "code_build_test") {
      if (!sender?.isOwner) return "רק רני יכול לבנות ולבדוק.";
      return buildAndTest(input.capability_id);
    }
    if (name === "code_show_diff") {
      if (!sender?.isOwner) return "רק רני יכול לראות שינויים.";
      return getDiff(input.capability_id);
    }
    if (name === "code_apply") {
      if (!sender?.isOwner) return "רק רני יכול להחיל שינויים.";
      return applyWorktree(input.capability_id);
    }
    if (name === "code_cleanup") {
      if (!sender?.isOwner) return "רק רני יכול לנקות worktree.";
      return cleanupWorktree(input.capability_id);
    }

    if (name === "code_implement") {
      if (!sender?.isOwner) return "רק רני יכול להפעיל Claude Code.";
      console.log(`[claude-code] Implementation requested for: ${input.capability_id}`);
      return implementCapability(input.capability_id);
    }

    // Gett taxi tools (owner only)
    if (name === "gett_book_ride") {
      if (!sender?.isOwner) return "רק רני יכול להזמין מונית.";
      return bookRide({
        pickupAddress: input.pickup_address,
        dropoffAddress: input.dropoff_address,
        scheduledAt: input.scheduled_at,
        note: input.note,
      });
    }
    if (name === "gett_ride_status") {
      if (!sender?.isOwner) return "רק רני יכול לבדוק סטטוס מונית.";
      return getRideStatus(input.order_id);
    }
    if (name === "gett_cancel_ride") {
      if (!sender?.isOwner) return "רק רני יכול לבטל מונית.";
      return cancelRide(input.order_id);
    }

    return "פעולה לא מוכרת";
  } catch (error: any) {
    return `שגיאה: ${error.message}`;
  }
}
