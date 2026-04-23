import { listFiles, readFile, saveFile, readFileAsBase64 } from "../../files";
import { findContactByName } from "../../contacts";
import { config } from "../../config";
import { getSendFileCallback } from "../callbacks";
import type { ToolHandler } from "./types";

export const filesHandlers: Record<string, ToolHandler> = {
  list_files: async (input) => {
    return listFiles(input.directory);
  },

  read_file: async (input) => {
    return readFile(input.path);
  },

  save_file: async (input) => {
    return saveFile(input.path, input.content);
  },

  send_file: async (input) => {
    const sendFile = getSendFileCallback();
    if (!sendFile) return "❌ לקוח וואטסאפ לא מחובר — לא ניתן לשלוח קבצים כרגע.";

    // Resolve file from disk
    const fileResult = readFileAsBase64(input.file_path);
    if ("error" in fileResult) return `❌ ${fileResult.error}`;

    // Resolve target chatId
    let targetChatId: string;
    const nameNormalized = (input.contact_name || "").toLowerCase().trim();
    const ownerAlias = (config.ownerName || "").toLowerCase();
    if (nameNormalized === "owner" || (ownerAlias && nameNormalized === ownerAlias) || nameNormalized === "עצמי" || nameNormalized === "עצמך") {
      if (!config.ownerChatId) return "❌ ownerChatId לא מוגדר בתצורה.";
      targetChatId = config.ownerChatId;
    } else {
      const contact = findContactByName(input.contact_name);
      if (!contact) return `❌ לא מצאתי איש קשר בשם "${input.contact_name}". נסה לבדוק שם או השתמש ב-list_contacts.`;
      targetChatId = contact.chatId;
    }

    try {
      await sendFile(targetChatId, fileResult.base64, fileResult.filename, fileResult.mimetype, input.caption);
      const sizeStr = fileResult.sizeBytes < 1024 * 1024
        ? `${(fileResult.sizeBytes / 1024).toFixed(1)}KB`
        : `${(fileResult.sizeBytes / (1024 * 1024)).toFixed(1)}MB`;
      return `✅ הקובץ "${fileResult.filename}" (${sizeStr}) נשלח בהצלחה ל-${input.contact_name}!`;
    } catch (err: any) {
      return `❌ שגיאה בשליחת הקובץ: ${err.message}`;
    }
  },
};
