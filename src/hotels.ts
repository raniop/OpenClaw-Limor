import { config } from "./config";

const API_HOST = "booking-com15.p.rapidapi.com";
const BASE_URL = `https://${API_HOST}`;

function headers() {
  return {
    "x-rapidapi-key": config.rapidApiKey,
    "x-rapidapi-host": API_HOST,
  };
}

interface DestResult {
  dest_id: string;
  search_type: string;
  name: string;
}

async function searchDestination(query: string): Promise<DestResult | null> {
  const url = `${BASE_URL}/api/v1/hotels/searchDestination?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`Destination search failed: ${res.status}`);
  const data: any = await res.json();
  const results = data?.data;
  if (!Array.isArray(results) || results.length === 0) return null;
  const first = results[0];
  return {
    dest_id: first.dest_id,
    search_type: first.search_type,
    name: first.name || first.label || query,
  };
}

export async function searchHotels(
  destination: string,
  checkinDate: string,
  checkoutDate: string,
  adults: number = 2,
  rooms: number = 1
): Promise<string> {
  // Step 1: Resolve destination
  const dest = await searchDestination(destination);
  if (!dest) return `❌ לא מצאתי יעד בשם "${destination}"`;

  // Step 2: Search hotels
  const params = new URLSearchParams({
    dest_id: dest.dest_id,
    search_type: dest.search_type,
    arrival_date: checkinDate,
    departure_date: checkoutDate,
    adults: String(adults),
    room_qty: String(rooms),
    page_number: "1",
    units: "metric",
    temperature_unit: "c",
    languagecode: "en-us",
    currency_code: "ILS",
  });

  const url = `${BASE_URL}/api/v1/hotels/searchHotels?${params}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`Hotel search failed: ${res.status}`);
  const data: any = await res.json();

  const hotels = data?.data?.hotels;
  if (!Array.isArray(hotels) || hotels.length === 0) {
    return `לא נמצאו מלונות ב-${dest.name} בתאריכים ${checkinDate} - ${checkoutDate}`;
  }

  const top = hotels.slice(0, 5);
  const lines = [`🏨 מלונות ב-${dest.name} (${checkinDate} → ${checkoutDate}):\n`];

  for (const hotel of top) {
    const name = hotel.property?.name || "?";
    const price = hotel.property?.priceBreakdown?.grossPrice?.value
      ? `₪${Math.round(hotel.property.priceBreakdown.grossPrice.value)}`
      : "?";
    const rating = hotel.property?.reviewScore
      ? `${hotel.property.reviewScore}/10`
      : "";
    const stars = hotel.property?.propertyClass
      ? "⭐".repeat(hotel.property.propertyClass)
      : "";
    const ratingWord = hotel.property?.reviewScoreWord || "";

    lines.push(`• ${name} ${stars}`);
    lines.push(`  💰 ${price} | ${rating} ${ratingWord}`);
  }

  return lines.join("\n");
}
