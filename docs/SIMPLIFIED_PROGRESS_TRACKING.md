# Simplified Progress Tracking

## Overview

Each run-checklist line is a direct projection of one field of the Devin session's `structured_output`, taken only after that output has passed `StructuredOutput` validation. No line is inferred from message text, a timer, or the phase alone.

## How It Works

1. **Schema at creation.** `dispatchRun` creates the session with `structuredOutputSchema: STRUCTURED_OUTPUT_JSON_SCHEMA` (`tools/automation/src/bridge.ts:221-246`). That JSON Schema is generated from the zod `StructuredOutput` (`tools/automation/src/run-files.ts:112-152`), and the HTTP client sends it with `structured_output_required: true` (`tools/automation/src/devin-api.ts:158-159`).
2. **Devin reports.** The playbook (`.devin/run-protocol.playbook.md` § Structured output) tells Devin to send the whole object on every update, at phase boundaries and after each sub-event.
3. **Poll and validate.** `pollRun` reads `status`, `status_detail` and `structured_output` from the session. It runs `StructuredOutput.safeParse`, keeps an unchanged snapshot out of the replay file, and returns a `PollOutcome` (`tools/automation/src/bridge.ts:274-317`).
4. **Project.** `runChecklist(out)` maps the validated object to `ChecklistLine[]`, one line per populated field (`apps/console/src/lib/run-checklist.ts:26-130`). `CHECKLIST_GLYPH` renders the states as `✓ done`, `● running`, `○ waiting` and `✗ failed` (`apps/console/src/lib/checklist-glyph.ts`).

### Field → line table

Lines appear in this order. The *State* column uses `phaseState(p)`: `done` if `p` comes before `out.phase` in `PHASES`, `waiting` if it comes after, and at the current phase `done` when `phase_status === "done"`, otherwise `running`.

| Step # | Label | Triggering field(s) and values | State |
| --- | --- | --- | --- |
| 1 | `Read the codebase` (detail `base <7 chars>`) | `base_commit` is non-null | `phaseState("intake")` |
| 2 | `Existing tests pass` / `Existing tests fail` (detail `<before> tests`) | `verify_steps` has an entry with `name === "tests"` and a defined `before` | `failed` when `pass === false` and `after` is undefined; otherwise `phaseState("baseline")` |
| 3 | `Reused <module>` (detail = reason), one per entry | each element of `reuses[]` | `phaseState("plan")` |
| 4 | `Resolved a clash in <file>` (detail `kept <kept>`), one per entry (undo only) | each element of `conflicts[]` | `phaseState("edit")` |
| 5 | `Adding` / `Editing` / `Removing <path>` (detail `+a −d`), one per entry | each element of `files[]`; `op` = `create` / `modify` / `delete` | last entry: `phaseState("edit")`; earlier entries: `done` |
| 6 | `Safety checks` / `Safety check failed: <names>` (detail = guard names) | `guards.length > 0` | `failed` if any `pass === false`, else `running` if any `pass === null`, else `done` |
| 7 | `Tests` / `Tests failed` (detail `<before> → <after>` or `<before> → …`) | the `verify_steps` entry `name === "tests"` has `after !== undefined` | `failed` if `pass === false`; `running` if `after === null` or `pass === null`; otherwise `done` |
| 8 | `Sent for review` (detail `owner/repo/pull/N`) | `pr_url` is non-null | `running` when `phase === "pull_request"` and `phase_status === "waiting_for_user"`; otherwise `done` |
| 9 | `Live` (detail `<merge_commit 7 chars>`) | `merge_commit` is non-null | `done` |
| 10 | `Stopped by <stopped_by>` | `stopped_by` is non-null | `done` |

`phaseLine(out)` supplies the header, e.g. `Testing the change · in progress`, from `PHASE_LABELS[out.phase]` and `PHASE_STATUS_LABELS[out.phase_status]` (`apps/console/src/lib/run-checklist.ts:133-135`, `apps/console/src/lib/run-phases.ts`).

### Contract excerpt (`.devin/run-protocol.playbook.md` § Structured output)

