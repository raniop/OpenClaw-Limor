export interface Message {
  role: "user" | "assistant";
  content: string;
  imageData?: {
    base64: string;
    mediaType: string;
  };
}

export interface SenderContext {
  chatId: string;
  name: string;
  isOwner: boolean;
}
