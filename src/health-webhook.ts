/**
 * Apple Health Webhook Server
 * Listens on port 3848 for POST /health-data from iPhone Shortcut.
 * 
 * Expected JSON body:
 * {
 *   "date": "2025-01-15",           // optional, defaults to today
 *   "steps": 8500,
 *   "calories_burned": 2100,        // total calories (active + resting)
 *   "active_calories": 450,         // move calories only
 *   "exercise_minutes": 35,
 *   "distance_km": 6.2,
 *   "stand_hours": 9,
 *   "resting_heart_rate": 58,
 *   "token": "HEALTH_WEBHOOK_TOKEN" // secret token for auth
 * }
 */
import * as http from "http";
import { saveHealthData } from "./stores/health-store";
import { config } from "./config";

let healthServer: http.Server | null = null;

export function startHealthWebhook(): void {
  if (healthServer) return;

  const WEBHOOK_PORT = config.healthWebhookPort;
  const webhookToken = config.healthWebhookToken;

  healthServer = http.createServer((req, res) => {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Health check endpoint
    if (req.method === "GET" && req.url === "/health-status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", service: "limor-health-webhook", timestamp: new Date().toISOString() }));
      return;
    }

    // Main data endpoint — accept both POST (body) and GET (query params)
    const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (parsedUrl.pathname === "/health-data" && (req.method === "POST" || req.method === "GET")) {
      let body = "";
      req.on("data", (chunk) => { body += chunk.toString(); });
      req.on("end", () => {
        console.log(`[health-webhook] 📥 Raw body (${body.length} bytes): ${body.substring(0, 500)}`);
          console.log(`[health-webhook] 📥 URL: ${req.url}`);
        try {
          // Support both JSON body and query params
          let data: any;
          if (body.length > 0) {
            data = JSON.parse(body);
          } else {
            // Fallback: read from query parameters
            data = Object.fromEntries(parsedUrl.searchParams.entries());
            // Convert numeric strings to numbers
            for (const key of ["steps", "calories_burned", "active_calories", "exercise_minutes", "distance_km", "stand_hours", "resting_heart_rate"]) {
              if (data[key]) data[key] = Number(data[key]) || null;
            }
          }

          // Token auth (optional but recommended)
          if (webhookToken && data.token !== webhookToken) {
            console.warn(`[health-webhook] ⚠️ Invalid token from ${req.socket.remoteAddress}`);
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Unauthorized" }));
            return;
          }

          // Default date to today
          const date = data.date || new Date().toISOString().split("T")[0];

          // Validate date format
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid date format. Use YYYY-MM-DD" }));
            return;
          }

          saveHealthData({
            date,
            steps: data.steps ?? null,
            calories_burned: data.calories_burned ?? null,
            active_calories: data.active_calories ?? null,
            exercise_minutes: data.exercise_minutes ?? null,
            distance_km: data.distance_km ?? null,
            stand_hours: data.stand_hours ?? null,
            resting_heart_rate: data.resting_heart_rate ?? null,
            source: "apple_health",
          });

          console.log(`[health-webhook] ✅ Saved health data for ${date}: steps=${data.steps}, cal=${data.active_calories}`);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, date, message: "Health data saved" }));
        } catch (err: any) {
          console.error(`[health-webhook] ❌ Error:`, err.message);
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid JSON body" }));
        }
      });
      return;
    }

    // Simple per-metric endpoint
    // GET  /health/steps/1234?token=X  — value in path
    // POST /health/steps?token=X       — value in body (auto from Shortcuts pipeline)
    const VALID_METRICS = ["steps", "active_calories", "calories_burned", "exercise_minutes", "distance_km", "stand_hours", "resting_heart_rate"];
    const metricPathMatch = parsedUrl.pathname.match(/^\/health\/([a-z_]+)(?:\/(.+))?$/);
    if (metricPathMatch && VALID_METRICS.includes(metricPathMatch[1])) {
      let metricBody = "";
      req.on("data", (chunk) => { metricBody += chunk.toString(); });
      req.on("end", () => {
        const token = parsedUrl.searchParams.get("token") || "";
        if (webhookToken && token !== webhookToken) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }

        const metric = metricPathMatch[1];
        // Value from: path segment > body > query param
        const rawValue = metricPathMatch[2] || metricBody || parsedUrl.searchParams.get("value") || "0";
        const cleanValue = rawValue.replace(/[^0-9.]/g, ""); // strip "count", "cal", "min", etc.
        const value = parseFloat(cleanValue) || 0;
        const date = new Date().toISOString().split("T")[0];

        const record: any = {
          date,
          steps: null, calories_burned: null, active_calories: null,
          exercise_minutes: null, distance_km: null, stand_hours: null,
          resting_heart_rate: null, source: "apple_health",
        };
        record[metric] = value;
        saveHealthData(record);

        console.log(`[health-webhook] ✅ ${metric}=${value} for ${date}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, metric, value, date }));
      });
      return;
    }

    // Health Auto Export app endpoint: POST /health-auto-export
    // Accepts the JSON format from the iOS "Health Auto Export" app
    // Format: { "data": { "metrics": [{ "name": "Step Count", "units": "count", "data": [{ "qty": 8500, "date": "..." }] }] } }
    if (parsedUrl.pathname === "/health-auto-export" && req.method === "POST") {
      let haeBody = "";
      req.on("data", (chunk) => { haeBody += chunk.toString(); });
      req.on("end", () => {
        // Auth via header or query param
        const token = req.headers["x-token"] as string || parsedUrl.searchParams.get("token") || "";
        if (webhookToken && token !== webhookToken) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }

        try {
          const payload = JSON.parse(haeBody);
          const metrics = payload?.data?.metrics || payload?.metrics || [];
          const date = new Date().toISOString().split("T")[0];

          // Map Health Auto Export metric names to our fields
          const metricMap: Record<string, string> = {
            "step_count": "steps",
            "stepcount": "steps",
            "steps": "steps",
            "active_energy": "active_calories",
            "active_energy_burned": "active_calories",
            "activeenergy": "active_calories",
            "basal_energy_burned": "calories_burned",
            "basalenergy": "calories_burned",
            "resting_energy": "calories_burned",
            "exercise_time": "exercise_minutes",
            "apple_exercise_time": "exercise_minutes",
            "exercisetime": "exercise_minutes",
            "walking_running_distance": "distance_km",
            "distance_walking_running": "distance_km",
            "apple_stand_time": "stand_hours",
            "standtime": "stand_hours",
            "resting_heart_rate": "resting_heart_rate",
            "restingheartrate": "resting_heart_rate",
          };

          const record: any = {
            date,
            steps: null, calories_burned: null, active_calories: null,
            exercise_minutes: null, distance_km: null, stand_hours: null,
            resting_heart_rate: null, source: "health_auto_export",
          };

          let found = 0;
          for (const metric of metrics) {
            const rawName = (metric.name || "").toLowerCase().replace(/[\s-]+/g, "_");
            const field = metricMap[rawName];
            if (field && metric.data?.length > 0) {
              // Sum all data points for this metric (daily total)
              const total = metric.data.reduce((sum: number, d: any) => sum + (Number(d.qty) || 0), 0);
              record[field] = Math.round(total * 100) / 100;
              found++;
            }
          }

          if (found > 0) {
            saveHealthData(record);
            console.log(`[health-webhook] ✅ Health Auto Export: ${found} metrics saved for ${date} (steps=${record.steps}, cal=${record.active_calories}, ex=${record.exercise_minutes})`);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, date, metricsProcessed: found }));
          } else {
            console.warn(`[health-webhook] ⚠️ Health Auto Export: no recognized metrics in payload`);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, date, metricsProcessed: 0, warning: "No recognized metrics" }));
          }
        } catch (err: any) {
          console.error(`[health-webhook] ❌ Health Auto Export error:`, err.message);
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid JSON" }));
        }
      });
      return;
    }

    // 404 for everything else
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  healthServer.listen(WEBHOOK_PORT, () => {
    console.log(`[health-webhook] 🏃 Apple Health webhook listening on port ${WEBHOOK_PORT}`);
    console.log(`[health-webhook] 📲 Endpoint: POST http://SERVER_IP:${WEBHOOK_PORT}/health-data`);
  });

  healthServer.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`[health-webhook] ⚠️ Port ${WEBHOOK_PORT} already in use — webhook not started`);
    } else {
      console.error(`[health-webhook] ❌ Server error:`, err.message);
    }
  });
}

export function stopHealthWebhook(): void {
  if (healthServer) {
    healthServer.close();
    healthServer = null;
  }
}
