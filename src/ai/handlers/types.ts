import type { SenderContext } from "../types";
export type ToolHandler = (input: Record<string, any>, sender?: SenderContext) => Promise<string>;
