import { controlDevice, getDeviceStatus, listRooms, listDevices, findDevice } from "../../control4";
import type { ToolHandler } from "./types";

export const smarthomeHandlers: Record<string, ToolHandler> = {
  smart_home_control: async (input) => {
    return controlDevice(input.device_name, input.action, input.value);
  },

  smart_home_status: async (input) => {
    const device = await findDevice(input.device_name);
    if (!device) return `❌ לא מצאתי מכשיר בשם "${input.device_name}"`;
    return getDeviceStatus(device.id);
  },

  smart_home_list: async (input) => {
    if (input.type === "rooms") return listRooms();
    return listDevices();
  },
};
