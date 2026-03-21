#!/bin/bash
cd "$(dirname "$0")"

echo "🐾 Starting OpenClaw..."
echo ""

# Build
npm run build
if [ $? -ne 0 ]; then
  echo "❌ Build failed!"
  read -p "Press Enter to close..."
  exit 1
fi

# Start Limor with PM2 (auto-restart on crash)
npx pm2 start dist/index.js --name limor --update-env 2>/dev/null || npx pm2 restart limor

# Start Dashboard
cd dashboard && npm run dev &
cd ..

# Wait for dashboard to be ready, then open browser
sleep 5
open http://localhost:3848

echo ""
echo "✅ Limor + Dashboard running!"
echo "   Dashboard: http://localhost:3848"
echo "   PM2 logs:  npx pm2 logs limor"
echo "   PM2 status: npx pm2 status"
echo ""
echo "Press Ctrl+C to stop dashboard (Limor keeps running in PM2)"

trap "kill 0; exit" INT TERM
wait
