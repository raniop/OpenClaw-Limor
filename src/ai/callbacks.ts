// Callback for sending messages to owner - set by whatsapp.ts
let notifyOwnerCallback: ((message: string) => Promise<void>) | null = null;

export function setNotifyOwnerCallback(cb: (message: string) => Promise<void>): void {
  notifyOwnerCallback = cb;
}

export function getNotifyOwnerCallback(): ((message: string) => Promise<void>) | null {
  return notifyOwnerCallback;
}

// Callback for sending messages to any contact - set by whatsapp.ts
let sendMessageCallback: ((chatId: string, message: string) => Promise<void>) | null = null;

export function setSendMessageCallback(cb: (chatId: string, message: string) => Promise<void>): void {
  sendMessageCallback = cb;
}

export function getSendMessageCallback(): ((chatId: string, message: string) => Promise<void>) | null {
  return sendMessageCallback;
}

// Callback for sending file to a contact - set by whatsapp.ts
let sendFileCallback: ((chatId: string, base64: string, filename: string, mimetype: string, caption?: string) => Promise<void>) | null = null;

export function setSendFileCallback(cb: (chatId: string, base64: string, filename: string, mimetype: string, caption?: string) => Promise<void>): void {
  sendFileCallback = cb;
}

export function getSendFileCallback(): ((chatId: string, base64: string, filename: string, mimetype: string, caption?: string) => Promise<void>) | null {
  return sendFileCallback;
}
