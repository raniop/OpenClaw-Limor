/**
 * One-time script to get Google OAuth2 refresh token for Calendar API.
 * Run: npx ts-node scripts/get-google-token.ts
 */
import { google } from "googleapis";
import * as http from "http";

import dotenv from "dotenv";
dotenv.config({ path: require("path").resolve(__dirname, "..", ".env") });

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const REDIRECT_URI = "http://localhost:3456/oauth2callback";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("ERROR: Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const SCOPES = ["https://www.googleapis.com/auth/calendar"];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: SCOPES,
  prompt: "consent",
});

console.log("\n🔗 Open this URL in your browser:\n");
console.log(authUrl);
console.log("\n⏳ Waiting for authorization...\n");

// Start local server to receive the callback
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url!, `http://localhost:3456`);
  if (url.pathname === "/oauth2callback") {
    const code = url.searchParams.get("code");
    if (!code) {
      res.writeHead(400);
      res.end("No code received");
      return;
    }

    try {
      const { tokens } = await oauth2Client.getToken(code);
      console.log("\n✅ Success! Here are your tokens:\n");
      console.log("GOOGLE_REFRESH_TOKEN=" + tokens.refresh_token);
      console.log("\nAdd this to your .env file.");

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`
        <html><body style="font-family:sans-serif;text-align:center;padding:50px;">
          <h1>✅ Authorization successful!</h1>
          <p>You can close this window and go back to the terminal.</p>
          <p>Refresh token: <code>${tokens.refresh_token}</code></p>
        </body></html>
      `);
    } catch (err) {
      console.error("Error getting tokens:", err);
      res.writeHead(500);
      res.end("Error getting tokens");
    }

    setTimeout(() => {
      server.close();
      process.exit(0);
    }, 1000);
  }
});

server.listen(3456, () => {
  // Try to open the URL automatically
  const { exec } = require("child_process");
  exec(`open "${authUrl}"`);
});
