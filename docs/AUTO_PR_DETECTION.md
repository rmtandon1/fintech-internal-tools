# Automatic Pull Request Detection

## What Changed

The console notices by itself when Devin opens a rule change's pull request and when that pull request merges. Nobody pastes a link or presses a button: the PR number appears on the run, the run turns **Merged**, and the audit chain gets its `record_pr` and `record_merge` rows. That happens while someone has the run or the `/runs` list open.

## How It Works

### 1. The integrations

Two external systems are read, both from the server only (`apps/console/src/lib/bridge.ts`), so no credential reaches the browser.

| What is detected | Source | Call | Governed write |
| --- | --- | --- | --- |
| Devin opened a PR | Devin v3 session | `GET /v3/organizations/{org_id}/sessions/{session_id}` | `record_pr` (once) |
| The PR merged | GitHub REST | `GET /repos/{owner}/{repo}/pulls/{n}` | `record_merge` |
| The session ended without a merge | Devin v3 session | same session read | `stop` |

#### 1a. Devin: the session reports `pr_url`

Devin can't push events to the console, so the console reads the session. Devin writes progress into the session's `structured_output` (schema in `DEVIN_RUN_PROTOCOL.md` § Progress), and `pr_url` is one of its fields.

```http
GET https://api.devin.ai/v3/organizations/{org_id}/sessions/{session_id}
Authorization: Bearer $DEVIN_API_KEY
```

Example response, trimmed to the three fields the client reads. Values are illustrative; `structured_output` follows the schema in `DEVIN_RUN_PROTOCOL.md` § Progress.

```json
{
  "status": "running",
  "status_detail": null,
  "structured_output": {
    "phase": "pull_request",
    "phase_status": "done",
    "base_commit": "1a67f60",
    "branch": "devin/01K5Z3Q8-clustering-hold",
    "pr_url": "https://github.com/rmtandon1/fintech-internal-tools/pull/63",
    "stopped_by": null
  }
}
```

The client reads those three fields (`tools/automation/src/devin-api.ts:171-181`):

```ts
async getSession(sessionId) {
  const json = await call(`${await orgPath()}/sessions/${encodeURIComponent(sessionId)}`, { method: "GET" });
  const status = field(json, "status");
  if (typeof status !== "string") throw new Error("Devin session read returned no status");
  const detail = field(json, "status_detail");
  return {
    status,
    statusDetail: typeof detail === "string" ? detail : null,
    structuredOutput: field(json, "structured_output") ?? null,
  };
},
```

The first time a validated snapshot carries a `pr_url`, `observeRun` records it through `record_pr`. It checks the policy with a preview first, so an actor the rules would deny leaves no stored outcome for the next poll to replay (`tools/automation/src/bridge.ts:369-385`):

```ts
export async function observeRun(actor: Actor, run: DevinRun, deps: BridgeDeps): Promise<ObserveOutcome> {
  const poll = await pollRun(run, deps);
  const prUrl = poll.kind === "output" ? poll.structuredOutput.pr_url : null;
  if (!prUrl || run.prUrl || run.status !== "running") return { poll, record: null };
  const preview = previewActions(automationTool, run, actor, { record_pr: { prUrl } }).find(
    (p) => p.action === "record_pr",
  );
  if (preview?.offered !== true || preview.decision?.effect !== "allow") return { poll, record: null };
  const record = executeIntent(actor, {
    tool: "automation",
    action: "record_pr",
    recordId: run.id,
    input: { prUrl },
    idempotencyKey: key(run.id, `record_pr:${prUrl}:${actor.id}`),
  });
  return { poll, record };
}
```

The PR is written once. `prNotYetRecorded` denies a second `record_pr`, so a later poll that drops or changes `pr_url` can't lose or replace it (`tools/automation/src/index.ts:242-252`).

#### 1b. GitHub: the PR reports `merged`

Once the run is `approved`, the console asks GitHub whether the PR has merged:

```http
GET https://api.github.com/repos/{owner}/{repo}/pulls/{n}
Authorization: Bearer $GITHUB_TOKEN
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2022-11-28
```

