# Railway container spinner

A small web app that spins containers up and down through Railway's GraphQL API, with a UI. Built for the Railway full-stack take-home:

> Build an application to spin up and spin down a container using our GQL API. The app needs to have a UI component and not just a backend that uses the API.

## What it does

- **Spin up:** pick an image (whoami, nginx, http-echo) and an optional name. The app creates a Railway service from that image in one project and environment, adds a public `*.up.railway.app` domain, and shows the container moving from *starting* to *running*.
- **Stop:** stops the running deployment but keeps the service. **Start** brings it back with a redeploy.
- **Delete:** removes the service and all its deployments (with a confirm).
- **Live status:** the list polls every 3 seconds while something is changing and every 10 seconds when everything is settled.

"Spin down" can mean two things on Railway, so the app supports both and says which is which: stop (cheap to bring back) and delete (gone).

## How it works

```
Browser (React client component)
   │  fetch /api/containers...
   ▼
Next.js route handlers (server only)      ← token lives here, in env vars
   │  POST GraphQL
   ▼
Railway API  https://backboard.railway.com/graphql/v2
```

- `src/lib/railway.ts`: the only place that talks to Railway. A small typed `gql()` helper (bearer token, error mapping for 401 / 429 / GraphQL errors / network) and one function per action: `listContainers`, `spinUp`, `stopContainer`, `startContainer`, `deleteContainer`. Marked `server-only`, so it can't be bundled into the browser.
- `src/app/api/containers/**`: thin route handlers. `GET` list, `POST` spin up, `POST /:id/stop`, `POST /:id/start`, `DELETE /:id`. Errors come back as `{ error }` with a sensible status.
- `src/components/Spinner.tsx`: the UI. Form, list, buttons, polling, loading / empty / error states.
- `src/middleware.ts`: optional shared password (HTTP Basic auth) when `TAKEHOME_PASSWORD` is set, so strangers can't spin containers on the account.
- `docs/api-notes.md`: the exact GraphQL operations, checked by introspection and by hand.

## Guardrails

- **Only touches its own services.** Everything it creates is named `spin-…`; every action looks the service up first and refuses anything without that prefix. The app's own service in the same project is never listed or touched.
- **Image allowlist.** Only three small public images, so the endpoint can't be used to run arbitrary code.
- **Limit of 2 containers** (Railway's Free plan allows 3 services per project; one is the app itself).
- **Token never reaches the browser.** All calls go through server routes; the token is an environment variable.

## Decisions and trade-offs

- **Polling, not subscriptions.** Railway has GraphQL subscriptions, but polling with a fast/slow interval is simpler to reason about, survives reconnects, and is enough for a few containers. Next step would be subscriptions or Railway webhooks.
- **Status from `latestDeployment`.** One list query returns services, domains and the latest deployment, so the UI needs one request per poll. A quirk: after `deploymentStop` the status stays `SUCCESS`, and the `deploymentStopped` flag tells you it's stopped. The app maps both into one simple state.
- **Account token vs project token.** For the hosted demo a project-scoped token is the safer choice (smallest blast radius). The code works with either.
- **No database.** Railway is the source of truth; the app keeps no state of its own.

## Run it

```bash
cp .env.example .env.local   # fill in RAILWAY_TOKEN, SPIN_PROJECT_ID, SPIN_ENVIRONMENT_ID
npm install
npm run dev                  # http://localhost:3000
npm test                     # API layer (mocked fetch) + UI tests
npm run typecheck && npm run lint
```

Deploy on Railway: create a service from this repo (or `railway up`), set the same variables in the service, and add a domain. Set `TAKEHOME_PASSWORD` to protect the UI.

## 30-minute walkthrough

1. The problem in one line, and the two meanings of "spin down" (stop vs delete).
2. Live demo: spin up whoami, watch *starting → running*, open its URL, stop it (URL goes 502), start it again, delete it.
3. Code tour: `railway.ts` (typed wrapper, error mapping, guardrails), the route handlers, why the token stays on the server, the polling loop.
4. Trade-offs above, and what I'd do next: subscriptions or webhooks for status, a logs panel (`deploymentLogs`), per-user auth with "Login with Railway", integration tests against a throwaway project in CI.
