export type { CapabilitySpec, ClassificationResult, TeachingLevel } from "./types";
export { classifyTeaching } from "./classifier";
export {
  createSpec,
  saveSpec,
  listPending,
  listApproved,
  approveSpec,
  rejectSpec,
  getSpec,
} from "./spec-store";