Example response, trimmed to the fields the `Pull` schema parses (`tools/automation/src/github-api.ts:58-62`). Values are illustrative.

```json
{
  "head": { "sha": "9c4e2f1d…", "ref": "devin/01K5Z3Q8-clustering-hold" },
  "merged": true,
  "merge_commit_sha": "4b7a0c3e…"
}
```

Only an actual merge produces a write (`tools/automation/src/bridge.ts:469-484`):

```ts
export async function observeMerge(actor: Actor, run: DevinRun, deps: BridgeDeps): Promise<MergeOutcome> {
  const prUrl = run.prUrl;
  const ref = prUrl ? parsePullUrl(prUrl) : null;
  if (!prUrl || !ref) return { kind: "unavailable", reason: "The run has no approved pull request" };
  if (!deps.github) return { kind: "unavailable", reason: "GitHub API is not configured" };
  const pull = await deps.github.getPull(ref);
  if (!pull.merged || !pull.mergeCommit) return { kind: "open", prUrl };
  const record = executeIntent(actor, {
    tool: "automation",
    action: "record_merge",
    recordId: run.id,
    input: { mergeCommit: pull.mergeCommit, prUrl },
    idempotencyKey: key(run.id, `record_merge:${pull.mergeCommit}`),
  });
  return { kind: "merged", record, mergeCommit: pull.mergeCommit };
}
```

#### 1c. Who drives the polling

There is no background job on the server. The browser drives detection: each poll is a `GET /api/devin/<runId>`, and the server's `handleGet` (`apps/console/src/lib/devin-route.ts:82-150`) runs the observers. Two client components send these requests:

| Poller | Where | Cadence | Stops when |
| --- | --- | --- | --- |
| `RunView` | Devin window and `/t/automation/<id>` | 2 s after the previous response | the run is `merged`, `stopped` or `dispatch_failed` |
| `RefreshInFlight` | `/runs` | every 5 s, one request per in-flight run on the page, then `router.refresh()` | no in-flight runs remain on the page |

`RunView`'s loop (`apps/console/src/components/run-view.tsx:232-250`) chains a `setTimeout` on each response, so a slow response never stacks up requests behind it:

```ts
useEffect(() => {
  let cancelled = false;
  async function poll() {
    const body = await fetchRun(runId);
    if (!body || cancelled) return;
    setPayload(body);
    return !TERMINAL.has(body.run.status);
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  async function loop() {
    const more = await poll();
    if (!cancelled && more !== false) timer = setTimeout(loop, 2000);
  }
  void loop();
  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
}, [runId]);
```

The audit rows are written as the right person, whoever is watching. `handleGet` looks up the run's requester for `record_pr` and `stop`, and its approver for `record_merge`, falling back to the viewer only when that person is not a known actor (`devin-route.ts:96-97`, `104-105`).

### 2. Before and after

**The run view, before Devin reports the PR** (run `running`, Verify in progress):

```
┌─────────────────────────────────────────────────────────────┐
│ Change  (Running)  LIVE · SESSION             ↗ Open in Devin│
│ Once a merchant's "not received" refunds add up past the…    │
│ requested by Manager · … · Holds clustered refunds…          │
├─────────────────────────────────────────────────────────────┤
│ ✓ Read the evidence                             base 1a67f60 │
│ ✓ Confirmed the base                                68 tests │
│ ✓ Planned 2 files                                        96s │
│ ✓ Reusing execute-intent.ts  packages/engine/src/execute-in… │
│ ✓ Made the change                                    +96 −1  │
│ ● Verified: Lint ✓ Typecheck ✓ Boundaries ✓ Test …           │
│ ○ PR open                                                    │
│ ○ Approved by an engineer                                    │
│ ○ Merged                                                     │
├─────────────────────────────────────────────────────────────┤
│ [ Stop run ]                                                 │
└─────────────────────────────────────────────────────────────┘
```

**The same view, one poll after `pr_url` appears.** `record_pr` has been written, and an engineer who didn't request the run is offered the review:

