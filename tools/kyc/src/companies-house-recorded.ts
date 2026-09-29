/**
 * Recorded Companies House company-profile responses, in the shape
 * `GET /company/{company_number}` returns. The check answers from these when
 * `COMPANIES_HOUSE_API_KEY` is not set and labels its result test data.
 * Numbers with no entry answer 404, as the live API does.
 */
export const RECORDED_COMPANY_PROFILES: Readonly<Record<string, unknown>> = {
  "09318842": {
    company_name: "THORNBURY COURIERS LTD",
    company_number: "09318842",
    company_status: "active",
    type: "ltd",
    jurisdiction: "england-wales",
    date_of_creation: "2014-11-17",
    accounts: {
      accounting_reference_date: { day: "30", month: "09" },
      last_accounts: {
        period_start_on: "2022-10-01",
        period_end_on: "2023-09-30",
        type: "total-exemption-full",
      },
      next_accounts: {
        period_start_on: "2023-10-01",
        period_end_on: "2024-09-30",
        due_on: "2025-06-30",
        overdue: true,
      },
      next_due: "2025-06-30",
      overdue: true,
    },
    confirmation_statement: {
      last_made_up_to: "2025-11-17",
      next_due: "2026-12-01",
      overdue: false,
    },
  },
  "10774521": {
    company_name: "NORTHWIND FREIGHT LTD",
    company_number: "10774521",
    company_status: "active",
    type: "ltd",
    jurisdiction: "england-wales",
    date_of_creation: "2017-05-16",
    accounts: {
      accounting_reference_date: { day: "31", month: "05" },
      last_accounts: {
        period_start_on: "2024-06-01",
        period_end_on: "2025-05-31",
        type: "full",
      },
      next_accounts: {
        period_start_on: "2025-06-01",
        period_end_on: "2026-05-31",
        due_on: "2027-02-28",
        overdue: false,
      },
      next_due: "2027-02-28",
      overdue: false,
    },
  },
  "07261930": {
    company_name: "ELMSTEAD PRINT WORKS LIMITED",
    company_number: "07261930",
    company_status: "dissolved",
    type: "ltd",
    jurisdiction: "england-wales",
    date_of_creation: "2010-05-24",
    date_of_cessation: "2025-11-04",
    accounts: {
      last_accounts: { period_end_on: "2023-05-31", type: "micro-entity" },
    },
  },
  "11456078": {
    company_name: "QUAYSIDE LOGISTICS LTD",
    company_number: "11456078",
    company_status: "liquidation",
    type: "ltd",
    jurisdiction: "england-wales",
    date_of_creation: "2018-07-09",
    has_insolvency_history: true,
    accounts: {
      next_accounts: { due_on: "2026-04-30", overdue: false },
      overdue: false,
    },
  },
};