```text
Use the `StructuredOutput` schema in `tools/automation/src/run-files.ts` for **every** update,
including initial and stopped states. Set `phase` to intake, baseline, plan, edit, verify,
pull_request, or merge; set `phase_status` to running, done, stopped, or waiting_for_user.
Populate `phase_durations_s` with elapsed seconds at each phase boundary. At Plan, copy `reuses`
from the committed plan and set `base_commit`, `context_sha256`, `branch`, and `plan_commit`.
During Edit append/update `files` after each edit. During Verify append results to
`verify_steps` and `guards` as each check completes. For an undo populate `conflicts` during
resolution. Set `pr_url` after opening the PR, `merge_commit` after squash merge, and
`stopped_by` with the reason when stopped. Supply nulls or empty arrays for fields without
results yet; retain prior artifacts on later updates. Update at phase boundaries and after each
edit or completed sub-event, never on a timer.
```

The same fields as a template: the initial state, with every artifact still a placeholder.

```json
{
  "phase": "intake",
  "phase_status": "running",
  "phase_durations_s": {},
  "base_commit": null,
  "context_sha256": null,
  "branch": null,
  "plan_commit": null,
  "reuses": [],
  "files": [],
  "verify_steps": [],
  "guards": [],
  "conflicts": [],
  "pr_url": null,
  "merge_commit": null,
  "stopped_by": null
}
```

`docs/DEVIN_RUN_PROTOCOL.md` § Progress has a filled mid-verify example and states the UI rule: "They only ever reflect what the session has reported: no advancing a phase on a timeout."

### Parsing: `tools/automation/src/bridge.ts:274-317`

```ts
export async function pollRun(run: DevinRun, deps: BridgeDeps): Promise<PollOutcome> {
  if (!deps.devin) return { kind: "unavailable", reason: "Devin API is not configured" };
  if (!run.sessionId) return { kind: "unavailable", reason: "The run has no session" };
  const snapshot = await deps.devin.getSession(run.sessionId);
  if (snapshot.structuredOutput === null || snapshot.structuredOutput === undefined) {
    return { kind: "no_output", status: snapshot.status, statusDetail: snapshot.statusDetail };
  }
  const parsed = StructuredOutput.safeParse(snapshot.structuredOutput);
  if (!parsed.success) {
    return {
      kind: "invalid_output",
      status: snapshot.status,
      issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  }
  // ...append a ReplayFrame only when status, status_detail or structured_output changed...
  return { kind: "output", structuredOutput: parsed.data, status: snapshot.status, statusDetail: snapshot.statusDetail };
}
```

Only `kind: "output"` carries a `StructuredOutput`. An `invalid_output` produces no frame and no checklist change. `pollAutomationRun` shows it as the toast "Devin's progress report couldn't be read" and puts the zod issues in the detail (`apps/console/src/app/automation-actions.ts:95-125`).

### Projection: `apps/console/src/lib/run-checklist.ts:26-130`

```ts
export function runChecklist(out: Output | null): ChecklistLine[] {
  if (!out) return [];
  // phaseState(phase): index < current → "done"; > current → "waiting";
  //                    == current → phase_status === "done" ? "done" : "running"
  if (out.base_commit) lines.push({ field: "base_commit", state: phaseState("intake"), label: "Read the codebase", ... });
  const tests = out.verify_steps.find((s) => s.name === "tests");
  if (tests && tests.before !== undefined) lines.push({ field: "verify_steps", label: "Existing tests pass" | "Existing tests fail", ... });
  for (const reuse of out.reuses)       lines.push({ field: "reuses", state: phaseState("plan"), ... });
  for (const conflict of out.conflicts) lines.push({ field: "conflicts", state: phaseState("edit"), ... });
  out.files.forEach((file, i) =>        lines.push({ field: "files", state: last ? phaseState("edit") : "done", ... }));
  if (out.guards.length > 0)            lines.push({ field: "guards", state: failed | running | done, ... });
  if (tests && tests.after !== undefined) lines.push({ field: "verify_steps", label: "Tests" | "Tests failed", ... });
  if (out.pr_url)       lines.push({ field: "pr_url", label: "Sent for review", ... });
  if (out.merge_commit) lines.push({ field: "merge_commit", state: "done", label: "Live", ... });
  if (out.stopped_by)   lines.push({ field: "stopped_by", state: "done", label: `Stopped by ${out.stopped_by}` });
  return lines;
}
```

Every `ChecklistLine` records the `field` it came from (`field: keyof Output`), so a line always points to a real schema field.

### Where `runChecklist` stands today