```
┌─────────────────────────────────────────────────────────────┐
│ Change  (Running)  LIVE · SESSION             ↗ Open in Devin│
│ …                                                            │
├─────────────────────────────────────────────────────────────┤
│ ✓ Verified: Lint ✓ Typecheck ✓ Boundaries ✓ Test ✓  68 → 74  │
│ ✓ PR open #63                                                │
│ ○ Approved by an engineer                                    │
│ ○ Merged                                                     │
├─────────────────────────────────────────────────────────────┤
│ ⎇ PR #63   [ Review and approve ]   [ Stop run ]             │
└─────────────────────────────────────────────────────────────┘
```

**The `/runs` row**, before, after `record_pr`, and after `record_merge`:

```
Type    Request                        Asked by         Status           Pull request
Change  Once a merchant's "not rec…    Manager         (Devin working)  —
Change  Once a merchant's "not rec…    Manager         (Devin working)  #63
Change  Once a merchant's "not rec…    Manager         (Live)           #63
```

### 3. Visual states

The status chip's colour comes from the status's `tone` (`packages/ui/src/status-chip.tsx:5-11`). The labels differ by surface: `/runs` uses the tool's operator labels (`tools/automation/src/index.ts:339-346`), and the run view uses `RUN_STATUS_OPTIONS` (`apps/console/src/components/run-summary.tsx:27-34`).

| Status | `/runs` label | Run view label | Tone → colour | What moved it here |
| --- | --- | --- | --- | --- |
| `dispatched` | Sent to Devin | Dispatched | info → blue (`text-info`) | `dispatch` |
| `dispatch_failed` | Couldn't start | Dispatch failed | negative → red (`text-destructive`) | `record_session` with an error |
| `running` | Devin working | Running | info → blue | `record_session`; `record_pr` keeps it here |
| `approved` | Approved | Approved | positive → green (`text-success`) | `approve_pr` (engineer) |
| `merged` | Live | Merged | positive → green | **auto:** `record_merge` from the poll |
| `stopped` | Stopped | Stopped | neutral → grey (`text-muted-foreground`) | Stop run, or **auto:** session ended |

Checklist glyphs in the run view (`run-view.tsx:48-58`):

| Glyph | Colour | Meaning |
| --- | --- | --- |
| ✓ | `text-emerald-400` | Done. **PR open** flips to ✓ as soon as `pr_url` is seen, before `record_pr` commits |
| ● | `text-amber-400` | The phase the session reports it is in |
| ○ | `text-muted-foreground/60` | Not reached |

The mode tag reads **Live · session** when a Devin key is set, and **Recorded · replay.json** when the view is replaying committed frames.

## Complete Workflow

A manager asks for the clustering hold, an engineer approves it, and Devin merges it.

**Step 1: The manager asks Devin for a rule.**
The manager clicks **Ask Devin for a rule** and sends the request. `dispatchRun` writes `runs/<id>/context.json`, applies `dispatch`, creates the session and applies `record_session`. The Devin window focuses the run, and `RunView` starts polling.

At this point:
- ✅ Run row exists, status `running`
- ✅ Session id recorded
- ✅ 2 audit rows (`dispatch`, `record_session`)
- ❌ No PR
- ❌ Not approved, not merged

**Step 2: Devin works.**
Each poll reads the session. `pollRun` appends a replay frame only when status, detail or output changed, so the timeline shows changes, not poll ticks. The checklist moves through Intake, Baseline, Plan, Edit and Verify.

At this point:
- ✅ Live checklist and engineering detail
- ✅ `devin_runs` untouched: polled progress is never written to the table
- ❌ No PR

**Step 3: Devin opens the PR. Detected automatically.**
Devin sets `pr_url`. On the next poll, `observeRun` previews `record_pr` and applies it as the requester. The run view shows **PR open #63** within one poll (≤ 2 s plus request time). `/runs` shows `#63` within one tick (≤ 5 s).

At this point:
- ✅ `prUrl` stored, 3 audit rows
- ✅ **Review and approve** offered to engineers other than the requester
- ❌ Not approved

**Step 4: An engineer approves.**
The engineer opens the dialog and approves. `approveRun` reads the head's checks and the branch's `context.json` digest from GitHub, applies `approve_pr`, submits the GitHub review, and tells the session to merge.

