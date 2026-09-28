# Devin API Setup Guide

## Current Configuration

The console reads its Devin settings from `.env` at the repository root (gitignored; copy `.env.example` to start).

- **API URL**: `https://api.devin.ai/v3` (override with `DEVIN_API_BASE`)
- **API Key**: Configured (starts with `cog_...`, a v3 service-user key)
- **Organisation**: set by `DEVIN_ORG_ID`; if you leave it out, the console reads it from `GET /v3/self`

`.env` is loaded once per server process. After you change it, restart `pnpm dev`.

## Testing the API

1. Open the console at `http://localhost:3001` and find the Devin window.
2. Config check: the window shows a green dot and **✓ Connected to Devin** when `DEVIN_API_KEY` is set. A yellow dot and "Devin not connected" mean the key is missing. This check only confirms that a key is set; it does not show whether the key is valid.
3. Live call: open `http://localhost:3001/api/devin/status` (the **Check connection** link in the Devin window). The server calls `GET /v3/self` with your key and returns something like:

   ```json
   {"configured":true,"mode":"live","orgId":"org-…","orgSource":"DEVIN_ORG_ID","principal":"service_user · Devin API","error":null}
   ```

   `principal` set and `error: null` means the key works. The server caches the result for 60 seconds, or for 15 seconds after a failure.

## Common Issues & Solutions

### Issue 1: CORS Error

**Symptom**: Browser code that calls `api.devin.ai` directly fails. The console shows `TypeError: Failed to fetch` and says the request was blocked by CORS policy. The preflight request gets this response:

```
OPTIONS https://api.devin.ai/v3/organizations/<org>/sessions
Origin: http://localhost:3001

HTTP/2 400
Disallowed CORS origin
```

**Why it happens**: The Devin API sends no `Access-Control-Allow-Origin` header for browser origins, so the browser won't let a page read its responses.

**Solution Options**:

#### Option A: Ask the API provider about CORS support

- Tested 2026-09-28: preflights from `http://localhost:3001` and from `https://app.devin.ai` both returned `400 Disallowed CORS origin`.
- A plain `GET` with an `Origin` header returns 200, but still without `Access-Control-Allow-Origin`.
- Even if Cognition added your origin, calling from the browser would put the `cog_` key in client code. Don't rely on this option.

#### Option B: **Backend Proxy (Recommended)**

The console already works this way:

1. The browser calls only the console's own routes (`/api/devin/status`, `/api/devin/<runId>`) and server actions.
2. The Next.js server reads `DEVIN_API_KEY` from `.env` (`apps/console/src/lib/bridge.ts`), and nothing else reads it.
3. The server calls `api.devin.ai` with `Authorization: Bearer <key>`, using `httpDevinClient` in `tools/automation/src/devin-api.ts`.
4. The server returns only the fields the page needs. The key never appears in a response.

```
Browser (localhost:3001)
   │  fetch("/api/devin/<runId>")          same origin, no CORS
   ▼
Console server (Next.js route / server action)
   │  Authorization: Bearer $DEVIN_API_KEY
   ▼
Devin API (api.devin.ai/v3)
```

#### Option C: Browser Extension

**NOT for production!** A CORS-unblocking extension hides the error in your own browser only. The key still ships to the browser, and nobody else's browser has the extension. Use it only for a throwaway local experiment.

### Issue 2: Authentication Error (401/403)

**Symptom**: `/api/devin/status` shows a non-null `error`, or a direct call returns:

```
{"type":"about:blank","title":"Forbidden","status":403,"detail":"Unauthorized","instance":"/v3/self"}
```

**Why it happens**: Devin returns `403 Unauthorized` when the key is missing, mistyped, revoked, or not allowed to act in the organisation.

**Solution**:

1. Verify the key: it must start with `cog_`, sit on the `DEVIN_API_KEY=` line in the root `.env`, and have no quotes or trailing spaces. Restart `pnpm dev` after you edit the file.
2. Check permissions: `GET /v3/self` returns the key's `org_id`. `DEVIN_ORG_ID` must match it, and the service user needs permission to create sessions in that org.
3. Contact Cognition support if a freshly issued key still returns 403 from `/v3/self`.

### Issue 3: Network Error

**Symptom**: `Failed to fetch` in the browser, or `"error":"fetch failed"` in `/api/devin/status`.

**Why it happens**: The request never got a response. In the browser, that means the console server isn't reachable. On the server, it means `api.devin.ai` isn't reachable.

**Solution**:

1. Check your connection: make sure `pnpm dev` is running on port 3001 and the machine can reach the internet (VPN and proxy settings included).
2. Check the URL: unset `DEVIN_API_BASE` unless you need it. The default is `https://api.devin.ai/v3`, without a trailing slash.
3. Test outside the console with curl or Postman (see below). If that works, the problem is in the console, not the API.

## Recommended Setup: Backend Proxy

The proxy is already in place as Next.js route handlers, so you don't need a separate server. For example, a run's route forwards to Devin through the server-side bridge:

```javascript
// apps/console/src/app/api/devin/[runId]/route.ts (simplified)
import { bridgeDeps } from "@/lib/bridge";
import { handleGet, handlePost } from "@/lib/devin-route";
import { currentActor } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const { runId } = await params;
  const result = await handleGet(runId, await currentActor(), bridgeDeps());
  return Response.json(result.body, { status: result.status });
}

export async function POST(request, { params }) {
  const { runId } = await params;
  const body = await request.json().catch(() => null);
  const result = await handlePost(runId, await currentActor(), bridgeDeps(), body);
  return Response.json(result.body, { status: result.status });
}
```

To add a new Devin call, put it behind a console route or server action, and have the browser fetch the local path:

```javascript
const res = await fetch(`/api/devin/${runId}`); // never https://api.devin.ai from the browser
```

## Next Steps

1. Check the test page: `http://localhost:3001/api/devin/status` should show `"mode":"live"` and `"error":null`.
2. Inspect the browser console (Network tab) for failed `/api/devin/*` requests. A dispatch that Devin rejects is saved as a failed run, with its reason shown on the run page in the form `Devin API <status> on <path>: <detail>`.
3. Share the error for help: send the `error` field or the log line. Never send the key.

## Testing with curl (Alternative)

This call creates a real session and can use ACUs. `max_acu_limit` caps the spend.

```bash
curl -X POST "https://api.devin.ai/v3/organizations/$DEVIN_ORG_ID/sessions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-cog_-key>" \
  -d '{"prompt":"Connectivity test. Reply OK.","title":"API connectivity test","tags":["api-smoke-test"],"max_acu_limit":1}'
```

A 200 response includes `session_id` and `url`. To end the session, send `curl -X DELETE ".../sessions/<session_id>" -H "Authorization: Bearer <your-cog_-key>"`.

If curl works but the browser doesn't, it's a CORS issue.