- `runChecklist` is exported and covered by `apps/console/tests/tools/run-checklist.test.ts`. The mounted run view imports only `phaseLine` from it.
- The checklist rendered on screen is the local `Checklist` component in `apps/console/src/components/run-view.tsx:72-151`. It reads the same validated `latest.structured_output`, with these differences:
  - it always renders one row per phase, with states taken from `phase` and `phase_status`;
  - its Baseline and Verify details read the step named `Test`;
  - its PR, approval and merge rows also read `devin_runs` (`run.prUrl`, `run.approvedBy`, `run.status`, `run.mergeCommit`).
- `runChecklist` looks up a `verify_steps` entry named `"tests"`. The playbook's gate names, `CI_CHECKS` (`Lint`, `Typecheck`, `Boundaries`, `Test`) and the replay frames all use `"Test"`, so steps 2 and 7 never appear for those frames.

This document describes the field-level projection in `runChecklist` and records these gaps as they stand. It does not change them.

## Benefits

### Before Simplification

These are the problems a free-form message parser would have had. The implemented system never had such a parser.

- **Fuzzy keyword matching.** Advancing on phrases such as "running tests" or "opened PR" depends on how Devin words a message. Rewording, a typo, or a quoted log line would move the checklist or leave it stuck.
- **Ambiguity.** "Tests pass" could mean the baseline or the post-edit run. "Merged" could mean a merged PR, a merged base branch, or a merge conflict. A parser would have to guess which step a sentence belongs to.
- **Premature advancement.** A parser tends to advance on intent ("I'll now open the PR") or fall back to timers. Either way a step shows as done before the artifact exists.
- **No artifacts.** A phrase carries no commit hash, file list, diff counts or test counts, so the UI could only show counts or spinners.
- **No validation.** A malformed or partial message cannot be rejected. It is either matched or ignored, and nothing tells the operator.

### After Simplification

- **Validated input only.** Every snapshot goes through `StructuredOutput.safeParse` (`.strict()` objects, enums, commit and SHA-256 regexes, a URL check, non-negative integers). An invalid snapshot is reported as `invalid_output` with the zod issues and never reaches the checklist.
- **Enforced at the source.** The session is created with the same schema and `structured_output_required: true`, so Devin and the console share one source of truth (`run-files.ts`).
- **One field per line.** Each line has a `field: keyof StructuredOutput`. If a field is null or an empty array, its line is not rendered.
- **Artifacts, not phrases.** The lines show the base commit, reused modules, each file with `+additions −deletions`, guard names, test counts, the PR path and the merge commit.
- **Deterministic state.** The same object always produces the same lines and glyphs, because `runChecklist` is a pure function of its input.
- **Replayable.** `pollRun` stores each changed, validated snapshot as a `ReplayFrame`, so the timeline can be reproduced exactly and repeated polls add nothing.

## Example Flow

This is the change-operation script from `scriptedFrames` in `apps/console/tests/helpers/scripted-clients.ts`, which is also what `replayDevinClient` serves in simulation mode. The last row is `mergedFrame`, which the replay client returns once the run is `approved` or `merged`. The glyph sequences came from calling `runChecklist` on each frame in a throwaway vitest script that was not committed. Base commit `1a67f60`, run id `01RUN`.

| Time | Session `status` / `status_detail` | Structured-output change | Rendered sequence (`runChecklist`) |
| --- | --- | --- | --- |
| +0s | `running` / `Reading spec and context` | `phase: intake`, `phase_status: running`; `base_commit`, `context_sha256`, `branch` set | `●` Read the codebase |
| +2s | `running` / `Baseline verify at the base commit` | `phase: baseline`; `phase_durations_s.intake = 2` | `✓` Read the codebase |
| +6s | `running` / `Writing the plan` | `phase: plan`; `phase_durations_s.baseline = 4` | `✓` Read the codebase (no plan artifacts reported yet, so no new line) |
| +12s | `running` / `Editing tools/refunds/src/clustering-hold.ts` | `phase: edit`; `plan_commit` set; `reuses[3]`; `files[6]` listed at `+0 −0` | `✓` Read · `✓✓✓` Reused ×3 · `✓✓✓✓✓` Adding/Editing ×5 · `●` Adding runs/01RUN/context.json |
| +26s | `running` / `Running pnpm verify` | `phase: verify`; `files` carry real counts; `verify_steps` = `Lint`, `Typecheck`, `Boundaries`, `Test` all `pass: null` (`Test.before = 68`, `after: null`) | `✓` × 10 (the last file becomes `✓` because the edit phase is over) |
| +28s / +32s / +36s | `running` / `pnpm verify: Lint green` … `Boundaries green` | `verify_steps[i].pass` flips to `true` one at a time | unchanged: 10 × `✓` (the step is named `Test`, not `tests`, so no Tests line) |
| +40s | `running` / `Opening the pull request` | `phase: pull_request`; `Test: pass true, 68 → 76` | unchanged: 10 × `✓` |
| +44s | `blocked` / `blocked_on_approval` | `phase_status: done`; `pr_url: …/pull/990` | 10 × `✓` + `✓` Sent for review |
| after `approve_pr` | `finished` / `merged` | `phase: merge`, `phase_status: done`; `merge_commit` set | 11 × `✓` + `✓` Live |

