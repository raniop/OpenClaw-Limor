const { resolve } = require("path");

// Load bot name from .env if available
let botName = "limor";
try {
  const envFile = require("fs").readFileSync(resolve(__dirname, ".env"), "utf-8");
  const match = envFile.match(/^BOT_NAME_EN=(.+)$/m);
  if (match) botName = match[1].trim().toLowerCase();
} catch {}

module.exports = {
  apps: [{
    name: botName,
    script: "dist/index.js",
    cwd: __dirname,
    watch: false,
    autorestart: true,
    restart_delay: 5000,
    max_restarts: 10,
    min_uptime: 10000,
    env: {
      NODE_ENV: "production",
    },
  }],
};
