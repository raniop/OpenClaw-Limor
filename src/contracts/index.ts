// Re-export all contract module public APIs
export type {
  Contract,
  ContractCategory,
  ContractBillingCycle,
  ContractStatus,
} from "./contract-types";

export {
  CATEGORY_LABELS,
  CATEGORY_EMOJIS,
  BILLING_CYCLE_LABELS,
} from "./contract-types";

export {
  addContract,
  getContracts,
  updateContract,
  getExpiringContracts,
  findContractByVendor,
} from "./contract-store";

export {
  isLikelyContract,
  detectContract,
  detectContractFromText,
} from "./contract-detector";

export {
  extractTextFromPdf,
  processDocumentForContract,
} from "./pdf-extractor";
