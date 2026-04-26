# deploy. — Brimble Take-Home Pipeline

A one-page deployment pipeline: submit a Git URL or upload a ZIP, watch it build with Railpack, run as a container, and serve behind Caddy — all from a single `docker compose up`.

---

## Quick Start

```bash
# Clone and start
git clone https://github.com/orkuma-alex/brimble-test.git
cd brimble-test

# Copy env (defaults work out of the box)
cp .env.example .env

# Bring up the full stack
docker compose up --build
```

Open **http://localhost:8080** in your browser.

> **Prerequisites:** Docker + Docker Compose v2. No other local tools needed.

---

## Architecture

```
Browser
  │
  ▼
Caddy :80 ──────────────────────────────────────────────
  │                                                     │
  ├─ /api/*  ──────────────────────── backend:3000      │
  │          (Hono API, SQLite, pipeline runner)         │
  │                                                     │
  ├─ /deploy/{id}/*  ──────────────── brimble-{id}:3000 │
  │          (per-deployment container, added at         │
  │           runtime via Caddy admin API)               │
  │                                                     │
  └─ /*  ────────────────────────── frontend:80         │
             (Vite build served by Nginx)               │
                                                        │
Docker network: brimble_app_net                         │
                                                        │
BuildKit ◄──── backend (BUILDKIT_HOST env var) ─────────┘
  (moby/buildkit container, privileged)
```

### Services

| Service | Image | Role |
|---------|-------|------|
| `caddy` | `caddy:2-alpine` | Single ingress, dynamic routing via admin API |
| `buildkit` | `moby/buildkit:latest` | OCI image builder for Railpack |
| `backend` | Built from `./backend` | Hono API + pipeline orchestrator |
| `frontend` | Built from `./frontend` | React UI, Nginx static serve |

---

## Pipeline Flow

```
POST /api/deployments
  ├─ status: pending  (returns immediately)
  └─ background task:
       1. git clone OR unzip upload  → /tmp/brimble/{id}/
       2. railpack build             → Docker image brimble/deploy:{shortId}
       3. docker run                 → container brimble-{shortId} on brimble_app_net
       4. Caddy admin API PATCH      → route /deploy/{id}/* → brimble-{shortId}:3000
       5. status: running, url set
```

Status transitions: `pending → building → deploying → running | failed`

Each step emits log lines to SQLite **and** a per-deployment `EventEmitter`. The SSE endpoint drains historical logs first (from DB), then subscribes live — so reconnecting clients see the full history.

---

## API

```
POST   /api/deployments              Create deployment (multipart: source_type, git_url | file)
GET    /api/deployments              List all deployments (desc)
GET    /api/deployments/:id          Single deployment
GET    /api/deployments/:id/logs     SSE stream — historical + live build/deploy logs
POST   /api/deployments/:id/redeploy Re-run pipeline with same source
DELETE /api/deployments/:id          Stop container, remove Caddy route, delete record
GET    /health                       Health check
```

---

## Design Decisions

### Why Hono?

Hono has first-class SSE streaming support (`streamSSE`), TypeScript-native types, and runs cleanly on `@hono/node-server` without the friction of Express middleware boilerplate. The streaming API maps directly to what we need: send history, subscribe to an EventEmitter, close when done.

### Why SQLite + Drizzle?

Zero external services to spin up. WAL mode keeps concurrent reads fast. Drizzle gives typed queries without the ceremony of a migration framework. The entire database is a single file at `/data/db/brimble.db`, trivially inspectable.

### Why SSE over WebSocket?

Log streaming is unidirectional (server → client). SSE is HTTP-native — it works through Caddy's `reverse_proxy` with `flush_interval: -1` set, survives NAT, and requires zero client-side handshake logic. The frontend's `EventSource` is 10 lines.

### Why Caddy admin API for routing?

Caddy's `/config/` API lets us add and remove per-deployment routes at runtime without restarting Caddy or templating config files. The `@id` tag on each deployment route makes cleanup a single `DELETE /id/deploy-{uuid}` call — no need to track index positions.

The trade-off: GET + PUT on the entire routes array isn't atomic. For a single-user eval environment this is fine; in production you'd want optimistic locking or a dedicated route registry.

### Build cache

Railpack's `--cache-key` is set to the first 8 chars of the deployment UUID (the same key used for the image tag). Subsequent deployments with the same source name reuse the BuildKit layer cache — measurable on the second build of a Node.js or Python app.

---

## Bonus Features Implemented

- **Redeploy** — `POST /api/deployments/:id/redeploy` + button in UI. Re-runs the full pipeline; tears down the old container first.
- **Build cache** — `--cache-key {shortId}` wires Railpack to BuildKit's layer cache.
- **Graceful shutdown** — `docker stop -t 10` sends SIGTERM and waits 10 seconds before SIGKILL, giving containers time to finish in-flight requests.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST_BASE_URL` | `http://localhost` | Base URL shown in deployment cards |

Set in `.env` (copy from `.env.example`). No external accounts required.

---

## What I'd Change With More Time

