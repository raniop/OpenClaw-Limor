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

    return "פעולה לא מוכרת";
  } catch (error: any) {
    return `שגיאה: ${error.message}`;
  }
}
