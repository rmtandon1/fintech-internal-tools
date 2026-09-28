# Real-Time Run Progress - Ready to Use

## Overview

The run view polls the run's Devin session every 2 seconds and renders a live checklist plus an engineering-detail timeline from the session's `structured_output`. Nothing advances on a timer: an indicator moves only when the session reports a change, and a poll that finds nothing new records nothing.

## What You'll See

1. **Header row** — operation label, a `StatusChip` for the run status, and the mode indicator (`apps/console/src/components/run-view.tsx:310-316`):

   ```
   Change  [Running]  Live · session                          [Open in Devin]
   ```

   The indicator reads `Live · session` when `mode === "live"` and `Recorded · replay.json` otherwise.

2. **Checklist glyphs** — `CheckRow` (`run-view.tsx:39-70`) draws one glyph per row:

   ```
   ✓  done     (text-emerald-400)
   ●  active   (text-amber-400)
   ○  waiting  (text-muted-foreground/60)
   ```

3. **Live-editing line** — while `phase` is `edit`, the edit row names the last entry in `files` and totals additions/deletions across all files (`run-view.tsx:108-116`):

   ```
   ●  Editing tools/kyc/src/index.ts                               +96 −1
   ```

4. **Verify line** — one mark per `verify_steps` entry: `✓` for `pass: true`, `✗` for `pass: false`, `…` for `pass: null`; the `Test` step's `before → after` counts go in the detail column (`run-view.tsx:117-129`):

   ```
   ●  Verified: Lint ✓ Typecheck ✓ Boundaries … Test …
   ```

5. **Controls**
   - **Reply box** (`Reply to Devin…` + `Send`) when `offers.reply` is true, i.e. the latest frame's `structured_output.phase_status` is `waiting_for_user` (`run-view.tsx:417-435`, `apps/console/src/lib/run-surface.ts:76`). The reply is `POST /api/devin/<runId>` with `{ "message": "…" }`.
   - **Stop run** button, which opens an inline reason form (`Tab` fills in `No longer needed.`) (`run-view.tsx:377-414`).
   - **Open in Devin** link to `https://app.devin.ai/sessions/<id>` (`run-view.tsx:318-328`); the URL is built server-side only in live mode (`apps/console/src/lib/devin-route.ts:131-134`).

   ```
   [PR #64]  [Stop run]
   Reply to Devin…                                              [Send]
   ```

6. **Engineering-detail timeline** — one row per recorded frame, newest first: `+mm:ss`, the frame's `phase`, then the session `status_detail` (or `status` when there is none) (`run-view.tsx:190-205`; `elapsed()` at `run-view.tsx:154-158`). Times are relative to the first recorded frame (`run-view.tsx:163`):

   ```
   +01:12  verify        <status_detail>
   +00:47  edit          <status_detail>
   +00:03  baseline      <status_detail>
   +00:00  intake        <status_detail>
   ```

## How It Works

```
Browser: RunView setTimeout loop (2000 ms)
        │
        ▼
GET /api/devin/<runId>                     apps/console/src/app/api/devin/[runId]/route.ts
        │
        ▼
handleGet(runId, actor, bridgeDeps())      apps/console/src/lib/devin-route.ts:82
        │   (only when the run has a session and is dispatched / running / approved)
        ▼
observeRun(requester, run, deps)           tools/automation/src/bridge.ts:369
        │
        ▼
pollRun(run, deps)                         tools/automation/src/bridge.ts:274
        │
        ▼
Devin GET /v3/organizations/{org}/sessions/{id}
        │
        ▼
StructuredOutput.safeParse(structured_output)
        │
        ▼
append a replay frame only if status, status_detail or structured_output changed
        │
        ▼
readReplay → RunViewPayload { mode, run, frames, latest, sessionUrl, offers, … }
        │
        ▼
React setPayload → Checklist + Detail (timeline) re-render
```

After the poll, `handleGet` also runs `observeMerge` for approved runs and `observeSessionEnd` for runs still in flight (`devin-route.ts:103-121`).

### From `structured_output` to the UI

