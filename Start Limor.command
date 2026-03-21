#!/bin/bash
cd "$(dirname "$0")"

# Build silently
npm run build > /dev/null 2>&1
if [ $? -ne 0 ]; then
  osascript -e 'display notification "Build failed!" with title "Limor ❌"'
  exit 1
fi

# Start Limor with PM2 (background, auto-restart on crash)
npx pm2 start dist/index.js --name limor --update-env --silent 2>/dev/null || npx pm2 restart limor --silent 2>/dev/null

# Start Dashboard silently
cd dashboard && npm run dev > /dev/null 2>&1 &
cd ..

# Wait for dashboard to be ready, then open browser
sleep 5
open http://localhost:3848

# Notify success
osascript -e 'display notification "Limor + Dashboard running!" with title "Limor ✅"'
