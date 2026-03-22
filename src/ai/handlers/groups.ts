import { muteGroup, unmuteGroup, getMutedGroups, findGroupChatId } from "../../muted-groups";
import type { ToolHandler } from "./types";

export const groupsHandlers: Record<string, ToolHandler> = {
  mute_group: async (input) => {
    const chatId = input.group_chat_id || findGroupChatId(input.group_name);
    if (!chatId) return `❌ לא מצאתי קבוצה בשם "${input.group_name}". תוסיף אותי קודם לקבוצה.`;
    muteGroup(chatId, input.group_name);
    return `✅ השתקתי את הקבוצה "${input.group_name}". לא אגיב שם יותר.`;
  },

  unmute_group: async (input) => {
    const muted = getMutedGroups();
    const match = muted.find((g) => g.name.includes(input.group_name) || input.group_name.includes(g.name));
    if (!match) return `❌ הקבוצה "${input.group_name}" לא מושתקת.`;
    unmuteGroup(match.chatId);
    return `✅ ביטלתי השתקה של "${match.name}". אחזור להגיב שם.`;
  },
};
