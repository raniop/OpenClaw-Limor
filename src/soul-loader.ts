import { readFileSync } from "fs";
import { resolve } from "path";
import { getBasePrompt } from "./workspace-loader";
import { loadOwnerConfig } from "./owner-config";
import { renderOwnerTemplate } from "./owner-template";

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

/** Recursively render all string fields in the soul using the owner template. */
function renderSoul(soul: Soul): Soul {
  const owner = loadOwnerConfig();
  const render = (v: unknown): unknown => {
    if (typeof v === "string") return renderOwnerTemplate(v, owner);
    if (Array.isArray(v)) return v.map(render);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) out[k] = render(val);
      return out;
    }
    return v;
  };
  return render(soul) as Soul;
}

export function loadSoul(name: string): Soul {
  const soulPath = resolve(__dirname, "..", "souls", `${name}.json`);
  const raw = readFileSync(soulPath, "utf-8");
  const parsed = JSON.parse(raw) as Soul;
  return renderSoul(parsed);
}

export function buildSystemPrompt(_soul: Soul): string {
  // System prompt is built from workspace markdown files (which already have
  // their placeholders rendered by workspace-loader).
  return getBasePrompt();
}