At this point:
- ✅ Status `approved`, 4 audit rows
- ✅ GitHub review posted, Devin told to merge
- ❌ Merge not yet seen

**Step 5: Devin merges. Detected automatically.**
On the next poll after GitHub reports `merged: true`, `observeMerge` applies `record_merge` as the approver. `RunView` sees a terminal status and stops polling. On `/runs`, the row turns **Live**, and once no in-flight rows remain, `RefreshInFlight` unmounts.

At this point:
- ✅ Status `merged`, merge commit stored, 5 audit rows
- ✅ Polling stopped for this run
- ❌ Local checkout not yet updated: the poll does not pull

**Step 6: The engineer pulls the merged code.**
Because the checkout lacks the merge commit, `runOffers.sync` shows **Pull merged code**. The click runs `syncMergedRun`: a fast-forward pull, with `pnpm db:migrate` if migrations are pending ([GITHUB_INTEGRATION.md](GITHUB_INTEGRATION.md) § Merge sync).

At this point:
- ✅ Rule live in the running console
- ✅ Nothing left in flight on `refunds`, so the next `dispatch` is allowed

**Branch: the session dies instead.** If a poll reports `stopped` or `expired`, or `phase_status: "stopped"`, `observeSessionEnd` applies `stop` with the reported reason. The tool is released without anyone pressing **Stop run**.

## Technical Details

### Where it runs

The server side of one poll (`apps/console/src/lib/devin-route.ts:91-121`):

```ts
let outcome: PollOutcome | null = null;
if (run.sessionId && IN_FLIGHT_STATUSES.includes(run.status as RunStatus)) {
  const requester =
    Object.values(DEMO_ACTORS).find((a) => a.id === run?.requestedBy) ?? actor;
  const observed = await observeRun(requester, run, deps).catch(() => null);
  if (observed) {
    outcome = observed.poll;
    // A merge that landed before the session wound down must win over the
    // session-end stop, so check GitHub first.
    if (run.status === "approved") {
      const approver =
        Object.values(DEMO_ACTORS).find((a) => a.id === run?.approvedBy) ?? actor;
      await observeMerge(approver, run, deps).catch(() => null);
      run = getRun(runId) ?? run;
    }
    if (IN_FLIGHT_STATUSES.includes(run.status as RunStatus)) {
      await observeSessionEnd(requester, run, observed.poll, deps).catch(() => null);
      run = getRun(runId) ?? run;
    }
  }
}
// An approved run may have merged since; observe it as the approver.
if (run.status === "approved") {
  const approver =
    Object.values(DEMO_ACTORS).find((a) => a.id === run?.approvedBy) ?? actor;
  await observeMerge(approver, run, deps).catch(() => null);
  run = getRun(runId) ?? run;
}
```

Every write is an `executeIntent` call with a stable idempotency key (`automation:<runId>:record_pr:<url>:<actor>`, `automation:<runId>:record_merge:<sha>`, `automation:<runId>:stop:session:<sessionId>`). Two tabs that detect the same event at once replay a single row. They don't write two.

### External calls per poll

External calls made by one `GET /api/devin/<runId>`, by run status:

| Run status | Devin calls | GitHub calls |
| --- | --- | --- |
| `running` | 1 session read, **+1 `GET /v3/self`** when `DEVIN_ORG_ID` is unset | 0 |
| `approved`, PR still open | 1 (+1) | **2** (see below) |
| `approved`, merges this poll | 1 (+1) | 1 |
| `merged`, `stopped`, `dispatch_failed` | 0 | 0 |

Two of these numbers are easy to miss:

- **The `+1` to Devin.** `bridgeDeps()` builds a new `httpDevinClient` on every request, and the client caches the organisation lookup only for its own lifetime (`devin-api.ts:116-129`). Without `DEVIN_ORG_ID`, every poll resolves the organisation again.
- **The 2 to GitHub.** `handleGet` calls `observeMerge` inside the session block (lines 103-108) and again after it (lines 116-121). When the PR is still open, the run is still `approved` after the first call, so the second call also runs.

`runOffers` adds nothing. The route passes it the PR URL it already has, and `isSynced` only reads local git.

