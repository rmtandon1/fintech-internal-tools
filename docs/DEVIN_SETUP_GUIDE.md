# Devin Setup Guide

Everything on the Devin side the console needs before an **Ask Devin** button sends real work:
an API key, repository access, and the run playbook. For the console's API calls, error
messages and CORS, see [DEVIN_API_SETUP.md](DEVIN_API_SETUP.md). For what a run does once it
starts, see [DEVIN_RUN_PROTOCOL.md](DEVIN_RUN_PROTOCOL.md).

## What the console needs from Devin

| Need | Why | Where it is set |
|---|---|---|
| A v3 API key (`cog_…`) for a service user | Creates, reads, messages and ends sessions | `DEVIN_API_KEY` in the root `.env` |
| The organisation id | Sessions and playbooks live under `/v3/organizations/{org_id}` | Read from `GET /v3/self`; `DEVIN_ORG_ID` overrides |
| Devin's access to the GitHub repository | Sessions clone, branch, push and open pull requests | Devin's GitHub integration |
| The "Governed console run" playbook | Carries the run procedure and the structured-output schema | `pnpm devin:playbook` |

## 1. Create the API key

1. In Devin, create a service user for the console in the organisation that will run the work,
   and issue it an API key. Keys start with `cog_`.
2. Give the service user permission to create sessions and manage playbooks in that
   organisation.
3. Put the key in the repository root, not in `apps/console`:

   ```bash
   cp -n .env.example .env
   # DEVIN_API_KEY=cog_…
   ```

The key is read on the server by `apps/console/src/lib/bridge.ts` and never reaches the
browser. Restart `pnpm dev` after editing `.env`.

Sessions created with the key belong to the service user, so they don't appear in anyone's
session list in the Devin app. To create them on behalf of a person instead, set
`DEVIN_CREATE_AS_USER_ID=user-…`. The console then sends it as `create_as_user_id`. The service
user's role needs the `ImpersonateOrgSessions` permission, and the target user must be a member
of the organisation with `UseDevinSessions`. Find the id with
`GET /v3beta1/organizations/{org_id}/members/users?email=…`.

## 2. Check the key and organisation

```bash
curl -s http://localhost:3001/api/devin/status
```

```json
{"github":true,"configured":true,"mode":"live","orgId":"org-…","orgSource":"key","principal":"service_user · …","error":null}
```

- `orgSource: "key"` means the organisation came from `GET /v3/self`. Set `DEVIN_ORG_ID` only if
  the key can act in more than one organisation; `orgSource` then reads `DEVIN_ORG_ID`.
- A key that isn't scoped to an organisation fails with
  `The Devin API key is not scoped to an organisation; set DEVIN_ORG_ID`.

## 3. Give Devin the repository

Sessions must be able to push a branch and open a pull request against
`devin/1790697259-loom-sandbox` in `rmtandon1/fintech-internal-tools`.

1. Connect the repository through Devin's GitHub integration.
2. The console tells each session which repository to use. It reads `GITHUB_REPOSITORY` if set,
   otherwise the `origin` remote of the serving checkout, and accepts only a plain
   `owner/repo` on `github.com`.
3. Devin's GitHub account must not be able to bypass review on the integration branch. See
   [GITHUB_INTEGRATION.md](GITHUB_INTEGRATION.md) § Branch protection.

## 4. Register the run playbook

```bash
pnpm devin:playbook
```

This reads `.devin/run-protocol.playbook.md` and creates, or updates in place, the org
playbook titled **Governed console run**, together with the `StructuredOutput` JSON schema from
`tools/automation/src/run-files.ts`. It prints the playbook id.

- Dispatch finds the playbook by title, so `DEVIN_PLAYBOOK_ID` is optional.
- A missing playbook doesn't block a run: the prompt also tells the session to follow
  `.devin/run-protocol.playbook.md` from the repository. Registering it keeps the procedure
  pinned in the session.
- **Re-run it after every change to the playbook file.** The org copy doesn't update by itself.
  The plan-the-affected-tests step (#65) only reaches sessions once re-registered.

## 5. Optional session secrets

| Secret | Used by | Without it |
|---|---|---|
| `COMPANIES_HOUSE_API_KEY` | Part 2, merchant monitoring | The recheck uses recorded responses and labels them test data |

Add these in Devin's secrets for the organisation if a run should call the live service.

## What a session receives

Built by `dispatchRun` in `tools/automation/src/bridge.ts`:

```text
<the operator's sentence>
Operation: change. Run: <run_id>.
Spec: docs/CHARGEBACKS_FROM_POWER_APPS.md.          ← only for specs marked sendSpec
Repository: https://github.com/<owner>/<repo>. Branch from devin/1790697259-loom-sandbox at <sha7> and open the pull request against devin/1790697259-loom-sandbox.
Work from the attached runs/<run_id>/context.json; commit it unchanged on your branch.
The attachment is the whole brief: … Do not open the feature specs under docs/.   ← when not sendSpec
Follow .devin/run-protocol.playbook.md and docs/DEVIN_RUN_PROTOCOL.md.
```

Plus: the `context.json` attachment (uploaded first to `/attachments`), the playbook id,
`structured_output_schema` with `structured_output_required: true`, and tags
`run:<run_id>` and `operation:<change|undo>`.

⚠ The console sets no `max_acu_limit` today, so a session's spend is capped only by the
organisation's own limits.

## 6. First end-to-end run

1. As `manager`, open `/t/refunds`, click the Kestrel Outdoors strip, then
   **Ask Devin for a rule** → **Send to Devin**.
2. `/runs` shows **Sent to Devin**, then **Devin working**. **Open in Devin** opens the session.
3. The session's first commit on `devin/<run_id>-…` holds only `runs/<run_id>/context.json` and
   `plan.json`.
4. The pull request opens against `devin/1790697259-loom-sandbox`, and CI posts the
   guard report as a comment.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Run reads **Couldn't start** with `Devin API 403 on …/sessions` | Service user can't create sessions in the org | Grant session permission, or set `DEVIN_ORG_ID` to the right org |
| Run reads **Couldn't start** with `Devin attachment upload returned no url` | Attachment upload rejected | Check the key's permissions; retry |
| Session works in the wrong repository, or can't push | Repository not connected, or the remote isn't on github.com | Connect it in Devin; set `GITHUB_REPOSITORY=rmtandon1/fintech-internal-tools` |
| `Multiple org playbooks named Governed console run` | Duplicate playbooks | Delete all but one in Devin, then `pnpm devin:playbook` |
| Session ignores the plan-first rule | Org playbook is stale | `pnpm devin:playbook` |
| Session stops at Verify naming an unplanned test | Playbook predates #65, or the plan missed a test | Re-register the playbook and dispatch again |
