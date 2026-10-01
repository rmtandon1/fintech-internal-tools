# DEVIN Clustering Hold Spec

**Audience:** an executing agent or developer implementing the refund clustering hold outside a
console run: rebuilding the demo's after-state, rehearsing Part 1, or recovering from a failed run.

**Not for console runs.** A run dispatched from the console gets one sentence and its
`context.json`, and works the rest out from the code
([DEVIN_RUN_PROTOCOL.md](DEVIN_RUN_PROTOCOL.md)). The playbook forbids opening a feature spec
under `docs/` unless the prompt names it, and this file is never named. The human-facing
version of the same change is [WORKFLOW_EXPLAINED.md](WORKFLOW_EXPLAINED.md). The reviewer's
brief is [REFUND_CLUSTERING_HOLD.md](REFUND_CLUSTERING_HOLD.md).

**Question this spec answers:** exactly what code must change?

---

## 1. Current State

Audited against `cognition-dashboard-devin-integration` at `a54fd58` (28 September 2026). The
hold is **not** in the code: #63 returned the demo to its before-state.

| What | File | Line | Current value |
|---|---|---|---|
| Refund `execute` rules | `tools/refunds/src/index.ts` | 306 | `rules: [withinCapturedAmount, notDisputed, amountApproval, goodwillApproval],` |
| Clusters import | `tools/refunds/src/index.ts` | 13 | `import { MANAGER_APPROVAL_USD_KEY, notReceivedByMerchant } from "./clusters";` |
| Declared refund constants | `tools/refunds/src/index.ts` | 274–296 | Two: `manager_approval_usd_minor` 50,000, `goodwill_approval_usd_minor` 5,000 |
| Window key | `tools/refunds/src/clusters.ts` | 8 | `CLUSTERING_WINDOW_DAYS_KEY = "refunds.clustering_window_days"`, **declared nowhere** |
| Window default | `tools/refunds/src/clusters.ts` | 11 | `DEFAULT_CLUSTERING_WINDOW_DAYS = 14` |
| Window reader | `tools/refunds/src/clusters.ts` | 28–32 | `clusteringWindowDays()` returns 0 for 0 (off) and 14 for a negative value (#72; before that, 0 also became 14) |
| KYC `approve` rules | `tools/kyc/src/index.ts` | 374–382 | `documentsComplete … declaredVsFound, escalatedNeedsManager` (7 rules) |
| KYC → refunds dependency | `tools/kyc/package.json` | — | `@console/tool-refunds` already listed |
| Test pinning "each Kestrel refund is allowed" | `apps/console/tests/tools/refunds-clusters.test.ts` | 53–63 | `expect(preview?.decision?.effect).toBe("allow")` |
| Test pinning KYC rule order | `apps/console/tests/tools/kyc-case-file.test.ts` | 204–216 | `toEqual([… "declared_vs_found", "escalated_needs_manager"])` |
| `clustering-hold.ts` | `tools/refunds/src/` | — | Does not exist |

Seed facts the tests rely on: `rfnd_0011`–`rfnd_0014` are Kestrel Outdoors `not_received`
refunds of 48,000 / 47,500 / 46,000 / 46,500 USD minor ($1,880 together), and `kyc_0013`
(risk score 68) shares `noor.el-amin@example.com` with `rfnd_0012`.

> **CRITICAL: the value that runs is not the value in the source.**
> Thresholds are read on every decision from the `runtime_constants` table in
> `apps/console/data/console.db` (`loadConstants`, `packages/engine/src/policy/constants.ts`).
> The `value:` in a tool's `constants` array is only a default. `registerConstants` skips any
> key that already exists, so editing a default in code changes nothing on a database that
> already has the row. Always check the live value:
>
> ```bash
> sqlite3 apps/console/data/console.db \
>   "select key, value_json from runtime_constants where key like 'refunds.%';"
> ```
>
> The same applies to the build: `pnpm dev` serves source, but `pnpm start` serves the compiled
> `.next/` output, which needs `pnpm build` before it runs merged code.

---

## 2. Input Mapping

The console's one-sentence requests map to these structured changes. `set_constant` needs no
code and no run.

| Request | Structured change |
|---|---|
| "Once a merchant's 'not received' refunds add up past the manager limit, send all of them to a manager for approval, including the first." | `{ "action": "add_rule", "target": "refunds.execute", "oldIdentifier": null, "newIdentifier": "clustering_hold", "parameter": { "key": "refunds.clustering_window_days", "default": 14, "offValue": 0 } }` |
| "Send those customers' KYC approvals to a manager too." | `{ "action": "add_rule", "target": "kyc.approve", "oldIdentifier": null, "newIdentifier": "linked_refund_hold", "parameter": { "key": "refunds.clustering_window_days", "default": 14, "offValue": 0 } }` |
| "Switch the hold off." | `{ "action": "set_constant", "target": "/admin/policy", "oldIdentifier": "14", "newIdentifier": "0", "parameter": { "key": "refunds.clustering_window_days" } }` |
| "Undo the refund hold …" | `{ "action": "remove_rule", "target": "refunds.execute,kyc.approve", "oldIdentifier": "clustering_hold,linked_refund_hold", "newIdentifier": null, "parameter": { "key": "refunds.clustering_window_days" } }` |

---

## 3. Domain Rationale

Four invariants a plausible implementation gets wrong:

1. **0 means off, and must stay off.** The admin's kill switch is the window set to 0. Never
   coerce 0 to the 14-day default: until #72, `clusteringWindowDays()` did exactly that, and a
   hold built on it could not be switched off. Read the value from the rule's `constants`
   argument and treat `<= 0` as off, and prove it with acceptance test 6.
2. **Sum `usdMinor`, not `amountMinor`.** `amountMinor` is in the refund's own currency.
   `usdMinor` is USD cents at the rate frozen when the refund was requested, and it is what
   the manager line (`refunds.manager_approval_usd_minor`, 50,000 = $500) is measured in.
3. **Rejected refunds don't count, and the line is inclusive.** Exclude `status = 'rejected'`,
   and hold at `total >= limit`, matching `amount_approval`.
4. **Hold, never deny.** A cluster is a reason for a second person to look, not proof of fraud.
   The rule returns `require_approval` at the manager tier.

Also: read the manager line from its setting, never copy 50,000 into the rule; register the
rule after `goodwill_approval`, because rule order is trace order and reviewers read the trace.

---

## 4. Exact Changes

Ordered by file. The REPLACE blocks follow the reviewer's reference implementation in
[REFUND_CLUSTERING_HOLD.md](REFUND_CLUSTERING_HOLD.md) with the four invariants above applied.
They have not been executed in this repository; section 6 is how you prove them.

### 4.1 `tools/refunds/src/clustering-hold.ts` (create)

```ts
import { and, eq, gte, lte, ne, sql } from "drizzle-orm";
import { db } from "@console/db";
import type { ConstantReader, Rule } from "@console/engine/types";
import { rolesFor } from "@console/permissions";
import {
  CLUSTERING_WINDOW_DAYS_KEY,
  DEFAULT_CLUSTERING_WINDOW_DAYS,
  DEFAULT_MANAGER_APPROVAL_USD_MINOR,
  MANAGER_APPROVAL_USD_KEY,
} from "./clusters";
import { refunds } from "./schema";

const DAY = 24 * 60 * 60 * 1000;

interface ClusterMember {
  id: string;
  merchant: string;
  reasonCode: string;
  usdMinor: number;
  requestedAt: number;
}

/** The window in days from this decision's constants: 0 (or less) switches the hold off. */
function holdWindowDays(constants: ConstantReader): number {
  return constants.number(CLUSTERING_WINDOW_DAYS_KEY, DEFAULT_CLUSTERING_WINDOW_DAYS);
}

/**
 * The merchant's not-received total up to and including `refund`, over the
 * window, in USD cents at each refund's frozen rate. Rejected refunds don't count.
 */
function runningTotal(refund: ClusterMember, windowDays: number): number {
  const prior =
    db
      .select({ total: sql<number>`coalesce(sum(${refunds.usdMinor}), 0)` })
      .from(refunds)
      .where(
        and(
          eq(refunds.merchant, refund.merchant),
          eq(refunds.reasonCode, "not_received"),
          ne(refunds.id, refund.id),
          ne(refunds.status, "rejected"),
          gte(refunds.requestedAt, refund.requestedAt - windowDays * DAY),
          lte(refunds.requestedAt, refund.requestedAt),
        ),
      )
      .get()?.total ?? 0;
  return prior + refund.usdMinor;
}

/** Not-received refunds from one merchant route to the manager once together they reach the line. */
export const clusteringHold: Rule<ClusterMember, unknown> = ({ record, constants }) => {
  const windowDays = holdWindowDays(constants);
  if (!record || record.reasonCode !== "not_received" || windowDays <= 0) {
    return { type: "allow", rule: "clustering_hold" };
  }
  const limit = constants.number(MANAGER_APPROVAL_USD_KEY, DEFAULT_MANAGER_APPROVAL_USD_MINOR);
  const total = runningTotal(record, windowDays);
  return total >= limit
    ? {
        type: "require_approval",
        rule: "clustering_hold",
        tier: "manager",
        allowedRoles: rolesFor("refunds", "manager"),
        reason: `${record.merchant} not-received refunds total ${(total / 100).toFixed(2)} USD over ${windowDays} days, at or above the manager line`,
      }
    : { type: "allow", rule: "clustering_hold" };
};

/** True when one of the customer's not-received refunds sits in a cluster at or over the line. */
export function customerInHeldCluster(email: string, constants: ConstantReader): boolean {
  const windowDays = holdWindowDays(constants);
  if (windowDays <= 0) return false;
  const limit = constants.number(MANAGER_APPROVAL_USD_KEY, DEFAULT_MANAGER_APPROVAL_USD_MINOR);
  const own = db
    .select({
      id: refunds.id,
      merchant: refunds.merchant,
      reasonCode: refunds.reasonCode,
      usdMinor: refunds.usdMinor,
      requestedAt: refunds.requestedAt,
    })
    .from(refunds)
    .where(
      and(
        eq(refunds.customerEmail, email),
        eq(refunds.reasonCode, "not_received"),
        ne(refunds.status, "rejected"),
      ),
    )
    .all();
  return own.some((refund) => runningTotal(refund, windowDays) >= limit);
}
```

### 4.2 `tools/refunds/src/index.ts` (modify, 4 edits)

**Edit A, line 13.** FIND:

```ts
import { MANAGER_APPROVAL_USD_KEY, notReceivedByMerchant } from "./clusters";
```

REPLACE:

```ts
import { clusteringHold } from "./clustering-hold";
import {
  CLUSTERING_WINDOW_DAYS_KEY,
  DEFAULT_CLUSTERING_WINDOW_DAYS,
  MANAGER_APPROVAL_USD_KEY,
  notReceivedByMerchant,
} from "./clusters";
```

**Edit B, the re-export block after line 15.** FIND:

```ts
import { seedRefunds } from "./seed";

export {
```

REPLACE:

```ts
import { seedRefunds } from "./seed";

export { customerInHeldCluster } from "./clustering-hold";
export {
```

**Edit C, the constants array (lines 289–296).** FIND:

```ts
      description: "Goodwill refunds at or above this amount need a manager. In cents, USD.",
      tool: "refunds",
    },
  ],
```

REPLACE:

```ts
      description: "Goodwill refunds at or above this amount need a manager. In cents, USD.",
      tool: "refunds",
    },
    {
      key: CLUSTERING_WINDOW_DAYS_KEY,
      value: DEFAULT_CLUSTERING_WINDOW_DAYS,
      type: "number",
      description: "Days of not-received refunds summed per merchant; 0 turns the hold off",
      tool: "refunds",
    },
  ],
```

**Edit D, line 306.** FIND:

```ts
      rules: [withinCapturedAmount, notDisputed, amountApproval, goodwillApproval],
```

REPLACE:

```ts
      rules: [withinCapturedAmount, notDisputed, amountApproval, goodwillApproval, clusteringHold],
```

### 4.3 `tools/kyc/src/index.ts` (modify, 3 edits)

**Edit A, after line 16** (`import { seedKycCases } from "./seed";`). FIND:

```ts
import { seedKycCases } from "./seed";
```

REPLACE:

```ts
import { seedKycCases } from "./seed";
import { customerInHeldCluster } from "@console/tool-refunds";
```

**Edit B, after the `escalatedNeedsManager` rule (ends line 151).** FIND:

```ts
        reason: "Escalated cases need a manager",
      }
    : { type: "allow", rule: "escalated_needs_manager" };
```

REPLACE:

```ts
        reason: "Escalated cases need a manager",
      }
    : { type: "allow", rule: "escalated_needs_manager" };

/** A customer whose refunds a clustering hold would catch needs a manager, whatever the score. */
const linkedRefundHold: CaseRule = ({ record, constants }) =>
  record && customerInHeldCluster(record.email, constants)
    ? {
        type: "require_approval",
        rule: "linked_refund_hold",
        tier: "manager",
        allowedRoles: rolesFor("kyc", "manager"),
        reason: "This customer's refunds are held as part of a merchant cluster",
      }
    : { type: "allow", rule: "linked_refund_hold" };
```

**Edit C, lines 380–381.** FIND:

```ts
        declaredVsFound,
        escalatedNeedsManager,
      ],
```

REPLACE:

```ts
        declaredVsFound,
        escalatedNeedsManager,
        linkedRefundHold,
      ],
```

Add `linked_refund_hold: "Linked refund hold"` to the tool's `ruleLabels` next to
`declared_vs_found: "Declared vs found"` (line 494) so the trace reads in words.

### 4.4 `apps/console/tests/tools/refunds-clusters.test.ts` (modify on purpose)

Lines 53–63 assert every Kestrel refund previews as `allow`. The hold changes that. Rename the
test to "every row in the group passes amount_approval on its own" and keep only the second
assertion:

FIND:

```ts
      expect(preview?.decision?.effect).toBe("allow");
      expect(preview?.decision?.trace).toContainEqual({ type: "allow", rule: "amount_approval" });
```

REPLACE:

```ts
      expect(preview?.decision?.trace).toContainEqual({ type: "allow", rule: "amount_approval" });
```

### 4.5 `apps/console/tests/tools/kyc-case-file.test.ts` (modify on purpose)

FIND (line 214–215):

```ts
      "declared_vs_found",
      "escalated_needs_manager",
    ]);
```

REPLACE:

```ts
      "declared_vs_found",
      "escalated_needs_manager",
      "linked_refund_hold",
    ]);
```

### 4.6 `apps/console/tests/tools/refunds-clustering-hold.test.ts` (create)

One `it(...)` per acceptance line in [REFUND_CLUSTERING_HOLD.md](REFUND_CLUSTERING_HOLD.md)
§ Acceptance tests (1–8), using the harness in `refunds.test.ts`: `setupHarness()`,
`registerConstants(refundTool.constants ?? [])`, `refundTool.seed?.()`, and the KYC tool's
constants and seed for tests 7–8. Build fixtures from the Kestrel ids above.

---

## 5. Prompt Template

Copy, fill the two placeholders, and hand to the agent.

```text
Repository: https://github.com/rmtandon1/fintech-internal-tools
Base branch: cognition-dashboard-devin-integration (pull first; record the head sha as BASE)
Branch: devin/<run_id>-clustering-hold   (outside a console run: devin/manual-clustering-hold)

Task: add the refund clustering hold exactly as docs/DEVIN-CLUSTERING-HOLD-SPEC.md § 4 says.
Apply each FIND/REPLACE verbatim. If a FIND block does not match exactly once, STOP and report
the file and block; do not improvise an edit.

Rules:
- Read the window with constants.number(CLUSTERING_WINDOW_DAYS_KEY, 14); treat <= 0 as off.
- Sum usdMinor. Exclude rejected. Hold at total >= limit. require_approval, never deny.
- Touch only: tools/refunds/src/clustering-hold.ts, tools/refunds/src/index.ts,
  tools/kyc/src/index.ts, apps/console/tests/**. Nothing under packages/.
- Never run pnpm db:setup, db:seed or db:scenario against apps/console/data/console.db.

Validate (all must pass):
  run the bash block in docs/DEVIN-CLUSTERING-HOLD-SPEC.md § 6 (it ends with pnpm verify)

Git:
  git add -A && git commit -m "Hold a merchant's not-received refunds once they pass the manager line"
  git push -u origin HEAD
  gh pr create --base cognition-dashboard-devin-integration --fill

Report exactly this JSON and nothing else:
{
  "branch": "<branch>",
  "base_commit": "<BASE>",
  "pr_url": "https://github.com/rmtandon1/fintech-internal-tools/pull/<n>",
  "pr_number": <n>,
  "files": [{ "path": "...", "op": "create|modify", "additions": 0, "deletions": 0 }],
  "verify_steps": [
    { "name": "Lint", "pass": true },
    { "name": "Typecheck", "pass": true },
    { "name": "Boundaries", "pass": true },
    { "name": "Test", "pass": true, "before": <n>, "after": <n> }
  ],
  "assertions": [{ "check": "<name>", "expected": "<value>", "actual": "<value>", "pass": true }],
  "stopped_by": null
}
```

Inside a console run the report is the `StructuredOutput` schema in
`tools/automation/src/run-files.ts` instead, and the plan commit comes first
([DEVIN_RUN_PROTOCOL.md](DEVIN_RUN_PROTOCOL.md) § Phases).

---

## 6. Validation

Machine-checkable. Run from the repo root after the edits.

```bash
set -e
# Syntax and types
pnpm typecheck

# The rule is registered once, after goodwill_approval
test "$(grep -c 'goodwillApproval, clusteringHold\]' tools/refunds/src/index.ts)" -eq 1

# The window setting is declared exactly once, so /admin/policy can show it
test "$(grep -c 'key: CLUSTERING_WINDOW_DAYS_KEY' tools/refunds/src/index.ts)" -eq 1

# Sums frozen-rate USD, never native amounts
test "$(grep -c 'amountMinor' tools/refunds/src/clustering-hold.ts)" -eq 0

# The KYC rule is appended last
test "$(grep -c 'escalatedNeedsManager,$' tools/kyc/src/index.ts)" -eq 1
test "$(grep -c 'linkedRefundHold,$' tools/kyc/src/index.ts)" -eq 1

# The old "every Kestrel refund is allowed" assertion is gone
test "$(grep -c 'decision?.effect).toBe("allow")' apps/console/tests/tools/refunds-clusters.test.ts)" -eq 0

# Nothing outside the allowed paths, nothing in the engine
git diff --name-only origin/cognition-dashboard-devin-integration... \
  | grep -vE '^(tools/refunds/src/(clustering-hold|index)\.ts|tools/kyc/src/index\.ts|apps/console/tests/)' \
  && { echo "file outside allowed paths"; exit 1; } || true

# Full gate
pnpm verify
echo "all assertions passed"
```

Behavioural checks, on a fresh local database (never the one serving :3001):

| As | Do | Expect |
|---|---|---|
| `analyst` | Send `rfnd_0011` to the processor before the rule merges | Applied |
| `analyst` | Find `rfnd_0011` absent from the queue after the rule merges | It is in the manager's queue; trace names `clustering_hold` |
| `manager` | Send or reject the routed refund | Applied directly; no approval request |
| `analyst` | Approve `kyc_0013` | Routed to a manager; trace names `linked_refund_hold` |
| `admin` | Set `refunds.clustering_window_days` to 0, send `rfnd_0014` | Applied; `clustering_hold` reads allow |

---

## 7. Error-Prevention Checklist

- [ ] **MUST** apply every FIND/REPLACE in full. A partial edit (rule written, never registered
      in `rules: […]`) passes typecheck and does nothing.
- [ ] **MUST** treat a window of 0 as off, with a test that sets it to 0 and sees the next
      Kestrel refund go straight through.
- [ ] **MUST** sum `usdMinor`, exclude `rejected`, and compare with `>=`.
- [ ] **MUST** return `require_approval`, never `deny`.
- [ ] **MUST** declare `refunds.clustering_window_days` in the refunds `constants`, or it never
      appears on `/admin/policy` and the admin cannot switch the hold off.
- [ ] **MUST** list both changed existing test files in the plan (`refunds-clusters.test.ts`,
      `kyc-case-file.test.ts`). Two live Kestrel runs stopped at Verify for missing exactly
      these (#65).
- [ ] **MUST NOT** touch `packages/`, `tools/flags/`, or the live database.
- [ ] **MUST** report the PR number and URL in the JSON. A run without a PR number cannot be
      approved from the console.
- [ ] **MUST NOT** delete a test to get green. Per-file test counts stay at or above baseline.
