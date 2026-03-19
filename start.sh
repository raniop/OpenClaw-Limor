#!/bin/bash
# Start OpenClaw - Limor Bot + Dashboard
cd "$(dirname "$0")"

echo "🐾 Starting OpenClaw..."

# Build bot
echo "📦 Building bot..."
npm run build

# Start dashboard in background
echo "📊 Starting dashboard on port 3848..."
cd dashboard && npm run dev &
DASH_PID=$!
cd ..

# Start bot
echo "🤖 Starting Limor..."
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
