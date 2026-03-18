/**
 * Error normalization helper.
 */
import type { NormalizedError } from "./types";

/**
 * Normalize any caught value into a structured error object.
 */
export function normalizeError(err: unknown, operation: string, traceId: string): NormalizedError {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      operation,
      traceId,
    };
  }
  return {
    name: "UnknownError",
    message: String(err),
    operation,
    traceId,
  };
}
