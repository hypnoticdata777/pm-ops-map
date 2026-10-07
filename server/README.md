# PM Ops Map — Sync Server (optional)

A small, self-hosted Node service that lets a team share one PM Ops Map
workspace across browsers and devices. It's entirely optional — the app works
standalone with zero backend if you never touch this.

## How it works

- A **workspace** is just a name (e.g. `acme-property-mgmt`) plus a
  **passphrase** your team keeps between yourselves. There are no user
  accounts, no signup flow, no admin panel.
- Whoever pushes to a workspace name first **claims it** and sets its
  passphrase. Everyone else who connects with that name and passphrase reads
  and writes the same shared state.
- Each workspace is stored as a single JSON file on disk, versioned on every
  write. If a device tries to push against a stale version (because someone
  else pushed in the meantime), the server rejects it (`409`) and hands back
  the current state so the client can show the user what changed before
  deciding what to do.
- Nothing here is a database — this intentionally stays as close to the main
  app's "it's just a JSON blob" model as possible.

## Run it locally

```bash
cd server
npm install
npm start          # listens on :4000 by default
```

Or with auto-restart on change: `npm run dev`.

Configuration is via environment variables — see `.env.example`:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `4000` | Port to listen on |
| `DATA_DIR` | `./data` | Where workspace JSON files are stored |
| `ALLOWED_ORIGINS` | `*` | Comma-separated list of origins allowed to call this API |

## Deploy it

### Option A — Docker Compose (recommended for real team use)

From the repo root:

```bash
docker compose up -d
```

This builds the server, exposes it on `:4000`, and stores workspace data in a
named Docker volume (`sync-data`) that survives restarts and redeploys. Run
this on any $5/mo VPS, a home server, or a Raspberry Pi — anywhere that can
run a Docker container and stay reachable by your team's browsers.

### Option B — One-click deploy to Render (fastest way to try it)

The repo's `render.yaml` deploys this service to Render's free tier in a few
minutes. **Free tier has no persistent disk** — workspace data is lost on
every restart/redeploy, and the service sleeps after 15 minutes of
inactivity. That's fine for kicking the tires; for a team that depends on
this, upgrade to a paid Render instance and add a persistent disk mounted at
`/data`, or use Option A instead.

### Option C — Any other Node host

`server/Dockerfile` is a standard Node 20 Alpine image with no unusual
requirements. It runs anywhere that can run a Docker container and mount a
volume at `/data` — Fly.io, Railway, a bare VPS with `docker run`, etc.

## Connect the app to it

In PM Ops Map, open **Team Sync** in the stats bar, enter your server's URL,
pick a workspace name, and set a passphrase. The first device to connect
creates the workspace with its current data; every other device that connects
with the same name and passphrase joins it. From there, changes sync
automatically in the background every ~8 seconds — no manual export/import
needed.

## Security model, honestly

This is intentionally minimal, matching the zero-setup spirit of the main
app:

- The passphrase is hashed with `scrypt` server-side and never stored in
  plaintext, but it **is** stored in this browser's `localStorage`
  unencrypted, alongside all of this app's other data. Anyone with access to
  a connected device's browser storage can read it.
- There is no rate-limited login attempt lockout beyond a general per-IP rate
  limit, no audit trail of who connected from where, and no way to revoke one
  device's access without changing the passphrase for the whole team.
- Traffic should run over HTTPS in any real deployment (Render and most
  hosts provide this automatically) — passphrases are sent in POST request
  bodies, not the URL, but still deserve TLS in transit.

If you need real accounts, roles, or audit-grade access control, this isn't
that — it's a lightweight shared-secret sync layer sized for a small team
that trusts each other, which is the actual PM Ops Map audience.

## Tests

```bash
npm test
```

Covers workspace claim-on-first-write, passphrase verification, version
conflict detection (including a concurrent-write race), payload size limits,
request/state validation, and the HTTP API layer end-to-end.

## What the server validates

The server stores a workspace as an opaque blob and never interprets its
contents — the app checks every record itself before applying anything. It does
refuse (HTTP 400, with a message naming the problem) a push whose `state` is not
a JSON object, has a `schema` other than `pm-ops-map-state`, has the wrong type
for `departments` / `team` / `workOrders` / `portfolio` / `company`, has an
oversized list (about twice what the app keeps), contains a `__proto__` key, or
is nested more than 20 levels deep; an `expectedVersion` that is not a whole
number; or a passphrase over 200 characters. Unknown extra keys are accepted so
newer app versions keep working against an older server.
