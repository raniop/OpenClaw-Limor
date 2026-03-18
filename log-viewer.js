const http = require('http');
const fs = require('fs');

const LOG_FILE = '/tmp/limor.log';
const PORT = 3999;

http.createServer((req, res) => {
  if (req.url === '/api/logs') {
    try {
      const content = fs.readFileSync(LOG_FILE, 'utf-8');
      const lines = content.split('\n').slice(-200).join('\n');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(lines);
    } catch(e) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('No logs yet...');
    }
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Limor Logs</title>
  <style>
    body { background: #1e1e1e; color: #d4d4d4; font-family: 'Courier New', monospace; font-size: 14px; margin: 0; padding: 16px; }
    h1 { color: #569cd6; font-size: 18px; }
    pre { white-space: pre-wrap; word-wrap: break-word; line-height: 1.6; }
    .refresh { color: #888; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Limor Logs</h1>
  <p class="refresh">Auto-refreshes every 2 seconds</p>
  <pre id="logs">Loading...</pre>
  <script>
    async function refresh() {
      try {
        const res = await fetch('/api/logs');
        const text = await res.text();
        document.getElementById('logs').textContent = text;
        window.scrollTo(0, document.body.scrollHeight);
      } catch(e) {}
    }
    refresh();
    setInterval(refresh, 2000);
  </script>
</body>
</html>`);
}).listen(PORT, () => console.log('Log viewer on http://localhost:' + PORT));
