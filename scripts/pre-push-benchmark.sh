#!/bin/bash
echo "🧪 Running benchmarks before push..."
npm run benchmark
if [ $? -ne 0 ]; then
  echo "❌ Benchmarks failed! Fix before pushing."
  exit 1
fi
echo "✅ Benchmarks passed!"