### Rate-limit math

The GitHub budget is **5,000 requests/hour** for a personal access token. `GITHUB_TOKEN` is the engineer's own token, so everything else that token does comes out of the same budget.

`RunView` fires at most once every 2 s, which is **≤ 1,800 polls/hour** per open view. The real rate is a little lower, because the 2 s starts after each response arrives. `RefreshInFlight` fires once every 5 s, which is **720 polls/hour** per in-flight run on `/runs`.

**Scenario A: one approved run with an open PR, run view open.**

My first estimate was one `getPull` per poll: 1,800 × 1 = **1,800/hour (36% of budget)**. That is wrong, because the duplicate `observeMerge` above makes it two:

> 1,800 × 2 = **3,600 GitHub requests/hour, 72% of the budget**, from one browser tab.

**Scenario B: the same, plus `/runs` open in a second tab.**

> 3,600 + (720 × 2) = **5,040/hour. ❌ That is over the 5,000 limit.**
>
> The budget runs out after 5,000 ÷ 5,040 × 60 ≈ **59.5 minutes**.

Once the budget is gone, GitHub rejects every call from that token. `observeMerge` throws a `GitHubApiError`, `handleGet` swallows it (`.catch(() => null)`), and **the merge goes undetected until the hour's window resets**. Every other use of the token is blocked too, including **Review and approve** on other runs.

How much this matters depends on how long a PR sits in `approved`. Normally the window is short, because `approveRun` messages Devin to merge straight away. It gets long when checks re-run or the merge conflicts (`DEVIN_RUN_PROTOCOL.md` § Phases, Merge).

**Scenario C (worst case): the Devin window and `/t/automation/<id>` both show the run, and `/runs` is open.**

> (1,800 × 2 views × 2) + (720 × 2) = **8,640/hour. ❌ 173% of the budget, exhausted after ~35 minutes.**

**Recalculated with the duplicate removed** (one `observeMerge` per poll, after the session block):

| Scenario | Today | With one `observeMerge` per poll |
| --- | --- | --- |
| A | 3,600/hr (72%) | 1,800/hr (36%) ✅ |
| B | 5,040/hr (101%) ❌ | 2,520/hr (50%) ✅ |
| C | 8,640/hr (173%) ❌ | 4,320/hr (86%) ⚠️ still tight |

**Devin side.** One open view makes 1,800 session reads/hour, and 3,600/hour when `DEVIN_ORG_ID` is unset. This repo doesn't record Devin's API rate limit, so the numbers aren't checked against one here. Confirm your organisation's limit before relying on them. Setting `DEVIN_ORG_ID` halves the load for free.

Chrome throttles timers in hidden tabs, and chained timers can drop to about once a minute after a tab has been hidden for five minutes. That can cut background-tab numbers a lot, but it is browser policy, not something the console controls. Budget without it.

### Configuration

The poll cadence is a constant in code. Everything else comes from environment variables read on the server.

| Setting | Where | Default | Effect on detection |
| --- | --- | --- | --- |
| Run view interval | `run-view.tsx:243` (`setTimeout(loop, 2000)`) | 2,000 ms | PR/merge latency and request volume per open view |
| `/runs` interval | `refresh-in-flight.tsx:21` (`}, 5000)`) | 5,000 ms | Latency and volume on the list |
| Terminal statuses | `run-view.tsx:19` (`TERMINAL`) | `merged`, `stopped`, `dispatch_failed` | When a view stops polling |
| `DEVIN_API_KEY` | `.env` | unset | Required for PR detection. Without it, `pollRun` returns `unavailable` and nothing is recorded |
| `DEVIN_ORG_ID` | `.env` | resolved per request via `GET /v3/self` | Set it to halve Devin calls |
| `GITHUB_TOKEN` | `.env` | unset | Required for approval and merge detection. Without it, `observeGitHubApproval` and `observeMerge` return `unavailable` |
| `GITHUB_APPROVER_LOGIN` | `.env` | `rmtandon1` | GitHub login whose approving review `observeGitHubApproval` records as the engineer's `approve_pr` |
| `DEVIN_API_BASE` / `GITHUB_API_BASE` | `.env` | `https://api.devin.ai/v3` / `https://api.github.com` | Point at a proxy or test server |
| `RECONCILE_PAGE` | `bridge.ts:597` | 100 | Page size when **Reconcile** sweeps every approved run |

