/**
 * Generic circuit breaker for external API calls.
 * Tracks consecutive failures per named service and short-circuits
 * calls when the failure threshold is exceeded.
 */

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold?: number;  // default 3
  cooldownMs?: number;         // default 5 * 60 * 1000 (5 minutes)
}

interface CircuitState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

const circuits = new Map<string, CircuitState>();

function getState(name: string): CircuitState {
  let state = circuits.get(name);
  if (!state) {
    state = { failures: 0, lastFailure: 0, isOpen: false };
    circuits.set(name, state);
  }
  return state;
}

/**
 * Wrap an async function with circuit breaker protection.
 *
 * - After `failureThreshold` consecutive failures, the circuit opens for `cooldownMs`.
 * - While open, returns `fallbackMessage` immediately without calling `fn`.
 * - After cooldown, allows one half-open attempt. Success resets; failure re-opens.
 */
export async function withCircuitBreaker<T>(
  options: CircuitBreakerOptions,
  fn: () => Promise<T>,
  fallbackMessage: string
): Promise<T> {
  const { name, failureThreshold = 3, cooldownMs = 5 * 60 * 1000 } = options;
  const state = getState(name);

  // Circuit is open — check if cooldown expired
  if (state.isOpen) {
    const elapsed = Date.now() - state.lastFailure;
    if (elapsed < cooldownMs) {
      // Still in cooldown — fail fast
      return fallbackMessage as unknown as T;
    }
    // Cooldown expired — allow half-open attempt
    console.log(`[circuit-breaker] ${name} attempting half-open recovery...`);
  }

  try {
    const result = await fn();
    // Success — reset circuit
    if (state.failures > 0 || state.isOpen) {
      const wasOpen = state.isOpen;
      state.failures = 0;
      state.isOpen = false;
      state.lastFailure = 0;
      if (wasOpen) {
        console.log(`[circuit-breaker] ${name} CLOSED (recovered)`);
      }
    }
    return result;
  } catch (error) {
    state.failures++;
    state.lastFailure = Date.now();

    if (state.failures >= failureThreshold) {
      state.isOpen = true;
      console.log(`[circuit-breaker] ${name} OPENED after ${state.failures} failures`);
    }

    throw error;
  }
}