| Incoming field | UI effect | Code |
| --- | --- | --- |
| `phase` / `phase_status` | Row state: rows before `phase` are `✓`, the `phase` row is `●` (or `✓` when `phase_status` is `done`), later rows are `○` | `run-view.tsx:76-84` |
| `reuses` | One `✓ Reusing <module basename>` row per entry | `run-view.tsx:105-107` |
| `files` (last entry) | `Editing <path>` label during `edit`; `+N −M` totals across all files | `run-view.tsx:108-116` |
| `verify_steps` | `Verified: …` marks; `Test` step drives `<n> tests` on the baseline row and `before → after` on the verify row | `run-view.tsx:91-99`, `117-129` |
| `pr_url` | `✓ PR open #<n>` row, `PR #<n>` link, and a one-time `record_pr` intent on the run | `run-view.tsx:130-134`, `bridge.ts:369-385` |
| `phase_status = waiting_for_user` | Reply box offered | `run-surface.ts:76` |
| session `stopped` / `expired`, or `phase_status = stopped` | `observeSessionEnd` lands a governed `stop` with reason `Devin session <status>[: <detail>]` | `bridge.ts:324-352` |

### Indicator states

```
✓  Read the evidence                                     base 1a67f60
✓  Confirmed the base                                        68 tests
✓  Planned 2 files                                                96s
✓  Reusing execute-intent.ts            packages/engine/src/execute-intent.ts
●  Editing tools/kyc/src/index.ts                             +96 −1
○  Verified
○  PR open
○  Approved by an engineer
○  Merged
```

## What's Configured

1. **Poll loop** — `apps/console/src/components/run-view.tsx:232-250`. `setTimeout(loop, 2000)` at line 243; the next poll is scheduled only after the previous one returns, and the loop ends once `run.status` is in `TERMINAL` (`merged`, `stopped`, `dispatch_failed`, line 19).
2. **Route** — `apps/console/src/app/api/devin/[runId]/route.ts`. `GET` calls `handleGet`, `POST` calls `handlePost` (replies). Devin and GitHub credentials stay on the server.
3. **Observation pipeline** — `apps/console/src/lib/devin-route.ts:82-149` (`handleGet`): role check, run lookup, `observeRun` → `observeMerge` → `observeSessionEnd`, then `readReplay` and the `RunViewPayload`.
4. **Session poll and change detection** — `tools/automation/src/bridge.ts:274-317` (`pollRun`). Frames are compared on `status`, `status_detail` and the serialised `structured_output` at lines 295-299 and written only when different (lines 300-310).
5. **Checklist projection helpers** — `apps/console/src/lib/run-checklist.ts:26-135`: `runChecklist` projects `structured_output` into field-backed lines; `phaseLine` produces the `<phase> · <status>` sentence the run summary card shows (`run-view.tsx:305`). The run view's own checklist rows are built by `Checklist` in `run-view.tsx:74-151`.
6. **Phase order** — `tools/automation/src/phases.ts:6` (`PHASES`): `intake, baseline, plan, edit, verify, pull_request, merge`.
7. **Mode** — `apps/console/src/lib/devin-status.ts:32-34` (`devinMode`): `live` when `DEVIN_API_KEY` is set, otherwise `simulation`.

## Testing It

1. Set up the database if you haven't:

   ```bash
   pnpm db:setup
   ```

2. Put `DEVIN_API_KEY` in the root `.env` (see `.env.example:6`) and start the console:

   ```bash
   pnpm dev          # serves http://localhost:3001 (package.json:6)
   ```

3. Confirm live mode:

   ```bash
   curl -s http://localhost:3001/api/devin/status
   # {"github":false,"configured":true,"mode":"live","orgId":"org-…","orgSource":"key","principal":"…","error":null}
   ```

4. Open an existing run at `/t/automation/<runId>`, or dispatch one from a record page with **Send to Devin** in the handoff panel.
5. In DevTools → Network, filter on `/api/devin/`. Expect a request roughly every 2 seconds:

   ```
   GET /api/devin/01K5Z3Q8…   200   fetch   run-view.tsx
   ```

   Each response is a `RunViewPayload`; `frames` grows only when the session reported something new:

   ```json
   {
     "mode": "live",
     "run": { "id": "01K5Z3Q8…", "status": "running", "prUrl": null, "…": "…" },
     "latest": {
       "at_ms": 1790000047000,
       "status": "running",
       "status_detail": null,
       "structured_output": {
         "phase": "edit",
         "phase_status": "running",
         "files": [
           { "path": "tools/kyc/src/index.ts", "op": "modify", "additions": 12, "deletions": 1, "reason": "linked_refund_hold on approve" }
         ],
         "verify_steps": [],
         "pr_url": null
       }
     },
     "frames": ["…"],
     "sessionUrl": "https://app.devin.ai/sessions/…"
   }
   ```

   (`structured_output` abbreviated; the full shape is in `DEVIN_RUN_PROTOCOL.md` § Progress.)