## Benefits

- ✅ **No manual step for the two events that matter.** PR opened and PR merged are both detected and written to the audit chain without a click.
- ✅ **Governed like any other write.** Detection goes through `executeIntent`, with policy preview, idempotency keys and hash-chained audit rows, and it is attributed to the requester or approver, not whoever was watching.
- ✅ **Safe under concurrency.** Two tabs that see the same event write one row, and `prNotYetRecorded` stops a later poll from replacing the PR.
- ✅ **Merge beats session-end.** GitHub is checked before `observeSessionEnd`, so a session that merges and then winds down lands as `merged`, not `stopped`.
- ✅ **Stuck runs release themselves.** A dead session writes `stop`, and the one-run-per-tool rule frees the tool.
- ✅ **No credentials in the browser.** Every Devin and GitHub call is server-side.
- ✅ **Quiet timeline.** Frames are appended only on change.

## Limitations

- ❌ **Only works while someone is watching.** There is no server-side poller. If nobody has the run view or `/runs` open, a merge is found only when someone opens one, or presses **Check merge** or **Reconcile**.
- ❌ **Duplicate `getPull` per poll** on approved runs doubles GitHub load, and with two tabs open it goes over the 5,000/hour budget (above).
- ❌ **Organisation re-resolved on every poll** when `DEVIN_ORG_ID` is unset.
- ❌ **Failures are silent.** `.catch(() => null)` keeps the view alive but hides a rate-limit or auth error. The run just stays `approved`.
- ❌ **No backoff.** Cadence is fixed whatever the status, the tab's visibility or the error rate.
- ❌ **Detection doesn't pull.** `record_merge` is automatic, but updating the local checkout still needs **Pull merged code**.
- ❌ **Status labels differ** between `/runs` ("Devin working", "Live") and the run view ("Running", "Merged").

## Future Enhancements

**Option 1: GitHub webhook for merges.**
Subscribe to `pull_request` events with `action: closed` and `merged: true`, verify the signature, look the run up with `getRunByPrUrl`, and apply `record_merge`.
- Pros: merge detected in seconds with no one watching, and zero polling cost on GitHub.
- Cons: needs a public HTTPS endpoint and a webhook secret, and the console runs on localhost today. Devin has no equivalent push for `pr_url`, so session polling stays.

**Option 2: One server-side poller per in-flight run.**
Run a single loop per in-flight run on the server (started from `instrumentation.ts`), cache the last snapshot, and have `/api/devin/<id>` return the cache instead of calling out.
- Pros: cost no longer grows with open tabs (Scenario C falls to one poller's worth), and detection works with no browser open. Adding GitHub conditional requests (`If-None-Match`) helps further, because a `304` doesn't count against the rate limit.
- Cons: long-lived process state, which is lost on restart and needs a re-scan of `IN_FLIGHT_STATUSES` at boot. It is more moving parts than a demo console needs.

**Option 3: Adaptive client polling.**
Keep the browser-driven design, but drop the duplicate `observeMerge`, poll `approved` runs every 15–30 s instead of 2 s, pause when `document.visibilityState === "hidden"`, and back off on errors.
- Pros: small, local change. Scenario C drops well under budget, and there is no new infrastructure.
- Cons: still needs a viewer, and merge latency rises to the slower interval.

## Summary

1. A manager asks Devin for a rule, and the run opens in the Devin window.
2. The window polls every 2 s and shows each phase as Devin reports it.
3. When Devin opens the PR, the console records it on its own: **PR open #N** appears, and engineers are offered **Review and approve**.
4. An engineer approves, and Devin is told to merge.
5. When GitHub reports the merge, the console records it on its own: the run turns **Merged** and polling stops.
6. The engineer presses **Pull merged code**, and the rule is live.

**Open the run and watch: the PR and the merge both record themselves. Just keep GitHub's 5,000-requests-an-hour limit in mind while a PR sits approved.**
