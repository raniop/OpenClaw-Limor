/**
 * Gett Business API integration — taxi booking.
 */
import { config } from "./config";

const GETT_TOKEN_URL = "https://business-api.gett.com/oauth/token";
const GETT_API_BASE = "https://business-api.gett.com/v1";

let accessToken: string | null = null;
let tokenExpiresAt = 0;

/**
 * Get a valid Gett access token, refreshing if needed.
 */
async function getToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiresAt) {
    return accessToken;
  }

  const res = await fetch(GETT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: config.gettClientId,
      client_secret: config.gettClientSecret,
      scope: "order company.reference finance employee",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gett auth failed: ${res.status} ${text}`);
  }

  const data = await res.json() as any;
  accessToken = data.access_token;
  const expiresIn = data.expires_in || 899;
  tokenExpiresAt = Date.now() + (expiresIn - 60) * 1000;
  return accessToken!;
}

async function gettGet(path: string): Promise<any> {
  const token = await getToken();
  const url = `${GETT_API_BASE}${path}${path.includes("?") ? "&" : "?"}businessId=${config.gettBusinessId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gett API ${path}: ${res.status} ${text.substring(0, 200)}`);
  }
  return res.json();
}

async function gettPost(path: string, body: any): Promise<any> {
  const token = await getToken();
  const url = `${GETT_API_BASE}${path}?businessId=${config.gettBusinessId}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gett API ${path}: ${res.status} ${text.substring(0, 200)}`);
  }
  return res.json();
}

// ============================================
// Public API
// ============================================

/**
 * Book a taxi ride.
 */
export async function bookRide(params: {
  pickupAddress: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffAddress: string;
  dropoffLat?: number;
  dropoffLng?: number;
  passengerName?: string;
  passengerPhone?: string;
  scheduledAt?: string; // ISO timestamp for pre-booking
  note?: string;
}): Promise<string> {
  if (!config.gettClientId) return "Gett לא מוגדר. הוסף GETT_CLIENT_ID ל-.env";

  try {
    const stops: any[] = [
      {
        type: "origin",
        location: {
          full_address: params.pickupAddress,
          ...(params.pickupLat && params.pickupLng ? { latitude: params.pickupLat, longitude: params.pickupLng } : {}),
        },
        user: {
          name: params.passengerName || config.ownerName || "Passenger",
          phone: params.passengerPhone || config.ownerPhone || "",
        },
      },
      {
        type: "destination",
        location: {
          full_address: params.dropoffAddress,
          ...(params.dropoffLat && params.dropoffLng ? { latitude: params.dropoffLat, longitude: params.dropoffLng } : {}),
        },
      },
    ];

    const orderBody: any = {
      category: "transportation",
      stops,
    };

    if (params.scheduledAt) {
      orderBody.scheduled_at = params.scheduledAt;
    }
    if (params.note) {
      orderBody.note = params.note;
    }

    const result = await gettPost("/orders", orderBody);
    const orderId = result.id || result.order_id || "unknown";
    const status = result.status || "requested";

    console.log(`[gett] Ride booked: ${orderId} (${status})`);
    return `✅ מונית הוזמנה!\n🆔 מזהה: ${orderId}\n📍 מ: ${params.pickupAddress}\n📍 ל: ${params.dropoffAddress}\n📊 סטטוס: ${status}`;
  } catch (err: any) {
    console.error(`[gett] Booking failed: ${err.message}`);
    return `❌ הזמנת מונית נכשלה: ${err.message}`;
  }
}

/**
 * Get ride status by order ID.
 */
export async function getRideStatus(orderId: string): Promise<string> {
  if (!config.gettClientId) return "Gett לא מוגדר.";

  try {
    const result = await gettGet(`/orders/${orderId}`);
    const status = result.status || "unknown";
    const driver = result.driver ? `${result.driver.name} (${result.driver.phone})` : "טרם שובץ";
    const eta = result.eta ? `${result.eta} דקות` : "לא ידוע";

    return `🚕 סטטוס הזמנה ${orderId}:\n📊 ${status}\n👤 נהג: ${driver}\n⏱️ ETA: ${eta}`;
  } catch (err: any) {
    return `❌ שגיאה: ${err.message}`;
  }
}

/**
 * Cancel a ride.
 */
export async function cancelRide(orderId: string): Promise<string> {
  if (!config.gettClientId) return "Gett לא מוגדר.";

  try {
    await gettPost(`/orders/${orderId}/cancel`, {});
    console.log(`[gett] Ride cancelled: ${orderId}`);
    return `✅ הזמנה ${orderId} בוטלה.`;
  } catch (err: any) {
    return `❌ ביטול נכשל: ${err.message}`;
  }
}
