import { saveInstruction, removeInstruction, listInstructions } from "../../instructions";
import type { ToolHandler } from "./types";

export const instructionsHandlers: Record<string, ToolHandler> = {
  learn_instruction: async (input) => {
    saveInstruction(input.instruction);
    return `✅ שמרתי! מעכשיו אזכור: "${input.instruction}"`;
  },

  forget_instruction: async (input) => {
    return removeInstruction(input.query);
  },

  list_instructions: async () => {
    return listInstructions();
  },
};
