import { config } from "./config";

const API_HOST = "sky-scrapper.p.rapidapi.com";
const BASE_URL = `https://${API_HOST}`;

function headers() {
  return {
    "x-rapidapi-key": config.rapidApiKey,
    "x-rapidapi-host": API_HOST,
  };
}

interface AirportResult {
  skyId: string;
  entityId: string;
  name: string;
}

async function searchAirport(query: string): Promise<AirportResult | null> {
  const url = `${BASE_URL}/api/v1/flights/searchAirport?query=${encodeURIComponent(query)}&locale=en-US`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`Airport search failed: ${res.status}`);
  const data: any = await res.json();
  const places = data?.data;
  if (!Array.isArray(places) || places.length === 0) return null;
  const first = places[0];
  return {
    skyId: first.skyId,
    entityId: first.entityId,
    name: first.presentation?.suggestionTitle || first.skyId,
  };
}

export async function searchFlights(
  origin: string,
  destination: string,
  date: string,
  returnDate?: string,
  adults: number = 1,
  cabinClass: string = "economy"
): Promise<string> {
  // Step 1: Resolve airport IDs
  const [originAirport, destAirport] = await Promise.all([
    searchAirport(origin),
    searchAirport(destination),
  ]);

  if (!originAirport) return `❌ לא מצאתי שדה תעופה עבור "${origin}"`;
  if (!destAirport) return `❌ לא מצאתי שדה תעופה עבור "${destination}"`;

  // Step 2: Search flights
  const params = new URLSearchParams({
    originSkyId: originAirport.skyId,
    destinationSkyId: destAirport.skyId,
    originEntityId: originAirport.entityId,
    destinationEntityId: destAirport.entityId,
    date,
    cabinClass,
    adults: String(adults),
    sortBy: "best",
    currency: "ILS",
    market: "IL",
    countryCode: "IL",
  });
  if (returnDate) {
    params.set("returnDate", returnDate);
  }

  const url = `${BASE_URL}/api/v1/flights/searchFlights?${params}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`Flight search failed: ${res.status}`);
  const data: any = await res.json();

  // Parse results
  const itineraries = data?.data?.itineraries;
  if (!Array.isArray(itineraries) || itineraries.length === 0) {
    return `לא נמצאו טיסות מ-${originAirport.name} ל-${destAirport.name} בתאריך ${date}`;
  }

  const top = itineraries.slice(0, 5);
  const lines = [`✈️ טיסות מ-${originAirport.name} ל-${destAirport.name} (${date}):\n`];

  for (const itin of top) {
    const price = itin.price?.formatted || itin.price?.raw || "?";
    const legs = itin.legs || [];
    for (const leg of legs) {
      const departure = leg.departure ? new Date(leg.departure).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : "?";
      const arrival = leg.arrival ? new Date(leg.arrival).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : "?";
      const duration = leg.durationInMinutes ? `${Math.floor(leg.durationInMinutes / 60)}:${String(leg.durationInMinutes % 60).padStart(2, "0")}` : "?";
      const stops = leg.stopCount === 0 ? "ישיר" : `${leg.stopCount} עצירות`;
      const carriers = leg.carriers?.marketing?.map((c: any) => c.name).join(", ") || "?";
      lines.push(`• ${departure} → ${arrival} | ${duration} שעות | ${stops} | ${carriers} | ${price}`);
    }
  }

  return lines.join("\n");
}
