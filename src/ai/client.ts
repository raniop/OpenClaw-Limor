import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { log } from "../logger";

export const client = new Anthropic({ apiKey: config.anthropicApiKey });

/**
 * Retry wrapper for Anthropic API calls.
 * Handles 529 (overloaded) and 503 (service unavailable) with exponential backoff.
 */
export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const isOverloaded = error?.status === 529 || error?.status === 503;
      if (isOverloaded && attempt < maxRetries - 1) {
        const delay = (attempt + 1) * 2000;
        log.apiRetry(attempt + 2, maxRetries, delay);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
}
