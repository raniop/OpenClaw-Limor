/**
 * Agent Event Bus — typed in-memory EventEmitter for inter-agent communication.
 * No external dependencies — uses Node.js built-in events module.
 */
import { EventEmitter } from "events";

export interface AgentCompletedEvent {
  agentId: string;
  trigger: string;
  resultSummary: string;
  durationMs: number;
}

export interface AgentRequestEvent {
  fromAgent: string;
  toAgent: string;
  task: string;
  context?: string;
}

export interface MessageReceivedEvent {
  chatId: string;
  isGroup: boolean;
  senderName: string;
  timestamp: number;
}

export interface SystemAlertEvent {
  severity: "info" | "warning" | "critical";
  source: string;
  message: string;
}

export interface AgentEventMap {
  "agent:completed": AgentCompletedEvent;
  "agent:error": { agentId: string; error: string };
  "agent:request": AgentRequestEvent;
  "message:received": MessageReceivedEvent;
  "system:alert": SystemAlertEvent;
}

class AgentEventBus extends EventEmitter {
  emitTyped<K extends keyof AgentEventMap>(event: K, data: AgentEventMap[K]): boolean {
    console.log(`[event-bus] ${event}`, JSON.stringify(data).substring(0, 120));
    return this.emit(event, data);
  }

  onTyped<K extends keyof AgentEventMap>(event: K, handler: (data: AgentEventMap[K]) => void): this {
    return this.on(event, handler);
  }
}

export const agentEventBus = new AgentEventBus();
