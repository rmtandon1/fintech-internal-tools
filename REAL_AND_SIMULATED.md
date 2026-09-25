# Real and Simulated

## Summary

- One diagram says which parts of the demo run for real, which are replayed, and which stand in for an external system. It uses the five layers the Build notes use for Power Apps, so it also shows what replaces each part of the licence.
- Real: the UI, the governed write path, role checks, the audit chain, and rule changes as Devin pull requests on GitHub.
- Stand-ins: the payment processor, sanctions and document checks, and sign-in. Each is a named seam where a real integration would plug in.
- Not built yet: starting and watching a Devin run from the console. Once built, it runs live or plays a labelled replay.
- Only a recorded or live run appears on camera. The replay player is the only simulation.

## Why one diagram

A viewer of this demo will ask which parts run and which stand in. Tagging each layer with where its state lives answers that without a disclaimer. Without this file, the answer is spread across four specs: `DEVIN_RUN_PROTOCOL.md` › Live and replay, `AGENT_TRIGGER_SURFACE.md` state diagram 4, `OPERATOR_CONSOLE_LAYOUT.md` and `QUEUE_STATS_STRIP.md`. Simulation is fine where it earns its place, but the repo should stay the size of the argument.

## The layers

```
POWER APPS          THIS CONSOLE                                         STATUS
┌─────────────────┬────────────────────────────────────────────────┬──────────────────────┐
│ Application UI  │ tool declarations render lists, forms,         │ REAL                 │
│                 │ action panels, policy traces                   │                      │
├─────────────────┼────────────────────────────────────────────────┼──────────────────────┤
│ Workflows       │ executeIntent: validate → idempotency →        │ REAL, narrower:      │
│                 │ policy → approval → effect → audit             │ approvals only       │
├─────────────────┼────────────────────────────────────────────────┼──────────────────────┤
│ Connectors      │ none. Processor, sanctions and document        │ STAND-IN             │
│                 │ checks are seeded fields or operator entries   │                      │
├─────────────────┼────────────────────────────────────────────────┼──────────────────────┤
│ Identity /      │ role checks inside the engine                  │ REAL                 │
│ permissions     │ who you are: the header role switcher          │ STAND-IN             │
├─────────────────┼────────────────────────────────────────────────┼──────────────────────┤
│ Governance /    │ hash-chained audit, maker-checker, PII masking │ REAL                 │
│ data / ALM      │ rule change as Devin PR → CI → engineer → merge│ REAL on GitHub       │
│                 │ run started and watched from the console       │ NOT BUILT; LIVE or   │
│                 │                                                │ REPLAY once built    │
└─────────────────┴────────────────────────────────────────────────┴──────────────────────┘
```

| Layer | State lives in | What stands in, and the seam |
|---|---|---|
| Application UI | `tools/<tool>/src/index.ts` declarations, `apps/console/src/app/` | Nothing. Every chip and trace is engine output |
| Workflows | `packages/engine/` (`execute-intent.ts`, `approvals/`, `policy/`) | Nothing, but no SLA timers or multi-step flows. Don't call it a workflow engine |
| Connectors | Seeded columns in `apps/console/data/console.db` | **Send to processor** sets `executing` and no processor answers. **Mark settled** records a reference the operator types. `sanctionsHit` and document scores are seed values. No service reads the flags. Each is where a real integration would plug in |
| Identity | Signed `ops_actor` cookie (`packages/engine/src/actor.ts`) | The role switcher replaces SSO. Role checks are real: the engine rejects a refunds agent posting a manager action, and a KYC manager deciding a refunds approval |
| Governance, data | `audit_log` and the tool tables in `apps/console/data/console.db`, seeded with synthetic data | Nothing. `/audit/verify` walks the real chain |
| Change (ALM) | GitHub: PRs, CI, branch protection. `runs/<id>/` for fixtures | The console's trigger, run view and `apps/console/src/app/api/devin/` are specs (`AGENT_TRIGGER_SURFACE.md`). With no Devin key the run view plays a fixture labelled "Replay" |

Status words, used the same way in every spec: **Real** runs as it would in production, on demo data. **Replay** is a recorded run played back, labelled on screen. **Stand-in** is an external system the console doesn't integrate: the seam is named and the value is seeded or typed. **Not built** is specced only.

## Replays on camera

A scripted fixture is fine while the run view is being built. Only a recorded run, or a live one, goes on camera, so the files, +/− lines and guard results on screen are what Devin did. The Loom's reversal beat is a recorded run.

## What stays simulated

Nothing beyond the replay player. No simulated telemetry, processor callbacks or connector traffic. Connectors stay stand-ins, named as the honest gap: Power Apps ships connectors, this console integrates none, and each real integration is its own build. The repo stays the size of the argument.