In this script `guards` stays `[]` throughout, so the "Safety checks" line never appears. That is expected: only reported fields render.

### Example console / poll output

Checklist dump for the +12s and +44s frames, from the same throwaway script (`CHECKLIST_GLYPH[state] [field] label · detail`):

```text
+12000ms status=running detail=Editing tools/refunds/src/clustering-hold.ts | Making the change · in progress
  ✓ [base_commit] Read the codebase · base 1a67f60
  ✓ [reuses] Reused packages/engine/src/execute-intent.ts · the hold is registered as a policy rule, not a side path
  ✓ [reuses] Reused packages/engine/src/approvals.ts · held refunds go to the existing manager tier
  ✓ [reuses] Reused packages/engine/src/audit · every hold decision is an audit row
  ✓ [files] Adding tools/refunds/src/clustering-hold.ts · +0 −0
  ✓ [files] Editing tools/refunds/src/index.ts · +0 −0
  ✓ [files] Editing tools/kyc/src/index.ts · +0 −0
  ✓ [files] Adding apps/console/tests/tools/refunds-clustering-hold.test.ts · +0 −0
  ✓ [files] Editing apps/console/tests/tools/kyc.test.ts · +0 −0
  ● [files] Adding runs/01RUN/context.json · +0 −0

+44000ms status=blocked detail=blocked_on_approval | Ready for review · done
  ✓ [base_commit] Read the codebase · base 1a67f60
  ... (reuses and files as above, with real +/− counts)
  ✓ [pr_url] Sent for review · rmtandon1/buy-v-build-cog-demo/pull/990
```

A `pollAutomationRun` toast for the +26s frame (title / detail):

```text
Devin: running
verify · running
```

The `ReplayFrame` that `pollRun` appends to `apps/console/data/replays/<run_id>.json` when the snapshot changes (abridged):

```json
{
  "at_ms": 1790600210000,
  "status": "blocked",
  "status_detail": "blocked_on_approval",
  "structured_output": { "phase": "pull_request", "phase_status": "done", "pr_url": "https://github.com/rmtandon1/buy-v-build-cog-demo/pull/990", "...": "..." }
}
```

A malformed snapshot, `{ "phase": "nonsense" }`, is rejected before any frame is written. The toast is "Devin's progress report couldn't be read" and its detail starts with:

```text
phase: Invalid option: expected one of "intake"|"baseline"|"plan"|"edit"|"verify"|"pull_request"|"merge"; phase_status: Invalid option: expected one of "running"|"done"|"stopped"|"waiting_for_user"; phase_durations_s: Invalid input: expected record, received undefined; ...
```

## Important Notes

1. **Valid enum values.**
   - `phase`: `intake`, `baseline`, `plan`, `edit`, `verify`, `pull_request`, `merge` (`PHASES` in `tools/automation/src/phases.ts`).
   - `phase_status`: `running`, `done`, `stopped`, `waiting_for_user`.
   - `files[].op`: `create`, `modify`, `delete`.
   - Keys of `phase_durations_s` must be phase names; values are non-negative numbers.
2. **Required fields.** Every top-level key is required on every update except `merge_commit`, which is optional and nullable. Within `verify_steps[]`, `before` and `after` are optional (`after` is nullable). Every object is `.strict()`, so unknown keys such as `"note"` fail validation.
3. **Format rules.**
   - `base_commit`, `plan_commit` and `merge_commit` are 7–40 lowercase hex characters.
   - `context_sha256` is exactly 64 lowercase hex characters.
   - `pr_url` must be a URL.
   - `additions` and `deletions` are non-negative integers.
   - `reuses[].module`, `reuses[].reason`, `files[].path` and `files[].reason` are non-empty strings.
