---
name: add-tool
description: Step-by-step guide to add a new tool to Limor WhatsApp bot. Use when the user wants to add a new tool, capability, integration, or handler to the bot.
user-invocable: true
argument-hint: "<tool name and description>"
---

# Add a New Tool to Limor

Follow these steps exactly to add a new tool. Each step must be completed before moving to the next.

## Step 1: Understand the Request
Parse $ARGUMENTS to determine:
- Tool name (snake_case, e.g., `search_recipes`)
- What it does
- What parameters it needs
- Which category it belongs to (calendar, booking, travel, contacts, files, etc.)

## Step 2: Check if Similar Tool Exists
Search existing tools:
- Read `src/ai/tools/index.ts` to see all exported tool arrays
- Grep for similar tool names in `src/ai/tools/`
- If a similar tool exists, suggest extending it instead of creating a new one

## Step 3: Create Tool Definition
Add the tool definition to the appropriate file in `src/ai/tools/`:

```typescript
// src/ai/tools/<category>.ts
export const myNewTools: Anthropic.Tool[] = [
  {
    name: "tool_name",
    description: "תיאור בעברית — מה הכלי עושה ומתי להשתמש בו",
    input_schema: {
      type: "object" as const,
      properties: {
        param1: { type: "string", description: "תיאור הפרמטר" },
      },
      required: ["param1"],
    },
  },
];
```

**Rules:**
- Description MUST be in Hebrew (that's what the AI reads)
- Use `as const` for type field
- Keep descriptions concise but clear

## Step 4: Create Handler
Add the handler in `src/ai/handlers/<category>.ts`:

```typescript
export async function handleToolName(input: { param1: string }, sender?: SenderContext): Promise<string> {
  // Implementation
  return "result string";
}
```

**Rules:**
- Handler MUST return a string (tool results are always strings)
- Use circuit breaker for external API calls
- Handle errors gracefully — return error message, don't throw

## Step 5: Register in Barrel Exports

1. **Tools barrel** — Add to `src/ai/tools/index.ts`:
   ```typescript
   export { myNewTools } from "./<category>";
   ```

2. **Handlers barrel** — Add to `src/ai/handlers/index.ts`:
   ```typescript
   // In allHandlers object:
   tool_name: handleToolName,
   ```

## Step 6: Wire into send-message.ts

Add the tool array to the appropriate tools list in `src/ai/send-message.ts`:
- Owner tools (line ~90): Add to the owner spread array
- Contact tools (line ~91): Only if non-owner contacts should access it

```typescript
import { myNewTools } from "./tools";
// In owner tools array:
...myNewTools,
```

## Step 7: Build and Verify
```bash
npm run build
```
Fix any TypeScript errors before proceeding.

## Step 8: Add Test
Create or update test in `tests/`:
- Test the handler function directly
- Test that the tool name is in allHandlers
- Mock external dependencies

## Step 9: Permission Check
Determine who can use this tool:
- **Owner only** — Add to owner tools array only (default)
- **All contacts** — Add to both owner and contact tools arrays
- **Specific agent** — Add to the agent's soul JSON `tools` array

## Checklist
- [ ] Tool definition in `src/ai/tools/<category>.ts`
- [ ] Handler in `src/ai/handlers/<category>.ts`
- [ ] Exported in `src/ai/tools/index.ts`
- [ ] Registered in `src/ai/handlers/index.ts` allHandlers
- [ ] Imported in `src/ai/send-message.ts`
- [ ] `npm run build` passes
- [ ] Test added
- [ ] Permissions configured
