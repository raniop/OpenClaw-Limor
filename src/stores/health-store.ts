/**
 * Health data store — read/write Apple Health data from SQLite.
 * Data is pushed by iPhone Shortcut via /health-data webhook.
 */
import { getDb } from "./sqlite-init";

export interface HealthRecord {
  date: string;
  steps: number | null;
  calories_burned: number | null;
  active_calories: number | null;
  exercise_minutes: number | null;
  distance_km: number | null;
  stand_hours: number | null;
  resting_heart_rate: number | null;
  source: string;
  created_at: string;
}

/** Save or update a health record (upsert by date+source) */
export function saveHealthData(data: Partial<HealthRecord> & { date: string }): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO health_data (date, steps, calories_burned, active_calories, exercise_minutes, distance_km, stand_hours, resting_heart_rate, source)
    VALUES (@date, @steps, @calories_burned, @active_calories, @exercise_minutes, @distance_km, @stand_hours, @resting_heart_rate, @source)
    ON CONFLICT(date, source) DO UPDATE SET
      steps = COALESCE(excluded.steps, steps),
      calories_burned = COALESCE(excluded.calories_burned, calories_burned),
      active_calories = COALESCE(excluded.active_calories, active_calories),
      exercise_minutes = COALESCE(excluded.exercise_minutes, exercise_minutes),
      distance_km = COALESCE(excluded.distance_km, distance_km),
      stand_hours = COALESCE(excluded.stand_hours, stand_hours),
      resting_heart_rate = COALESCE(excluded.resting_heart_rate, resting_heart_rate),
      created_at = datetime('now')
  `).run({
    date: data.date,
    steps: data.steps ?? null,
    calories_burned: data.calories_burned ?? null,
    active_calories: data.active_calories ?? null,
    exercise_minutes: data.exercise_minutes ?? null,
    distance_km: data.distance_km ?? null,
    stand_hours: data.stand_hours ?? null,
    resting_heart_rate: data.resting_heart_rate ?? null,
    source: data.source ?? "apple_health",
  });
}

/** Get health data for a specific date (YYYY-MM-DD) */
export function getHealthByDate(date: string): HealthRecord | null {
  const db = getDb();
  return db.prepare(`SELECT * FROM health_data WHERE date = ? ORDER BY created_at DESC LIMIT 1`).get(date) as HealthRecord | null;
}

/** Get health data for a range of dates */
export function getHealthRange(fromDate: string, toDate: string): HealthRecord[] {
  const db = getDb();
  return db.prepare(`SELECT * FROM health_data WHERE date BETWEEN ? AND ? ORDER BY date DESC`).all(fromDate, toDate) as HealthRecord[];
}

/** Get today's health data */
export function getTodayHealth(): HealthRecord | null {
  const today = new Date().toISOString().split("T")[0];
  return getHealthByDate(today);
}

/** Get last N days of health data */
export function getRecentHealth(days: number = 7): HealthRecord[] {
  const db = getDb();
  return db.prepare(`SELECT * FROM health_data ORDER BY date DESC LIMIT ?`).all(days) as HealthRecord[];
}
