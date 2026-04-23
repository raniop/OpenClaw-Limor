#!/bin/bash
cd "$(dirname "$0")"

# Read names from .env
BOT_NAME_EN=$(grep '^BOT_NAME_EN=' .env 2>/dev/null | cut -d= -f2)
BOT_NAME_EN=${BOT_NAME_EN:-Limor}
BOT_NAME_LOWER=$(echo "$BOT_NAME_EN" | tr '[:upper:]' '[:lower:]')

# Build silently
npm run build > /dev/null 2>&1
if [ $? -ne 0 ]; then
  osascript -e "display notification \"Build failed!\" with title \"$BOT_NAME_EN ❌\""
  exit 1
fi

# Start bot with PM2 (background, auto-restart on crash)
npx pm2 start ecosystem.config.js --silent 2>/dev/null || npx pm2 restart "$BOT_NAME_LOWER" --silent 2>/dev/null

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
osascript -e "display notification \"$BOT_NAME_EN + Dashboard running!\" with title \"$BOT_NAME_EN ✅\""

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
    osascript -e "display notification \"Dashboard restarted\" with title \"$BOT_NAME_EN ⚠️\""
  fi
done