4. **Null and empty-array placeholders.** A field with no result yet is `null` (scalars) or `[]` (lists), never omitted. A placeholder renders no line.
5. **Retain prior artifacts.** The checklist reads only the latest valid snapshot. If a later update drops `reuses` or `files`, their lines disappear. `pr_url` is the one exception: `observeRun` records it once on the run through `record_pr` (`tools/automation/src/bridge.ts:369-385`).
6. **Phase ordering.** Phases move forward in `PHASES` order, and `phaseState` compares indices into that order. The schema checks the enum but not monotonic order. Going backwards would move earlier lines to `●` or `○`, so ordering is a playbook obligation, not something the parser enforces.
7. **Artifact fields that unlock rows.**
   - `base_commit` → row 1
   - the `verify_steps` entry named `tests` with `before` → row 2, and with `after` → row 7
   - `reuses[]` → row 3
   - `conflicts[]` → row 4
   - `files[]` → row 5
   - `guards[]` → row 6
   - `pr_url` → row 8
   - `merge_commit` → row 9
   - `stopped_by` → row 10

   `context_sha256`, `branch`, `plan_commit` and `phase_durations_s` are validated but produce no `runChecklist` line.
8. **Terminal fields.**
   - `merge_commit` is set only after the squash merge actually succeeds and always renders `✓ Live`.
   - `stopped_by` carries the reason and renders `✓ Stopped by <reason>`.
   - `phase_status: "stopped"`, or a session `status` of `stopped` or `expired`, makes `observeSessionEnd` record the governed `stop` intent (`tools/automation/src/bridge.ts:324-352`).
   - A session that is only `blocked` is not stopped.
9. **Step names matter.** Rows 2 and 7 look for the exact `verify_steps[].name` `"tests"`. Gate results reported as `Lint` / `Typecheck` / `Boundaries` / `Test` (the `CI_CHECKS` names) validate fine but do not produce those rows (see "Where `runChecklist` stands today").
10. **Valid vs. invalid examples.**

    Valid (a minimal Plan-phase update):

    ```json
    {
      "phase": "plan", "phase_status": "done", "phase_durations_s": { "intake": 41, "baseline": 212 },
      "base_commit": "1a67f60", "context_sha256": "9f2c41ab9f2c41ab9f2c41ab9f2c41ab9f2c41ab9f2c41ab9f2c41ab9f2c41ab",
      "branch": "devin/01K5Z3Q8-clustering-hold", "plan_commit": "c7d19e2",
      "reuses": [{ "module": "packages/engine/src/approvals.ts", "reason": "held refunds go to the existing manager tier" }],
      "files": [], "verify_steps": [], "guards": [], "conflicts": [],
      "pr_url": null, "merge_commit": null, "stopped_by": null
    }
    ```

    Invalid, with the zod issue each one produces:

    | Payload | Issue |
    | --- | --- |
    | `"Now running tests..."` (free text) | `: Invalid input: expected object, received string` |
    | `{ "phase": "edit", "phase_status": "running" }` | `phase_durations_s: Invalid input: expected record, received undefined; base_commit: …` (every missing required field is listed) |
    | `{ ..., "phase": "testing" }` | `phase: Invalid option: expected one of "intake"\|…\|"merge"` |
    | `{ ..., "base_commit": "HEAD" }` | `base_commit: git commit` |
    | `{ ..., "note": "x" }` | `: Unrecognized key: "note"` |

## Testing

