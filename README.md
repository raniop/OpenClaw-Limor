# Limor - WhatsApp AI Assistant

A personal AI assistant bot for WhatsApp, powered by Claude Opus 4.6.

## Features

- **WhatsApp Integration** - Text, voice messages, images, and documents
- **Vision** - Understands images sent via WhatsApp
- **Restaurant Booking** - Search & book via Ontopo and Tabit
- **Calendar Management** - Google Calendar integration
- **Flight & Hotel Search** - Real-time search via RapidAPI
- **CRM Integration** - Insurance policy management
- **Learning System** - Teach the bot new rules via WhatsApp
- **File Management** - Read, write, and list files
- **Memory** - Remembers facts about contacts across conversations
- **Contact Pairing** - Owner approval required before new contacts can chat

## Prerequisites

- **Node.js** 18+ (tested on 22)
- **Chromium/Chrome** (used by Puppeteer for WhatsApp Web and restaurant booking)
- **Anthropic API key** with access to Claude Opus 4.6

## Installation

```bash
# 1. Clone the repo
git clone https://github.com/raniop/OpenClaw-Limor.git
cd OpenClaw-Limor

# 2. Install dependencies
npm install

# 3. Create your .env file
cp .env.example .env

# 4. Edit .env with your API keys (see Configuration below)
nano .env   # or use any editor

# 5. Build
npm run build

# 6. Run
npm start
```

On first run, a QR code will appear in the terminal. Scan it with WhatsApp to link the bot.

## Configuration

Edit `.env` with your values. Only `ANTHROPIC_API_KEY` is required - everything else is optional.

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key |
| `OWNER_CHAT_ID` | Recommended | Your WhatsApp chat ID (see below) |
| `OWNER_NAME` | Recommended | Your name (auto-filled in bookings) |
| `OWNER_PHONE` | Recommended | Your phone (auto-filled in bookings) |
| `OWNER_EMAIL` | Recommended | Your email (auto-filled in bookings) |
| `GOOGLE_CLIENT_ID` | Optional | For Google Calendar |
| `GOOGLE_CLIENT_SECRET` | Optional | For Google Calendar |
| `GOOGLE_REFRESH_TOKEN` | Optional | For Google Calendar (use `scripts/get-google-token.ts`) |
| `SMTP_EMAIL` | Optional | Gmail address for sending calendar invites |
| `SMTP_PASSWORD` | Optional | Gmail app password |
| `RAPIDAPI_KEY` | Optional | For flight & hotel search |
| `CRM_API_URL` | Optional | CRM server URL |
| `CRM_USERNAME` | Optional | CRM login |
| `CRM_PASSWORD` | Optional | CRM password |
| `SOUL_NAME` | Optional | Bot personality (default: `limor`) |
| `MAX_HISTORY` | Optional | Messages to keep per chat (default: `20`) |

### Finding your OWNER_CHAT_ID

1. Start the bot without `OWNER_CHAT_ID` set
2. Send a message to the bot from your WhatsApp
3. Check the terminal logs - you'll see: `Message from: XXXXX@lid (Your Name, +phone)`
4. Copy the `XXXXX@lid` value into your `.env` as `OWNER_CHAT_ID`
5. Restart the bot

## Google Calendar Setup

1. Create a project in [Google Cloud Console](https://console.cloud.google.com)
2. Enable the Google Calendar API
3. Create OAuth 2.0 credentials (Desktop app)
4. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env`
5. Run the token script:
   ```bash
   npx ts-node scripts/get-google-token.ts
   ```
6. A browser window opens - authorize with your Google account
7. Copy the refresh token into `GOOGLE_REFRESH_TOKEN` in `.env`

## Project Structure

```
src/
  index.ts          # Entry point
  whatsapp.ts       # WhatsApp client & message handling
  ai.ts             # Claude API, tools, and message processing
  config.ts         # Environment configuration
  soul-loader.ts    # Bot personality system prompt builder
  ontopo.ts         # Ontopo restaurant search & booking
  tabit.ts          # Tabit restaurant search & booking
  booking-utils.ts  # Shared Puppeteer utilities
  calendar.ts       # Google Calendar integration
  email.ts          # SMTP email sending
  ics.ts            # Calendar invite (ICS) generation
  flights.ts        # Flight search
  hotels.ts         # Hotel search
  crm.ts            # CRM integration
  contacts.ts       # Contact management with fuzzy matching
  conversation.ts   # Chat history persistence
  memory.ts         # Long-term fact memory
  instructions.ts   # Owner-taught behavioral rules
  files.ts          # File system access
  pairing.ts        # Contact approval system
  meeting-requests.ts # Meeting request tracking
  muted-groups.ts   # Group mute management
  transcribe.ts     # Voice message transcription

souls/
  limor.json        # Bot personality configuration

memory/
  conversations.json  # Chat histories
  memories.json       # Per-user facts
  contacts.json       # Known contacts
  instructions.json   # Owner-defined rules (created at runtime)
  approved.json       # Approved contacts
  pending.json        # Pending contact approvals

files/              # Shared file storage (created at runtime)
```

## Usage

### As Owner
- **Book a restaurant**: "תזמיני לי מקום למסעדת אסתר מחר ב-21:00 ל-4 אנשים"
- **Check calendar**: "מה יש לי היום ביומן?"
- **Send messages**: "תשלחי לעמית שאני אגיע ב-5"
- **Teach rules**: "לימור תזכרי שכשמזמינים מסעדה תמיד לבקש מרפסת"
- **Search flights**: "חפשי לי טיסה ללונדון ב-15 לאפריל"
- **Send image**: Send any image and Limor will describe/analyze it
- **Send document**: Documents are automatically saved to the `files/` directory

### As Contact (after owner approval)
- **Request meeting**: "רני פנוי לשיחה?"
- **Ask questions**: Any general question
- **Book restaurants**: Search and book restaurants

## Development

```bash
# Dev mode (compile + run)
npm run dev

# Build only
npm run build

# Run (after build)
npm start
```

## Customization

### Creating a New Personality

Copy `souls/limor.json` and modify the personality traits, speech style, and capabilities. Set `SOUL_NAME` in `.env` to use your new soul.

## License

MIT
