/**
 * Per-chat sequential lock to prevent double responses.
 */
const chatLocks = new Map<string, Promise<void>>();

export async function withChatLock(chatId: string, fn: () => Promise<void>): Promise<void> {
  const prev = chatLocks.get(chatId) || Promise.resolve();
  const current = prev.then(fn, fn);
  chatLocks.set(chatId, current);
  await current;
}
