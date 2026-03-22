/**
 * Capability spec storage — read/write structured specs as markdown.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "fs";
import { resolve, join } from "path";
import type { CapabilitySpec } from "./types";

const BASE_DIR = resolve(__dirname, "..", "..", "workspace", "capability_requests");
const PENDING_DIR = join(BASE_DIR, "pending");
const APPROVED_DIR = join(BASE_DIR, "approved");
const REJECTED_DIR = join(BASE_DIR, "rejected");

// Ensure directories exist
for (const dir of [PENDING_DIR, APPROVED_DIR, REJECTED_DIR]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function generateId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 6);
  return `cap-${ts}-${rand}`;
}

function specToMarkdown(spec: CapabilitySpec): string {
  return `# ${spec.title}

**ID**: ${spec.id}
**Status**: ${spec.status}
**Requested by**: ${spec.requestedBy}
**Created**: ${spec.createdAt}
**Level**: ${spec.level}

## Problem
${spec.problem}

## Why Current System Can't Do It
${spec.whyCurrentSystemCantDoIt}

## Proposed Solution
${spec.proposedSolution}

## Affected Modules
${spec.affectedModules.map(m => `- ${m}`).join("\n")}

## Required Tools/Integrations
${spec.requiredTools.map(t => `- ${t}`).join("\n")}

## Risks
${spec.risks.map(r => `- ${r}`).join("\n")}

## Validation Plan
${spec.validationPlan}
`;
}

function markdownToSpec(content: string, id: string): CapabilitySpec | null {
  try {
    const getField = (label: string): string => {
      const match = content.match(new RegExp(`\\*\\*${label}\\*\\*:\\s*(.+)`));
      return match ? match[1].trim() : "";
    };
    const getSection = (header: string): string => {
      const match = content.match(new RegExp(`## ${header}\\n([\\s\\S]*?)(?=\\n## |$)`));
      return match ? match[1].trim() : "";
    };
    const getBullets = (header: string): string[] => {
      const section = getSection(header);
      return section.split("\n").filter(l => l.startsWith("- ")).map(l => l.substring(2).trim());
    };

    return {
      id,
      title: content.match(/^# (.+)/m)?.[1] || "Untitled",
      status: (getField("Status") as any) || "pending",
      requestedBy: getField("Requested by"),
      createdAt: getField("Created"),
      level: (getField("Level") as any) || "code_change",
      problem: getSection("Problem"),
      whyCurrentSystemCantDoIt: getSection("Why Current System Can't Do It"),
      proposedSolution: getSection("Proposed Solution"),
      affectedModules: getBullets("Affected Modules"),
      requiredTools: getBullets("Required Tools/Integrations"),
      risks: getBullets("Risks"),
      validationPlan: getSection("Validation Plan"),
    };
  } catch {
    return null;
  }
}

export function saveSpec(spec: CapabilitySpec): string {
  const dir = spec.status === "approved" ? APPROVED_DIR :
    spec.status === "rejected" ? REJECTED_DIR : PENDING_DIR;
  const filePath = join(dir, `${spec.id}.md`);
  writeFileSync(filePath, specToMarkdown(spec), "utf-8");
  return spec.id;
}

export function createSpec(params: {
  title: string;
  requestedBy: string;
  problem: string;
  whyCurrentSystemCantDoIt: string;
  proposedSolution: string;
  affectedModules: string[];
  requiredTools: string[];
  risks: string[];
  validationPlan: string;
  level: CapabilitySpec["level"];
}): CapabilitySpec {
  const spec: CapabilitySpec = {
    id: generateId(),
    status: "pending",
    createdAt: new Date().toISOString(),
    ...params,
  };
  saveSpec(spec);
  return spec;
}

export function listPending(): CapabilitySpec[] {
  return listFromDir(PENDING_DIR);
}

export function listApproved(): CapabilitySpec[] {
  return listFromDir(APPROVED_DIR);
}

function listFromDir(dir: string): CapabilitySpec[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith(".md"))
    .map(f => {
      const id = f.replace(".md", "");
      const content = readFileSync(join(dir, f), "utf-8");
      return markdownToSpec(content, id);
    })
    .filter((s): s is CapabilitySpec => s !== null);
}

export function approveSpec(id: string): CapabilitySpec | null {
  return moveSpec(id, PENDING_DIR, APPROVED_DIR, "approved");
}

export function rejectSpec(id: string): CapabilitySpec | null {
  return moveSpec(id, PENDING_DIR, REJECTED_DIR, "rejected");
}

function moveSpec(id: string, fromDir: string, toDir: string, newStatus: string): CapabilitySpec | null {
  const fromPath = join(fromDir, `${id}.md`);
  if (!existsSync(fromPath)) return null;

  const content = readFileSync(fromPath, "utf-8");
  const spec = markdownToSpec(content, id);
  if (!spec) return null;

  spec.status = newStatus as any;
  const toPath = join(toDir, `${id}.md`);
  writeFileSync(toPath, specToMarkdown(spec), "utf-8");

  // Remove from source (safe: we already wrote to destination)
  unlinkSync(fromPath);

  return spec;
}

export function getSpec(id: string): CapabilitySpec | null {
  for (const dir of [PENDING_DIR, APPROVED_DIR, REJECTED_DIR]) {
    const path = join(dir, `${id}.md`);
    if (existsSync(path)) {
      return markdownToSpec(readFileSync(path, "utf-8"), id);
    }
  }
  return null;
}
