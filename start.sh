#!/bin/bash
# Start the WhatsApp AI bot + Dashboard
cd "$(dirname "$0")"

# Read assistant name from .env (fallback: Limor)
BOT_NAME=$(grep '^BOT_NAME_EN=' .env 2>/dev/null | cut -d= -f2)
BOT_NAME=${BOT_NAME:-Limor}

echo "🐾 Starting $BOT_NAME..."

# Build bot
echo "📦 Building bot..."
npm run build

# Start dashboard in background
echo "📊 Starting dashboard on port 3848..."
cd dashboard && npm run dev &
DASH_PID=$!
cd ..

# Start bot
echo "🤖 Starting $BOT_NAME..."
node dist/index.js &
BOT_PID=$!

echo ""
echo "✅ Everything running!"
echo "   Bot PID: $BOT_PID"
echo "   Dashboard PID: $DASH_PID"
echo "   Dashboard: http://localhost:3848"
echo ""
echo "Press Ctrl+C to stop everything"

# Wait and cleanup on exit
trap "echo '🛑 Stopping...'; kill $BOT_PID $DASH_PID 2>/dev/null; exit" INT TERM
wait