1. **No output, no lines.** `run-checklist.test.ts` › "renders no line without a session output or with every field empty": `runChecklist(null)` and an all-placeholder output both return `[]`.
2. **Field-gated lines.** › "adds a line only when its source field is present": `base_commit` alone gives `["base_commit"]`, and adding `files` and `pr_url` gives `["base_commit", "files", "pr_url"]`.
3. **Current edit.** › "lists every changed file, with the last one as the current edit": earlier files are `done` and the last one is `running` during `edit`.
4. **Glyphs and failure.** › "uses ✓ ● ○ for done, running and waiting, and ✗ for a failed check": pins `CHECKLIST_GLYPH` and the `failed` state for `guards` and post-edit `verify_steps`.
5. **Lines name real fields.** › "names only fields that exist on the structured output": every `line.field` is a key of `StructuredOutput`.
6. **Validated poll.** `apps/console/tests/tools/automation-bridge.test.ts` › `pollRun`:
   - "returns the validated structured output and leaves devin_runs and runs/ untouched"
   - "rejects malformed structured output" (`{ phase: "nonsense" }` → `invalid_output`)
   - "reports a session without structured output yet" (`no_output`)
   - "reports an unconfigured Devin API without touching the session"
7. **Change-only recording.** › "records a frame only when the snapshot changes": three identical polls write one frame, and a changed `phase` writes a second.
8. **Schema at creation.** › "Devin client uploads the attachment, then creates the session with the schema": the request body carries `structured_output_schema` and `structured_output_required: true`.
9. **PR recorded once.** › "records the reported pull request once, then keeps it through a poll that omits it" and "records nothing while the session reports no pull request".
10. **Replay pacing and terminal handling.** `apps/console/tests/api/devin-route.test.ts`:
    - "reports simulation mode and advances frames with the clock" (`scriptedFrames` from `intake` to `pull_request` with `pr_url …/pull/990`)
    - "lands the governed stop when the session has ended, exactly once"
    - "does not stop a run whose session is merely blocked"

Run them with:

```sh
pnpm --filter @console/app exec vitest run tests/tools/run-checklist.test.ts tests/tools/automation-bridge.test.ts tests/api/devin-route.test.ts
```

## Files Modified

This task only adds this document, `docs/SIMPLIFIED_PROGRESS_TRACKING.md`. No runtime code, tests or schemas were changed.

The mechanism it describes is defined in these files:

| File | Lines | Role |
| --- | --- | --- |
| `tools/automation/src/run-files.ts` | 112-152 | `StructuredOutput` zod schema and `STRUCTURED_OUTPUT_JSON_SCHEMA` |
| `tools/automation/src/run-files.ts` | 154-165 | `ReplayFrame` / `ReplayFile` |
| `tools/automation/src/phases.ts` | 6 | `PHASES` order |
| `tools/automation/src/bridge.ts` | 221-246 | session creation with `structuredOutputSchema` |
| `tools/automation/src/bridge.ts` | 264-317 | `PollOutcome` and `pollRun` (validate, record changed frames) |
| `tools/automation/src/bridge.ts` | 324-352 | `observeSessionEnd` (stop on `phase_status: stopped` or an ended session) |
| `tools/automation/src/bridge.ts` | 369-385 | `observeRun` (records `pr_url` once through `record_pr`) |
| `tools/automation/src/devin-api.ts` | 150-182 | `structured_output_schema` / `structured_output_required` on create; `structured_output` read on get |
| `apps/console/src/lib/run-checklist.ts` | 26-130 | `runChecklist` field → line projection |
| `apps/console/src/lib/run-checklist.ts` | 133-135 | `phaseLine` |
| `apps/console/src/lib/checklist-glyph.ts` | 1-12 | `ChecklistState` and `CHECKLIST_GLYPH` |
| `apps/console/src/lib/run-phases.ts` | — | `PHASE_LABELS`, `PHASE_STATUS_LABELS` |
| `apps/console/src/components/run-view.tsx` | 72-151 | the checklist the run view currently mounts |
| `apps/console/src/app/automation-actions.ts` | 95-125 | `pollAutomationRun` toast per `PollOutcome` kind |
| `.devin/run-protocol.playbook.md` | 23-24 | § Structured output contract |
| `docs/DEVIN_RUN_PROTOCOL.md` | 143-183 | § Progress |

## Summary

- Progress tracking is a pure, predictable projection. Devin reports one schema-validated `structured_output` object, and the console turns it into checklist lines field by field, with no phrase matching.
- The schema is handed to the session at creation, enforced with `structured_output_required`, and checked again on every poll. Anything invalid is surfaced as `invalid_output` and ignored for display.
- No timer, timeout or force-advance exists anywhere in the path. Frames are recorded only when the snapshot changes, and Devin is told to update "never on a timer".
- Every displayed state is backed by a reported structured field, and every `ChecklistLine` names that field. If Devin has not reported a field, the checklist shows no line for it.
