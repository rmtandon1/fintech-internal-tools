import type { CompaniesHouseAnswer } from "./companies-house";

/**
 * Company profiles (`GET /company/{companyNumber}`) returned without
 * `COMPANIES_HOUSE_API_KEY`, in the shape the Companies House Public Data API
 * documents, cut to the fields the check reads. A number not listed answers
 * 404. Every result built from these is labelled test data.
 */
export const RECORDED_RESPONSES: Readonly<Record<string, CompaniesHouseAnswer>> = {
  // Thornbury Couriers Ltd (kyc_0104): active, but late with its accounts.
  "09318842": {
    kind: "response",
    status: 200,
    body: {
      company_number: "09318842",
      company_name: "THORNBURY COURIERS LTD",
      company_status: "active",
      type: "ltd",
      date_of_creation: "2014-11-18",
      accounts: {
        overdue: true,
        next_due: "2026-06-30",
        last_accounts: { period_end_on: "2024-09-30", type: "micro-entity" },
        next_accounts: {
          period_start_on: "2024-10-01",
          period_end_on: "2025-09-30",
          due_on: "2026-06-30",
          overdue: true,
        },
      },
      confirmation_statement: { next_due: "2026-12-01", overdue: false },
    },
  },
  "08123456": {
    kind: "response",
    status: 200,
    body: {
      company_number: "08123456",
      company_name: "HARBOUR LANE LOGISTICS LTD",
      company_status: "active",
      type: "ltd",
      accounts: {
        overdue: false,
        next_due: "2027-03-31",
        next_accounts: { due_on: "2027-03-31", overdue: false },
      },
    },
  },
  "07654321": {
    kind: "response",
    status: 200,
    body: {
      company_number: "07654321",
      company_name: "MILLBROOK TRADING LTD",
      company_status: "dissolved",
      type: "ltd",
      date_of_cessation: "2025-11-04",
      accounts: { next_accounts: { due_on: "2025-06-30", overdue: false } },
    },
  },
  "06543210": {
    kind: "response",
    status: 200,
    body: {
      company_number: "06543210",
      company_name: "ASHCOMBE FREIGHT LTD",
      company_status: "liquidation",
      type: "ltd",
      has_been_liquidated: false,
      accounts: { next_accounts: { due_on: "2026-12-31", overdue: false } },
    },
  },
  "05000500": { kind: "response", status: 500, body: null },
  "05000408": { kind: "timeout" },
};
