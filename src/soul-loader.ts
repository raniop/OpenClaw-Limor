import { readFileSync } from "fs";
import { resolve } from "path";
import { getBasePrompt } from "./workspace-loader";

export interface Soul {
  name: string;
  nameEn: string;
  version: string;
  description: string;
  identity: {
    role: string;
    owner?: string;
    age: string;
    origin: string;
    traits: string[];
    vibe: string;
  };
  speech: {
    defaultLanguage: string;
    languageRule: string;
    tone: string;
    emojis: boolean;
    emojiNote: string;
    responseLength: string;
    slang: string[];
    slangNote: string;
  };
  capabilities: string[];
  rules: string[];
  model: {
    name: string;
    maxTokens: number;
  };
}

export function loadSoul(name: string): Soul {
  const soulPath = resolve(__dirname, "..", "souls", `${name}.json`);
  const raw = readFileSync(soulPath, "utf-8");
  return JSON.parse(raw) as Soul;
}

export function buildSystemPrompt(_soul: Soul): string {
  // System prompt is now built from workspace markdown files
  return getBasePrompt();
}
