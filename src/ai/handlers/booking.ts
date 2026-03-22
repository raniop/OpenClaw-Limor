import { searchAvailability, bookOntopo } from "../../ontopo";
import { searchTabit, bookTabit } from "../../tabit";
import type { ToolHandler } from "./types";

export const bookingHandlers: Record<string, ToolHandler> = {
  ontopo_search: async (input) => {
    return await searchAvailability(input.restaurant, input.date, input.time, input.party_size);
  },

  tabit_search: async (input) => {
    return await searchTabit(input.restaurant, input.date, input.time, input.party_size, input.city);
  },

  book_tabit: async (input) => {
    return await bookTabit({
      publicUrlLabel: input.publicUrlLabel,
      date: input.date,
      time: input.time,
      partySize: input.party_size,
      firstName: input.first_name,
      lastName: input.last_name,
      phone: input.phone,
      email: input.email,
    });
  },

  book_ontopo: async (input) => {
    return await bookOntopo({
      restaurantSlug: input.restaurant_slug,
      date: input.date,
      time: input.time,
      partySize: input.party_size,
      firstName: input.first_name,
      lastName: input.last_name,
      phone: input.phone,
      email: input.email,
    });
  },
};
