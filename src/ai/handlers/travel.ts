import { searchFlights } from "../../flights";
import { searchHotels } from "../../hotels";
import type { ToolHandler } from "./types";

export const travelHandlers: Record<string, ToolHandler> = {
  flight_search: async (input) => {
    return await searchFlights(
      input.origin,
      input.destination,
      input.date,
      input.return_date,
      input.adults || 1,
      input.cabin_class || "economy"
    );
  },

  hotel_search: async (input) => {
    return await searchHotels(
      input.destination,
      input.checkin_date,
      input.checkout_date,
      input.adults || 2,
      input.rooms || 1
    );
  },
};
