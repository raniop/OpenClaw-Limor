import { bookRide, getRideStatus, cancelRide } from "../../gett";
import type { ToolHandler } from "./types";

export const gettHandlers: Record<string, ToolHandler> = {
  gett_book_ride: async (input) => {
    return bookRide({
      pickupAddress: input.pickup_address,
      dropoffAddress: input.dropoff_address,
      scheduledAt: input.scheduled_at,
      note: input.note,
    });
  },

  gett_ride_status: async (input) => {
    return getRideStatus(input.order_id);
  },

  gett_cancel_ride: async (input) => {
    return cancelRide(input.order_id);
  },
};
