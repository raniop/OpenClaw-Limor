# Workspace Architecture

## Directory Structure

```
workspace/
  identity/               # Always loaded — core personality
    SOUL.md               # Name, traits, capabilities, self-awareness
    VOICE.md              # Language rules, tone, emoji, response length
    OPERATING_PRINCIPLES.md  # Honesty, privacy, tool failure rules

  policies/               # Selectively loaded by topic/context
    privacy.md            # Always loaded
    owner_interaction.md  # Loaded when sender is owner
    groups.md             # Loaded when message is in a group
    messaging.md          # When sending messages
    booking.md            # Restaurant booking flow
    calendar.md           # Meeting/calendar flow
    crm.md                # CRM access rules
    smarthome.md          # Control4 smart home

  runbooks/               # Step-by-step processes (loaded with related policy)
    book_restaurant.md
    schedule_meeting.md
    handle_new_contact.md

  integrations/           # External service notes (loaded by topic)
    ontopo.md
    tabit.md
    google_calendar.md
    travel.md

  state/                  # JSON state files (read/write at runtime)
    conversations.json    # Chat histories per chatId
    contacts.json         # Known contacts with aliases
    approved.json         # Approved contact chatIds
    pending.json          # Pending approval requests (code → entry)
    active_tasks.json     # Meeting requests (id → request)
    instructions.json     # Owner-taught behavioral rules
    groups.json           # Muted group registry

  memory/                 # Per-user memory (markdown)
    users/                # One file per user: {chatId}.md
      18537179529435_lid.md
      ...

  MEMORY_INDEX.md         # Human-readable navigation map
  WORKSPACE.md            # This file
```

## Loading Rules

### Always loaded (every message)
- `identity/SOUL.md`
- `identity/VOICE.md`
- `identity/OPERATING_PRINCIPLES.md`
- `policies/privacy.md`

### Conditional
- `policies/owner_interaction.md` — when sender is owner
- `policies/groups.md` — when message is in a WhatsApp group

### By topic (keyword matching)
The workspace-loader matches keywords in the user's message and loads relevant files:
- Restaurant keywords → booking.md + ontopo.md + tabit.md + runbook
- Calendar keywords → calendar.md + google_calendar.md + runbook
- CRM keywords → crm.md
- Messaging keywords → messaging.md
- Smart home keywords → smarthome.md
- Travel keywords → travel.md
- Contact keywords → privacy.md

### No match
If no topic keywords match, only the baseline (identity + privacy + conditional) is loaded. This keeps context small for general chat.

## State Storage

All JSON state is under `workspace/state/`. Each module reads from the new path with automatic fallback to the old path (`memory/` or `data/`) for backward compatibility. Migration happens on first read — old data is merged into the new file and logged.

Old files are never deleted automatically.

## Per-User Memory

Each user's facts and name are stored as a markdown file under `workspace/memory/users/{sanitized_chatId}.md`. On first access, if the markdown doesn't exist but the old JSON store (`memory/memories.json`) has data for that user, it's automatically migrated.
