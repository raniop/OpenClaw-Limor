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

# Clean dashboard cache and start
cd dashboard
rm -rf .next 2>/dev/null
npm run dev > /dev/null 2>&1 &
DASHBOARD_PID=$!
cd ..

# Wait for dashboard to be ready, then open browser
sleep 5
open http://localhost:3848

# Notify success
osascript -e 'display notification "Limor + Dashboard running!" with title "Limor ✅"'

# Dashboard health check — restart if it crashes
while true; do
  sleep 120
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3848 2>/dev/null)
  if [ "$HTTP_CODE" != "200" ]; then
    echo "[dashboard] Health check failed (HTTP $HTTP_CODE). Restarting..."
    kill $DASHBOARD_PID 2>/dev/null
    cd dashboard
    rm -rf .next 2>/dev/null
    npm run dev > /dev/null 2>&1 &
    DASHBOARD_PID=$!
    cd ..
    osascript -e 'display notification "Dashboard restarted" with title "Limor ⚠️"'
  fi
done
