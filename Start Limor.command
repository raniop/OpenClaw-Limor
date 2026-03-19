#!/bin/bash
cd "$(dirname "$0")"

echo "🐾 Starting OpenClaw..."

npm run build

cd dashboard && npm run dev &
cd ..

node dist/index.js &

echo ""
echo "✅ Limor + Dashboard running!"
echo "   Dashboard: http://localhost:3848"
echo ""
echo "Press Ctrl+C to stop"

trap "kill 0; exit" INT TERM
wait
