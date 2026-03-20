module.exports = {
  apps: [{
    name: "limor",
    script: "dist/index.js",
    cwd: "/Users/raniophir/Open Claude Bot AI",
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