1. **Zero-downtime redeploy** — start the new container, health-check it, then atomically swap the Caddy upstream and stop the old one. The current approach has a brief gap between stop and start.
2. **Build queue** — right now two deployments can build simultaneously and race on the Caddy route update. A simple in-memory queue with a mutex per deployment ID would fix this.
3. **Proper log retention** — logs currently grow forever. Add a cleanup job or `LIMIT + OFFSET`-based pagination on the SSE endpoint for large histories.
4. **Source cleanup** — `/tmp/brimble/{id}/` is never deleted. Add a post-pipeline cleanup step.
5. **Multi-platform Railpack binary** — the Dockerfile downloads the musl binary for the detected arch; tested on amd64. On Apple Silicon the `arm64-unknown-linux-musl` variant should be pulled instead — the arch detection logic handles this but hasn't been tested end-to-end on ARM.

---

## Project Structure

```
.
├── docker-compose.yml
├── caddy.json             # Caddy initial config (admin on 2019, API + frontend routes)
├── .env.example
├── sample-app/            # Demo Node.js app — deploy this to test the pipeline
│   ├── index.js
│   └── package.json
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.ts       # Hono app entry
│       ├── events.ts      # In-memory EventEmitter map for SSE broadcast
│       ├── db/
│       │   ├── client.ts  # better-sqlite3 + Drizzle setup
│       │   ├── schema.ts  # Drizzle table definitions
│       │   └── migrate.ts # Run-on-startup SQL migrations
│       ├── routes/
│       │   └── deployments.ts  # All REST + SSE endpoints
│       └── pipeline/
│           ├── index.ts   # Orchestrator — runs steps, updates status
│           ├── source.ts  # git clone or zip extract
│           ├── build.ts   # railpack build + log streaming
│           ├── container.ts  # docker run / stop / rm
│           └── caddy.ts   # Caddy admin API route management
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── vite.config.ts
    └── src/
        ├── main.tsx
        ├── router.ts      # TanStack Router (code-based, single route)
        ├── styles.css     # Design system — Brimble palette + DM Sans + JetBrains Mono
        ├── routes/
        │   └── index.tsx  # Single page component
        ├── components/
        │   ├── DeployForm.tsx      # Git URL / ZIP upload form
        │   ├── DeploymentCard.tsx  # Status, image tag, URL, actions
        │   ├── StatusBadge.tsx     # Animated status indicator
        │   └── LogViewer.tsx       # SSE terminal overlay
        └── lib/
            ├── api.ts      # Typed fetch client
            └── useLogs.ts  # EventSource hook with auto-reconnect
```

---

## Sample App

The `sample-app/` directory contains a minimal Node.js HTTP server that responds with JSON on any path. Use it to test the pipeline:

```
# In the UI, submit:
Git URL: https://github.com/orkuma-alex/brimble-test.git
# (the repo contains sample-app/ — Railpack will detect Node.js and build it)

# Or zip the sample-app folder and upload it directly
```

After deployment, visit the URL shown in the deployment card.

---

## Time Estimate

~12–14 hours over two sessions:
- Infra + pipeline design: 3h
- Backend (API + DB + pipeline): 4h
- Frontend (components + design system + hooks): 3h
- Integration + debugging: 2h
- README: 1h

---

## Brimble Deploy + Feedback

I attempted to deploy a simple Node.js app on the Brimble platform. I was unable to complete a deployment due to multiple blocking bugs encountered during onboarding. Full details with screenshots are in [`deploy-on-brimble.md`](./deploy-on-brimble.md).

### Issues Encountered

1. **Google Sign-Up — confusing tab flow.** The OAuth popup asked me to "close this tab", which closed the sign-up page instead of redirecting back. I had to manually reload to recover.

2. **GitHub Import — "Service Unavailable".** Clicking "Import from GitHub" on the new project page immediately showed a "Service Unavailable" error, though the Connect button was still active.

3. **GitHub Auth — error after redirect.** After completing GitHub OAuth and being redirected back, the page spun for a while and then showed a generic error popup with no actionable message.

4. **Create Environment — broken modal loop.** Clicking "Create" showed a brief spinner, then nothing happened. Pressing Enter opened a duplicate "Create New Environment" modal instead of submitting — an infinite loop.

5. **Blocked from deploying.** Because none of the above flows completed, I could not test the deployment pipeline, logs, domain routing, or any post-deploy features.

### Suggestions

- **OAuth flow:** Redirect automatically after sign-up instead of asking the user to close a tab. If using a popup, detect its closure and refresh the parent window.
- **GitHub integration:** If the service is down, disable the button and show a status message. Add retry logic or a fallback.
- **Environment creation:** Likely a state management bug — the form handler is re-opening the modal instead of dispatching the create action. Debounce the button and close the modal on success.
- **Error messages:** Most errors were generic popups with no next steps. Actionable error messages ("Retry", "Contact support", or a clear explanation) would significantly reduce new-user drop-off.

The platform's UI design looks clean and promising. The issues are functional, not aesthetic — fixing the onboarding blockers would make a strong first impression.
