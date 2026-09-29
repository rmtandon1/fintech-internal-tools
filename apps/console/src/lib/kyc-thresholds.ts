import { cache } from "react";
import { loadConstants } from "@console/engine/policy/constants";
import {
  MANAGER_REVIEW_SCORE_KEY,
  PROHIBITED_COUNTRIES_KEY,
} from "@console/tool-kyc";
import type { RiskThresholds } from "@/lib/customer-profile";

/**
 * The KYC policy constants the customer card and the risk column draw with,
 * read once per request. The fallbacks match the ones the policy rules use.
 */
export const kycThresholds = cache(
  (): RiskThresholds & { prohibited: string[] } => {
    const constants = loadConstants();
    return {
      manager: constants.number(MANAGER_REVIEW_SCORE_KEY, 70),
      prohibited: constants.stringList(PROHIBITED_COUNTRIES_KEY, []),
    };
  },
);
