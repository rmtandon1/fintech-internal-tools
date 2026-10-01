import "@/app/bootstrap";
import { runScheduledRecheck } from "@console/tool-kyc";

/**
 * The daily Companies House recheck of approved UK merchants. Schedule it once
 * a day (cron, a platform scheduler); it goes through the governed KYC
 * `recheck_merchants` action as the system actor, a second run the same UTC
 * day replays the first, and the final line is the outcome, whose summary
 * lists every merchant's result.
 */
const result = runScheduledRecheck();
console.log(JSON.stringify(result));
