/**
 * Unified tool call dispatcher.
 * Uses centralized permission service for access control.
 * Logs tool calls to audit log.
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
import { runCapabilityImplementation } from "../capabilities/capability-runner";
import { bookRide, getRideStatus, cancelRide } from "../gett";
import { implementCapability } from "../capabilities/claude-code";
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
import { canUseTool, getPermissionDeniedMessage } from "../permissions/permission-service";
import { logAudit } from "../audit/audit-log";

export async function handleToolCall(
  name: string,
  input: Record<string, any>,
  sender?: SenderContext
): Promise<string> {
  try {
    // --- Centralized permission check ---
    if (!canUseTool(name, sender)) {
      return getPermissionDeniedMessage(name);
    }

    // Log tool call to audit
    const actor = sender?.name || "unknown";
    logAudit(actor, "tool_call", name, "started", { input: Object.keys(input) });

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

      if (meetingStore.hasPendingRequest(chatId)) {
        return `כבר שלחתי בקשה לרני בנושא הזה. מחכים לתשובה שלו – לא צריך לשלוח שוב.`;
      }

      const meetingId = meetingStore.addMeetingRequest(chatId, requesterName, input.topic, input.preferred_time);

      const timeInfo = input.preferred_time ? `\n⏰ זמן מועדף: ${input.preferred_time}` : "";
      const ownerMsg = `📅 בקשת פגישה חדשה! (${meetingId})\n👤 ${requesterName} רוצה לקבוע פגישה עם רני\n📋 נושא: ${input.topic}${timeInfo}\n\n✅ לאשר: *אשר פגישה ${meetingId}*\nאו פשוט ענה עם תאריך ושעה ואני אסדר הכל 😊\n\n💡 הצעות: *אשר* / *דחה פגישה ${meetingId}* / *נדבר מחר*`;

      if (getNotifyOwnerCallback()) {
        getNotifyOwnerCallback()!(ownerMsg).catch((err) =>
          console.error("Failed to notify owner:", err)
        );
      }

      logAudit(requesterName, "meeting_request", meetingId, "created");
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

    // Send message to contact (owner only — already checked by canUseTool)
    if (name === "send_message") {
      const contact = findContactByName(input.contact_name);
      if (!contact) {
        const recent = getRecentContacts(5);
        const names = recent.map((c) => c.name).join(", ");
        return `❌ נכשל: לא מצאתי איש קשר בשם "${input.contact_name}". ההודעה לא נשלחה! אנשי קשר זמינים: ${names || "אין"}. נסי שוב עם אחד מהשמות האלה.`;
      }
      if (getSendMessageCallback()) {
        let targetChatId = contact.chatId;
        if (targetChatId.startsWith("manual_") || targetChatId.endsWith("@g.us")) {
          const phone = contact.phone.replace(/\D/g, "");
          if (phone) {
            targetChatId = `${phone}@c.us`;
          } else {
            return `❌ נכשל: אין ל-${contact.name} chatId אישי. הוא צריך לשלוח הודעה ללימור קודם.`;
          }
        }
        await getSendMessageCallback()!(targetChatId, input.message);
        logAudit(actor, "message_sent", contact.name, "success");
        return `✅ ההודעה נשלחה ל-${contact.name} בהצלחה!`;
      }
      return "❌ נכשל: לא הצלחתי לשלוח את ההודעה.";
    }

    // Mute/unmute groups
    if (name === "mute_group") {
      const chatId = input.group_chat_id || findGroupChatId(input.group_name);
      if (!chatId) return `❌ לא מצאתי קבוצה בשם "${input.group_name}". תוסיף אותי קודם לקבוצה.`;
      muteGroup(chatId, input.group_name);
      return `✅ השתקתי את הקבוצה "${input.group_name}". לא אגיב שם יותר.`;
    }
    if (name === "unmute_group") {
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

    // CRM tools
    if (name.startsWith("crm_")) {
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

    // Contact tools
    if (name === "add_contact") {
      return addManualContact(input.name, input.phone);
    }
    if (name === "list_contacts") {
      return listAllContacts();
    }
    if (name === "block_contact") {
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
      const contact = findContactByName(input.contact_name);
      if (!contact) return `❌ לא מצאתי איש קשר בשם "${input.contact_name}"`;
      const history = getHistory(contact.chatId);
      if (history.length === 0) return `אין היסטוריית שיחה עם ${contact.name}.`;
      const lastN = input.last_n || 10;
      const recent = history.slice(-lastN);
      return recent.map((m: any) => `${m.role === "user" ? contact.name : "לימור"}: ${m.content}`).join("\n");
    }

    if (name === "get_group_history") {
      const groupChatId = findGroupChatId(input.group_name);
      if (!groupChatId) return `❌ לא מצאתי קבוצה בשם "${input.group_name}". אני צריכה לראות הודעה בקבוצה קודם כדי לזהות אותה.`;
      const history = getHistory(groupChatId);
      if (history.length === 0) return `אין היסטוריית שיחה בקבוצה "${input.group_name}".`;
      const lastN = input.last_n || 20;
      const recent = history.slice(-lastN);
      return recent.map((m: any) => m.content).join("\n");
    }

    // Group summary (owner only — uses AI summarization)
    if (name === "summarize_group_activity") {
      const groupChatId = findGroupChatId(input.group_name);
      if (!groupChatId) return `❌ לא מצאתי קבוצה בשם "${input.group_name}".`;
      const history = getHistory(groupChatId);
      if (history.length === 0) return `אין היסטוריית שיחה בקבוצה "${input.group_name}".`;
      const sinceHours = input.since_hours || 24;
      const lastN = Math.min(history.length, sinceHours * 2); // rough estimate
      const recent = history.slice(-lastN);
      const messages = recent.map((m: any) => m.content).join("\n");
      return `📋 סיכום קבוצה "${input.group_name}" (${sinceHours} שעות אחרונות):\n\n${messages}\n\n---\nסה"כ ${recent.length} הודעות. סכם את ההודעות למעלה: מה קרה, מי הזכיר את רני, מה דורש פעולה.`;
    }

    // Create reminder / followup
    if (name === "create_reminder") {
      const { addFollowup } = require("../followups/followup-store");
      const dueHours = input.due_hours || 24;
      const dueAt = new Date(Date.now() + dueHours * 60 * 60 * 1000);
      const reason = `[מ-${input.from_name}] ${input.task}`;
      const entry = addFollowup(sender?.chatId || "", input.from_name, reason, dueAt);
      logAudit(actor, "reminder_created", input.from_name, "success", { task: input.task });
      return `✅ תזכורת נוצרה!\n📝 ${input.task}\n👤 מבקש: ${input.from_name}\n⏰ עד: ${dueAt.toLocaleString("he-IL")}`;
    }

    // File tools
    if (name === "list_files") {
      return listFiles(input.directory);
    }
    if (name === "read_file") {
      return readFile(input.path);
    }
    if (name === "save_file") {
      return saveFile(input.path, input.content);
    }

    // Instruction tools
    if (name === "learn_instruction") {
      saveInstruction(input.instruction);
      return `✅ שמרתי! מעכשיו אזכור: "${input.instruction}"`;
    }
    if (name === "forget_instruction") {
      return removeInstruction(input.query);
    }
    if (name === "list_instructions") {
      return listInstructions();
    }

    // Smart home tools
    if (name === "smart_home_control") {
      return controlDevice(input.device_name, input.action, input.value);
    }
    if (name === "smart_home_status") {
      const device = await findDevice(input.device_name);
      if (!device) return `❌ לא מצאתי מכשיר בשם "${input.device_name}"`;
      return getDeviceStatus(device.id);
    }
    if (name === "smart_home_list") {
      if (input.type === "rooms") return listRooms();
      return listDevices();
    }

    // Model switching
    if (name === "switch_model") {
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

    // Capability learning tools
    if (name === "create_capability_request") {
      const spec = createSpec({
        title: input.title,
        requestedBy: sender!.name,
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
      logAudit(actor, "capability_created", spec.id, "success");
      return `✅ בקשת יכולת נוצרה!\n\n📋 **${spec.title}** (${spec.id})\nסטטוס: ממתין לאישור\nרמה: ${spec.level}\n\nהבעיה: ${spec.problem}\nפתרון מוצע: ${spec.proposedSolution}\n\nכדי לאשר: *אשר יכולת ${spec.id}*`;
    }
    if (name === "list_capability_requests") {
      const status = input.status || "pending";
      const specs = status === "approved" ? listApproved() :
        status === "all" ? [...listPending(), ...listApproved()] : listPending();
      if (specs.length === 0) return `אין בקשות יכולת ${status === "pending" ? "ממתינות" : ""}.`;
      return specs.map(s => `- **${s.title}** (${s.id}) [${s.status}] — ${s.level}`).join("\n");
    }

    // Run capability implementation (full lifecycle)
    if (name === "run_capability") {
      console.log(`[capability] Running full implementation for: ${input.capability_id}`);
      return runCapabilityImplementation(input.capability_id);
    }

    // Coding / self-programming tools
    if (name === "code_start_session") {
      return createWorktree(input.capability_id);
    }
    if (name === "code_read") {
      return readProjectFile(input.path, input.capability_id);
    }
    if (name === "code_write") {
      return writeProjectFile(input.capability_id, input.path, input.content);
    }
    if (name === "code_execute") {
      return runInWorktree(input.capability_id, input.command);
    }
    if (name === "code_build_test") {
      return buildAndTest(input.capability_id);
    }
    if (name === "code_show_diff") {
      return getDiff(input.capability_id);
    }
    if (name === "code_apply") {
      return applyWorktree(input.capability_id);
    }
    if (name === "code_cleanup") {
      return cleanupWorktree(input.capability_id);
    }

    if (name === "code_implement") {
      console.log(`[claude-code] Implementation requested for: ${input.capability_id}`);
      return implementCapability(input.capability_id);
    }

    // Gett taxi tools
    if (name === "gett_book_ride") {
      return bookRide({
        pickupAddress: input.pickup_address,
        dropoffAddress: input.dropoff_address,
        scheduledAt: input.scheduled_at,
        note: input.note,
      });
    }
    if (name === "gett_ride_status") {
      return getRideStatus(input.order_id);
    }
    if (name === "gett_cancel_ride") {
      return cancelRide(input.order_id);
    }

    return "פעולה לא מוכרת";
  } catch (error: any) {
    return `שגיאה: ${error.message}`;
  }
}
