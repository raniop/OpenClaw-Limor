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
import { findContactByName, findContactByPhone, getRecentContacts, addManualContact, listAllContacts } from "../contacts";
import { config as appConfig } from "../config";
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
import { getClient } from "../whatsapp";
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
      const result = addManualContact(input.name, input.phone);
      // Auto-approve contacts added by owner — they should be able to talk to Limor immediately
      const phone = input.phone.replace(/\D/g, "");
      if (phone) {
        // Find if this phone already has a pending approval and approve it
        // Also add the manual chatId to approved list
        const manualChatId = `manual_${phone}`;
        approvalStore.addApproved(manualChatId);
      }
      logAudit(actor, "contact_added_and_approved", input.name, "success");
      return result;
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
      // Find requester's chatId so we can notify them when completed
      const requesterContact = findContactByName(input.from_name);
      const entry = addFollowup(sender?.chatId || "", input.from_name, reason, dueAt, requesterContact?.chatId, input.from_name);
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

    // ==========================================
    // WhatsApp Extra Tools
    // ==========================================

    // 1. List Group Members
    if (name === "list_group_members") {
      const waClient = getClient();
      if (!waClient) return "❌ לקוח וואטסאפ לא מחובר.";
      const groupChatId = findGroupChatId(input.group_name);
      if (!groupChatId) return `❌ לא מצאתי קבוצה בשם "${input.group_name}".`;
      const chat = await waClient.getChatById(groupChatId) as any;
      if (!chat.isGroup) return `❌ "${input.group_name}" הוא לא קבוצה.`;
      const participants = chat.participants || [];
      const botNumber = waClient.info?.wid?.user || "";
      const ownerPhone = appConfig.ownerPhone?.replace(/\D/g, "") || "";
      const members = await Promise.all(
        participants.map(async (p: any) => {
          const pNumber = p.id.user || "";
          try {
            const contact = await waClient.getContactById(p.id._serialized);
            const rawName = contact.pushname || contact.name || "לא ידוע";
            const phone = contact.number || pNumber;
            // Identify bot itself
            if (pNumber === botNumber) {
              return { name: "לימור (אני 🤖)", phone };
            }
            // Identify owner
            if (phone.replace(/\D/g, "") === ownerPhone || pNumber === ownerPhone) {
              return { name: `${rawName} (הבעלים)`, phone };
            }
            // Match with known contacts by phone for accurate name
            const knownContact = findContactByPhone(phone);
            const finalName = knownContact ? knownContact.name : rawName;
            return { name: finalName, phone };
          } catch {
            if (pNumber === botNumber) return { name: "לימור (אני 🤖)", phone: pNumber };
            return { name: "לא ידוע", phone: pNumber };
          }
        })
      );
      const lines = members.map((m: any) => `👤 ${m.name} (${m.phone})`);
      return `📋 חברי הקבוצה "${input.group_name}" (${members.length}):\n${lines.join("\n")}`;
    }

    // 2. Search Messages
    if (name === "search_messages") {
      const waClient = getClient();
      if (!waClient) return "❌ לקוח וואטסאפ לא מחובר.";
      const options: any = { limit: 20 };
      if (input.contact_name) {
        const contact = findContactByName(input.contact_name);
        if (contact) {
          options.chatId = contact.chatId;
        } else {
          const groupId = findGroupChatId(input.contact_name);
          if (groupId) options.chatId = groupId;
        }
      }
      const results = await waClient.searchMessages(input.query, options);
      if (results.length === 0) return `לא נמצאו הודעות עבור "${input.query}".`;
      const lines = await Promise.all(
        results.slice(0, 20).map(async (m: any) => {
          const contact = await m.getContact();
          const name_ = contact.pushname || contact.name || contact.number || "לא ידוע";
          const time = new Date(m.timestamp * 1000).toLocaleString("he-IL");
          return `[${time}] ${name_}: ${m.body}`;
        })
      );
      return `🔍 תוצאות חיפוש "${input.query}" (${results.length}):\n${lines.join("\n")}`;
    }

    // 3. Edit Message
    if (name === "edit_message") {
      const waClient = getClient();
      if (!waClient) return "❌ לקוח וואטסאפ לא מחובר.";
      const contact = findContactByName(input.chat_name);
      let chatId = contact?.chatId;
      if (!chatId) chatId = findGroupChatId(input.chat_name);
      if (!chatId) return `❌ לא מצאתי צ'אט בשם "${input.chat_name}".`;
      const chat = await waClient.getChatById(chatId);
      const messages = await chat.fetchMessages({ limit: 30 });
      const myMsg = messages.reverse().find((m: any) => m.fromMe && m.body.includes(input.old_text));
      if (!myMsg) return `❌ לא מצאתי הודעה שלי שמכילה "${input.old_text}" ב-30 ההודעות האחרונות.`;
      await myMsg.edit(input.new_text);
      return `✅ ההודעה עודכנה בהצלחה!`;
    }

    // 4. Delete Message
    if (name === "delete_message") {
      const waClient = getClient();
      if (!waClient) return "❌ לקוח וואטסאפ לא מחובר.";
      const contact = findContactByName(input.chat_name);
      let chatId = contact?.chatId;
      if (!chatId) chatId = findGroupChatId(input.chat_name);
      if (!chatId) return `❌ לא מצאתי צ'אט בשם "${input.chat_name}".`;
      const chat = await waClient.getChatById(chatId);
      const messages = await chat.fetchMessages({ limit: 30 });
      const myMsg = messages.reverse().find((m: any) => m.fromMe && m.body.includes(input.message_text));
      if (!myMsg) return `❌ לא מצאתי הודעה שלי שמכילה "${input.message_text}" ב-30 ההודעות האחרונות.`;
      await myMsg.delete(true);
      return `✅ ההודעה נמחקה בהצלחה!`;
    }

    // 6. Check Read Receipt
    if (name === "check_read_status") {
      const waClient = getClient();
      if (!waClient) return "❌ לקוח וואטסאפ לא מחובר.";
      const contact = findContactByName(input.chat_name);
      let chatId = contact?.chatId;
      if (!chatId) chatId = findGroupChatId(input.chat_name);
      if (!chatId) return `❌ לא מצאתי צ'אט בשם "${input.chat_name}".`;
      const chat = await waClient.getChatById(chatId);
      const messages = await chat.fetchMessages({ limit: 20 });
      let targetMsg: any;
      if (input.message_text) {
        targetMsg = messages.reverse().find((m: any) => m.fromMe && m.body.includes(input.message_text));
      } else {
        targetMsg = messages.reverse().find((m: any) => m.fromMe);
      }
      if (!targetMsg) return "❌ לא מצאתי הודעה שלי לבדיקה.";
      const info = await targetMsg.getInfo();
      if (!info) return "❌ לא הצלחתי לקבל מידע על ההודעה.";
      const readBy = info.read?.length || 0;
      const deliveredTo = info.delivery?.length || 0;
      if (readBy > 0) return `✅ ההודעה נקראה (${readBy} קוראים).`;
      if (deliveredTo > 0) return `📨 ההודעה נמסרה (${deliveredTo}) אבל עדיין לא נקראה.`;
      return `📤 ההודעה נשלחה אבל עדיין לא נמסרה.`;
    }

    // 7. Contact Profile Info
    if (name === "get_contact_info") {
      const waClient = getClient();
      if (!waClient) return "❌ לקוח וואטסאפ לא מחובר.";
      let contactId: string;
      const knownContact = findContactByName(input.phone_or_name);
      if (knownContact) {
        const phone = knownContact.phone.replace(/\D/g, "");
        contactId = `${phone}@c.us`;
      } else {
        const phone = input.phone_or_name.replace(/\D/g, "");
        contactId = `${phone}@c.us`;
      }
      try {
        const waContact = await waClient.getContactById(contactId);
        const profilePic = await waContact.getProfilePicUrl().catch(() => null);
        const about = await waContact.getAbout().catch(() => null);
        const name_ = waContact.pushname || waContact.name || "לא ידוע";
        const lines = [`👤 ${name_}`, `📱 ${waContact.number}`];
        if (about) lines.push(`📝 ביו: ${about}`);
        if (profilePic) lines.push(`🖼️ תמונת פרופיל: ${profilePic}`);
        return lines.join("\n");
      } catch {
        return `❌ לא מצאתי איש קשר "${input.phone_or_name}" בוואטסאפ.`;
      }
    }

    // 8a. List Labels
    if (name === "list_labels") {
      const waClient = getClient();
      if (!waClient) return "❌ לקוח וואטסאפ לא מחובר.";
      const labels = await waClient.getLabels();
      if (labels.length === 0) return "אין תוויות מוגדרות.";
      const lines = labels.map((l: any) => `🏷️ ${l.name} (ID: ${l.id})`);
      return `📋 תוויות (${labels.length}):\n${lines.join("\n")}`;
    }

    // 8b. Add Label
    if (name === "add_label") {
      const waClient = getClient();
      if (!waClient) return "❌ לקוח וואטסאפ לא מחובר.";
      const labels = await waClient.getLabels();
      const label = labels.find((l: any) => l.name.includes(input.label_name) || input.label_name.includes(l.name));
      if (!label) return `❌ לא מצאתי תווית בשם "${input.label_name}". השתמשי ב-list_labels כדי לראות תוויות זמינות.`;
      const contact = findContactByName(input.chat_name);
      let chatId = contact?.chatId;
      if (!chatId) chatId = findGroupChatId(input.chat_name);
      if (!chatId) return `❌ לא מצאתי צ'אט בשם "${input.chat_name}".`;
      await waClient.addOrRemoveLabels([label.id], [chatId]);
      return `✅ התווית "${label.name}" נוספה לצ'אט "${input.chat_name}".`;
    }

    // 9. Pin Message
    if (name === "pin_message") {
      const waClient = getClient();
      if (!waClient) return "❌ לקוח וואטסאפ לא מחובר.";
      const contact = findContactByName(input.chat_name);
      let chatId = contact?.chatId;
      if (!chatId) chatId = findGroupChatId(input.chat_name);
      if (!chatId) return `❌ לא מצאתי צ'אט בשם "${input.chat_name}".`;
      const chat = await waClient.getChatById(chatId);
      const messages = await chat.fetchMessages({ limit: 30 });
      const targetMsg = messages.reverse().find((m: any) => m.body.includes(input.message_text));
      if (!targetMsg) return `❌ לא מצאתי הודעה שמכילה "${input.message_text}".`;
      const durationSec = (input.duration_days || 7) * 86400;
      await targetMsg.pin(durationSec);
      return `📌 ההודעה הוצמדה בהצלחה ל-${input.duration_days || 7} ימים!`;
    }

    // 10. Create Poll
    if (name === "create_poll") {
      const waClient = getClient();
      if (!waClient) return "❌ לקוח וואטסאפ לא מחובר.";
      const contact = findContactByName(input.chat_name);
      let chatId = contact?.chatId;
      if (!chatId) chatId = findGroupChatId(input.chat_name);
      if (!chatId) return `❌ לא מצאתי צ'אט בשם "${input.chat_name}".`;
      const { Poll } = require("whatsapp-web.js");
      const poll = new Poll(input.question, input.options, {
        allowMultipleAnswers: input.allow_multiple || false,
      });
      await waClient.sendMessage(chatId, poll);
      return `✅ הסקר "${input.question}" נשלח עם ${input.options.length} אפשרויות!`;
    }

    // 11. Forward Message
    if (name === "forward_message") {
      const waClient = getClient();
      if (!waClient) return "❌ לקוח וואטסאפ לא מחובר.";
      // Find source chat
      const sourceContact = findContactByName(input.source_chat);
      let sourceChatId = sourceContact?.chatId;
      if (!sourceChatId) sourceChatId = findGroupChatId(input.source_chat);
      if (!sourceChatId) return `❌ לא מצאתי צ'אט מקור בשם "${input.source_chat}".`;
      // Find target chat
      const targetContact = findContactByName(input.target_chat);
      let targetChatId = targetContact?.chatId;
      if (!targetChatId) targetChatId = findGroupChatId(input.target_chat);
      if (!targetChatId) return `❌ לא מצאתי צ'אט יעד בשם "${input.target_chat}".`;
      const chat = await waClient.getChatById(sourceChatId);
      const messages = await chat.fetchMessages({ limit: 30 });
      const targetMsg = messages.reverse().find((m: any) => m.body.includes(input.message_text));
      if (!targetMsg) return `❌ לא מצאתי הודעה שמכילה "${input.message_text}" בצ'אט "${input.source_chat}".`;
      await targetMsg.forward(targetChatId);
      return `✅ ההודעה הועברה בהצלחה מ-"${input.source_chat}" ל-"${input.target_chat}"!`;
    }

    // 12a. Group Add Member
    if (name === "group_add_member") {
      const waClient = getClient();
      if (!waClient) return "❌ לקוח וואטסאפ לא מחובר.";
      const groupChatId = findGroupChatId(input.group_name);
      if (!groupChatId) return `❌ לא מצאתי קבוצה בשם "${input.group_name}".`;
      const chat = await waClient.getChatById(groupChatId) as any;
      if (!chat.isGroup) return `❌ "${input.group_name}" הוא לא קבוצה.`;
      const phone = input.phone.replace(/\D/g, "");
      const participantId = `${phone}@c.us`;
      await chat.addParticipants([participantId]);
      return `✅ ${phone} נוסף לקבוצה "${input.group_name}"!`;
    }

    // 12b. Group Remove Member
    if (name === "group_remove_member") {
      const waClient = getClient();
      if (!waClient) return "❌ לקוח וואטסאפ לא מחובר.";
      const groupChatId = findGroupChatId(input.group_name);
      if (!groupChatId) return `❌ לא מצאתי קבוצה בשם "${input.group_name}".`;
      const chat = await waClient.getChatById(groupChatId) as any;
      if (!chat.isGroup) return `❌ "${input.group_name}" הוא לא קבוצה.`;
      const phone = input.phone.replace(/\D/g, "");
      const participantId = `${phone}@c.us`;
      await chat.removeParticipants([participantId]);
      return `✅ ${phone} הוסר מהקבוצה "${input.group_name}"!`;
    }

    // 13. Check WhatsApp Number
    if (name === "check_whatsapp_number") {
      const waClient = getClient();
      if (!waClient) return "❌ לקוח וואטסאפ לא מחובר.";
      const phone = input.phone.replace(/\D/g, "");
      const contactId = `${phone}@c.us`;
      const isRegistered = await waClient.isRegisteredUser(contactId);
      if (isRegistered) {
        const numberId = await waClient.getNumberId(phone);
        const formatted = numberId ? numberId._serialized.replace("@c.us", "") : phone;
        return `✅ המספר ${formatted} רשום בוואטסאפ!`;
      }
      return `❌ המספר ${phone} לא רשום בוואטסאפ.`;
    }

    // --- SMS tools ---
    if (name === "read_sms") {
      const { isAvailable, getRecentMessages } = require("../sms");
      if (!isAvailable()) return "❌ אין גישה ל-Messages DB. צריך Full Disk Access.";
      const messages = getRecentMessages(input.limit || 15, input.hours || 24, input.sms_only || false);
      if (messages.length === 0) return "אין הודעות חדשות בטווח הזמן המבוקש.";
      return messages.map((m: any) =>
        `${m.isFromMe ? "←" : "→"} ${m.sender} (${m.timestamp}): ${m.text.substring(0, 200)}`
      ).join("\n");
    }

    if (name === "search_sms") {
      const { isAvailable, searchMessages } = require("../sms");
      if (!isAvailable()) return "❌ אין גישה ל-Messages DB.";
      const messages = searchMessages(input.keyword, input.limit || 10);
      if (messages.length === 0) return `לא נמצאו הודעות עם "${input.keyword}"`;
      return messages.map((m: any) =>
        `${m.isFromMe ? "←" : "→"} ${m.sender} (${m.timestamp}): ${m.text.substring(0, 200)}`
      ).join("\n");
    }

    if (name === "check_deliveries") {
      const { isAvailable, getRecentMessages, findDeliveryAlerts, addDelivery, getDeliveries } = require("../sms");
      if (!isAvailable()) return "❌ אין גישה ל-Messages DB.";
      const messages = getRecentMessages(300, input.hours || 168, false);
      const alerts = findDeliveryAlerts(messages);
      // Save any new alerts to the delivery store
      for (const a of alerts) {
        addDelivery(a.message.id, a.carrier, a.summary, a.message.text, a.message.sender, a.message.timestamp, a.trackingNumber);
      }
      const pending = getDeliveries("pending");
      if (alerts.length === 0 && pending.length === 0) return "אין הודעות על חבילות או משלוחים.";
      const parts: string[] = [];
      if (pending.length > 0) {
        parts.push(`📦 ${pending.length} משלוחים ממתינים:`);
        for (const d of pending) {
          parts.push(`  - ${d.summary} (${d.smsTimestamp})`);
        }
      }
      if (alerts.length > 0 && pending.length === 0) {
        for (const a of alerts) {
          parts.push(`📦 ${a.summary}\n   ${a.message.sender} (${a.message.timestamp}): ${a.message.text.substring(0, 150)}`);
        }
      }
      return parts.join("\n");
    }

    if (name === "mark_delivery_received") {
      const { markReceivedByMatch, getDeliveries } = require("../sms");
      const entry = markReceivedByMatch(input.keyword);
      if (entry) return `✅ סומן כנמסר: ${entry.summary}`;
      const pending = getDeliveries("pending");
      if (pending.length === 0) return "אין משלוחים ממתינים לסימון.";
      return `לא מצאתי משלוח מתאים ל-"${input.keyword}". משלוחים ממתינים:\n${pending.map((d: any) => `  - ${d.summary}`).join("\n")}`;
    }

    if (name === "list_pending_deliveries") {
      const { getDeliveries } = require("../sms");
      const pending = getDeliveries("pending");
      if (pending.length === 0) return "אין משלוחים ממתינים! 🎉";
      return pending.map((d: any) => `📦 ${d.summary} (${d.smsTimestamp})`).join("\n");
    }

    return "פעולה לא מוכרת";
  } catch (error: any) {
    return `שגיאה: ${error.message}`;
  }
}
