import { listFiles, readFile, saveFile } from "../../files";
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
};