6. Watch the checklist rows flip `○ → ● → ✓` as the session reports each phase.
7. Server-side, the recording is `apps/console/data/replays/<runId>.json` (`apps/console/src/lib/bridge.ts:87`), rewritten only when a poll sees a change (`bridge.ts:300-310`).

## Expected Behavior

### Scenario 1 — ideal, incremental

The session updates `structured_output` at each phase boundary and as sub-events complete:

```
+00:00  intake     ● Read the evidence
+00:03  baseline   ✓ Read the evidence · ● Confirmed the base
+01:39  plan       ● Planned 2 files · ✓ Reusing … rows appear
+02:10  edit       ● Editing tools/refunds/src/clustering-hold.ts  +84 −0
+05:20  edit       ● Editing tools/kyc/src/index.ts                +96 −1
+06:05  verify     ● Verified: Lint ✓ Typecheck ✓ Boundaries ✓ Test …
+07:40  verify     ✓ Verified: Lint ✓ Typecheck ✓ Boundaries ✓ Test ✓   68 → 76
+07:55  pull_request  ✓ PR open #64
```

### Scenario 2 — fallback, batched

The session reports `structured_output` late. Until the first valid snapshot lands, `out` is `null` and every structured-output row stays `○`; the timeline is empty. When the snapshot arrives, several rows flip at once (everything before the reported `phase` becomes `✓`) and the timeline starts from that frame. This is still correct: rows reflect reported fields, never timers (`DEVIN_RUN_PROTOCOL.md:183`: "They only ever reflect what the session has reported: no advancing a phase on a timeout.").

## Troubleshooting

| Issue | Check | Likely cause | Solution |
| --- | --- | --- | --- |
| Stuck on `Loading run…` | Network tab for `/api/devin/<runId>` returning 404 or 403 | Payload is null or for another run (`run-view.tsx:292-294`); unknown run id (404) or the actor's role isn't in `AUTOMATION_ROLES` (`forbidden()`, `devin-route.ts:78-80`) | Use a valid run id; switch to a role that may view automation runs |
| "Devin not connected" / simulation mode | `curl http://localhost:3001/api/devin/status` → `"mode":"simulation"` | No `DEVIN_API_KEY` (`devin-status.ts:32-34`) | Add `DEVIN_API_KEY` to the root `.env` and restart `pnpm dev` |
| Checklist frozen | Latest frame in `<runId>.json`; session in Devin | The session hasn't reported `structured_output` → `no_output`, no frame (`bridge.ts:278-280`); or it reported the same snapshot again, which adds no frame by design (`bridge.ts:295-300`) | Wait for the next phase boundary; open the session with **Open in Devin** |
| Checklist frozen, session is reporting | Compare the session's `structured_output` with `StructuredOutput` in `tools/automation/src/run-files.ts` | Schema mismatch → `invalid_output` (`bridge.ts:281-288`); no frame is recorded and the run view shows nothing new | Fix the session's output to match the schema |
| Polling continues after the run seems done | `run.status` in the payload | Status isn't in `TERMINAL` (`run-view.tsx:19`); e.g. `approved` keeps polling until the merge is observed | Expected until `merged`, `stopped` or `dispatch_failed` |

## Configuration

| Setting | Value | Location |
| --- | --- | --- |
| Poll interval | `2000` ms | `apps/console/src/components/run-view.tsx:243` |
| Terminal statuses | `merged`, `stopped`, `dispatch_failed` | `apps/console/src/components/run-view.tsx:19` |
| Status-check cache | `TTL_MS = 60_000`, `FAILURE_TTL_MS = 15_000` | `apps/console/src/lib/devin-status.ts:36-38` |
| Dev port | `3001` | `package.json:6` |
| Phase order | `intake, baseline, plan, edit, verify, pull_request, merge` | `apps/console/src/components/run-view.tsx:72`, `tools/automation/src/phases.ts:6` |

## Benefits

- ✅ Progress is evidence-backed, not spinner-based: every row is read from a reported field.
- ✅ The replay file doubles as an audit trail of what the session reported and when.
- ✅ Dedupe keeps the timeline meaningful: it shows changes, not poll cadence.
- ✅ Graceful fallback when output is batched: late snapshots back-fill the checklist in one step.
- ✅ Live vs recorded mode is explicit in the header.

## Summary

With `DEVIN_API_KEY` set and `pnpm dev` running, every in-flight run live-updates. Open `/runs` or `/t/automation/<id>` and watch.
