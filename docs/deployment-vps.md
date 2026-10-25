# Deploying the API to a VPS (push-to-deploy, zero downtime)

A push to `main` that touches `api/` or `deploy/` runs tests on GitHub's machines, then builds the Docker
image **on the VPS** and releases it blue-green. Users never see an error page during a release, and
nobody (including CI) ever opens an SSH connection to the server.

```
 git push main
      │
      ▼
 GitHub Actions ── verify (ubuntu-latest): typecheck · lint · unit tests
      │            migrate (optional):    supabase db push
      │
      │  job queued for label "bocardo-prod"
      ▼
 ┌──────────────────────────── VPS ─────────────────────────────────────────────┐
 │  actions-runner (systemd, user "deploy")                                     │
 │     ▲ long-polls github.com over outbound HTTPS 443; no inbound port needed   │
 │     │                                                                        │
 │     └─ deploy.sh: docker build → start idle colour → health gates →          │
 │                   caddy reload → verify over TLS → drain old colour          │
 │                                                                              │
 │   :80/:443  ┌──────────────┐        ┌────────────────────────────┐           │
 │  internet ─▶│ Caddy (TLS)  │──live─▶│ bocardo-green-api-1 … N     │  release B│
 │             │ bocardo-caddy│        └────────────────────────────┘           │
 │             └──────────────┘ ┄idle┄▶ bocardo-blue-api-1 … N  (stopped)  rel. A│
 │                    network: bocardo_edge (API containers publish no ports)   │
 └──────────────────────────────────────────────────────────────────────────────┘
      Supabase Postgres · Upstash Redis/QStash · FCM · Razorpay (all managed, off-box)
```

Everything stateful is already managed elsewhere (Supabase, Upstash), so the VPS holds only stateless API
containers and the Caddy proxy. That is what makes blue-green safe and lets you add VPSes later.

## Files

| Path | What it does |
|---|---|
| `.github/workflows/api-deploy.yml` | push → verify → (migrate) → build & release on the VPS |
| `.github/workflows/api-ops.yml` | manual buttons: status, rollback, redeploy, logs |
| `deploy/scripts/bootstrap-vps.sh` | one-time server hardening: Docker, user, firewall, swap, SSH, runner |
| `deploy/scripts/install-runner.sh` | registers the GitHub runner as a systemd service |
| `deploy/scripts/write-config.sh` | writes `/opt/bocardo/shared/*.env` from GitHub secrets/variables |
| `deploy/scripts/deploy.sh` | the blue-green release |
| `deploy/scripts/rollback.sh` | re-release an earlier image (no rebuild) |
| `deploy/scripts/status.sh` | live colour, health, history, disk |
| `deploy/compose/api.compose.yml` | one colour of the API (limits, health check, log rotation) |
| `deploy/compose/edge.compose.yml` | Caddy, the only container with public ports |
| `deploy/caddy/Caddyfile` | TLS, compression, security headers; imports the live upstream |

On the server:

```
/opt/bocardo/
├── shared/api.env        API secrets (600), from the API_ENV_FILE secret
├── shared/deploy.env     domain, replicas, limits, from repository variables
├── state/active_color    blue | green
├── state/release-blue    image tag each colour last ran
├── state/releases.log    one line per release: time colour tag actor
└── caddy/Caddyfile, caddy/upstreams/api.caddy   (mounted read-only into Caddy)
/opt/actions-runner/      the GitHub runner
```

---

## 0. Before you start: make the repository private

The deploy job runs on a **self-hosted runner**, which is a machine that executes workflow code with
Docker access. On a **public** repository, anyone can open a pull request from a fork that adds their own
workflow targeting `self-hosted`, and GitHub's own docs advise against self-hosted runners on public repos.
Actions logs are also world-readable on public repos.

1. **Settings → General → Danger zone → Change visibility → Private.** (Self-hosted runner minutes are
   free on private repos. Only the verify job uses GitHub-hosted minutes, about 2 minutes per push.)
2. If it must stay public: **Settings → Actions → General → "Fork pull request workflows from outside
   collaborators" → Require approval for all outside collaborators**, and never approve a PR that touches
   `.github/`. The workflows in this repo never run on `pull_request`.

## 1. Get a VPS and a domain

* **Size:** at least 2 vCPU / 2 GB RAM (e.g. Hetzner CPX21, DigitalOcean 2 GB, AWS Lightsail 2 GB). The
  image is built on the same box while the live API keeps serving; the bootstrap adds 2 GB swap for build
  headroom. 4 GB is more comfortable once you run 3 or more replicas.
* **Region:** close to your Supabase region (e.g. Mumbai `ap-south-1` → a Mumbai/Bangalore VPS). Every
  request does several DB round-trips, so this matters more than CPU.
* **OS:** Ubuntu 24.04 LTS (22.04 and Debian 12 also work).
* **DNS:** create an `A` record such as `api.bocardo.in → <VPS IPv4>` (and `AAAA` for IPv6 if you have
  it). Caddy gets the Let's Encrypt certificate automatically once DNS points at the box.
  No domain yet? `api.<ip-with-dashes>.sslip.io` (e.g. `api.203-0-113-7.sslip.io`) resolves to that IP
  and works with Let's Encrypt.

## 2. Bootstrap the server (once, no SSH needed)

Port 22 being blocked on your network only stops **you** from SSHing in. Use the provider's browser
console instead (Hetzner "Console", DigitalOcean "Droplet Console", Lightsail "Connect using SSH" in the
browser, Vultr "View Console"). A phone hotspot works too.

First create a runner registration token: **GitHub repo → Settings → Actions → Runners → New
self-hosted runner** and copy the token from the `./config.sh --token XXXX` line. It is valid for 1 hour.

Then, as root in the console:

```bash
curl -fsSL https://raw.githubusercontent.com/anurag3407/bocardo_apps/main/deploy/scripts/bootstrap-vps.sh -o bootstrap.sh
GH_REPO_URL=https://github.com/anurag3407/bocardo_apps \
GH_RUNNER_TOKEN=<token from above> \
SSH_ALT_PORT=2222 \
bash bootstrap.sh
```

For a private repo, `raw.githubusercontent.com` needs a token. Either paste the script into the console
(`nano bootstrap.sh`), or run `git clone` with a fine-grained read-only token and then run
`bash bocardo_apps/deploy/scripts/bootstrap-vps.sh`.

What it does (safe to re-run):

* Applies OS updates and turns on unattended security upgrades.
* Installs Docker with `live-restore` (containers keep running while Docker upgrades), log rotation and
  BuildKit.
* Creates a `deploy` user in the `docker` group that owns `/opt/bocardo` and copies your SSH keys to it.
* Adds 2 GB swap on boxes under 8 GB and raises socket/file limits.
* Sets up `ufw` to allow only 22, `SSH_ALT_PORT`, 80 and 443 (tcp+udp), and enables fail2ban.
* Turns off SSH passwords, but only if an SSH key is already installed, so it cannot lock you out.
* Optionally joins Tailscale (`TAILSCALE_AUTHKEY=tskey-…`, see §7).
* Installs the GitHub runner as a systemd service with labels `self-hosted, linux, bocardo-prod`.

Check: **Settings → Actions → Runners** should show the runner as **Idle** (green).

## 3. Configure secrets and variables in GitHub

**Settings → Environments → New environment → `production`.** Optionally add yourself under
*Required reviewers* to get an "Approve deploy" button. Then add:

### Secrets (environment `production`)

| Name | Value |
|---|---|
| `API_ENV_FILE` | The **entire** production `.env` for the API, pasted as one multi-line secret (template below). |
| `SUPABASE_DB_URL` | Only if `RUN_DB_MIGRATIONS=true`: the Supabase **session pooler or direct** URL (port 5432, not 6543), including the DB password. |

`API_ENV_FILE` template. Start from the values currently on Render, then change the URLs:

```dotenv
API_PUBLIC_URL=https://api.bocardo.in
CORS_ORIGINS=https://admin.bocardo.in
APP_SECRET=<openssl rand -hex 32; keep the same value Render uses, or in-flight delivery OTPs change>

DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
DATABASE_POOL_MAX=10
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...

UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
QSTASH_TOKEN=...
QSTASH_CURRENT_SIGNING_KEY=...
QSTASH_NEXT_SIGNING_KEY=...

FIREBASE_SERVICE_ACCOUNT_BASE64=...
GEO_PROVIDER=mapbox
MAPBOX_ACCESS_TOKEN=...
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
TELEPHONY_WEBHOOK_TOKEN=...
SUPABASE_SEND_SMS_HOOK_SECRET=...

# while real providers are not live yet (same as Render today):
ALLOW_DEV_FALLBACKS=true
TELEPHONY_PROVIDER=direct
SMS_PROVIDER=log
OTP_HUMAN_CHECK=optional
```

You don't need `NODE_ENV` or `PORT`. The compose file forces `production` and `4000`. Avoid `$` in
values, because Compose would treat it as variable interpolation.

### Variables (Settings → Secrets and variables → Actions → **Variables**)

| Name | Example | Default |
|---|---|---|
| `API_DOMAIN` | `api.bocardo.in` | required |
| `ACME_EMAIL` | `ops@bocardo.in` | required (Let's Encrypt expiry notices) |
| `API_REPLICAS` | `2` | `2` |
| `API_MEMORY_LIMIT` | `512m` | `512m` per container |
| `API_CPUS` | `1.0` | `1.0` per container |
| `API_HEAP_MB` | `384` | `384` (keep about 75% of the memory limit) |
| `DRAIN_SECONDS` | `15` | `15` |
| `RUN_DB_MIGRATIONS` | `true` | off |

## 4. First deploy

Push anything under `api/` to `main`, or open **Actions → API · deploy → Run workflow**. Watch the
*Build & release on VPS* job. The first build takes 3–5 minutes. Later builds take about 1 minute because
pnpm's store and Docker layers are cached on the box.

```bash
curl -i https://api.bocardo.in/health/ready
# HTTP/2 200 … x-bocardo-release: blue-1a2b3c4d5e6f
```

Then point the clients at the new URL:

1. **Mobile apps:** `eas env:update` `EXPO_PUBLIC_API_URL=https://api.bocardo.in` in preview + production
   for all three EAS projects, then rebuild (or `eas update` if only JS changed).
2. **Admin panel:** `NEXT_PUBLIC_API_URL`, and add its origin to `CORS_ORIGINS` in `API_ENV_FILE`.
3. **Webhooks:** Razorpay → `https://api.bocardo.in/webhooks/razorpay`; Supabase Send-SMS hook →
   `/webhooks/auth/send-sms`; telephony callbacks follow `API_PUBLIC_URL` automatically, as does QStash.
4. Keep Render running for a day as a fallback, then suspend it.

## 5. How a release stays zero-downtime

`deploy/scripts/deploy.sh` runs these steps under a host-wide lock. A workflow `concurrency` group also
queues pushes instead of cancelling them.

1. **Build** `bocardo-api:<12-char sha>` on the VPS with `docker build --pull` (fresh base-image patches).
   An image that already exists is reused.
2. **Start the idle colour.** If blue is live, green starts with `API_REPLICAS` containers on the private
   `bocardo_edge` network. Blue keeps serving 100% of traffic.
3. **Gate.** Every replica must stay `running` with 0 restarts, turn Docker-`healthy` (`/health`), and
   answer `/health/ready` (database reachable) within 180 s. If any gate fails, the release stops, the
   failing containers' logs are printed, green is stopped, and blue is untouched.
4. **Switch.** The script writes `upstreams/api.caddy` atomically and runs `caddy reload`. Caddy swaps
   config in-process. Open connections finish on the old upstream (`grace_period 30s`) and new requests go
   to green. No socket is closed and no request is dropped.
5. **Verify** over real TLS through Caddy (`--resolve api.domain:443:127.0.0.1`). The response must be
   200 *and* carry `X-Bocardo-Release: green-<tag>`. On failure, Caddy is pointed back at blue and green
   is stopped.
6. **Drain.** It waits `DRAIN_SECONDS`, then sends SIGTERM to blue with a 30 s grace. Nest's shutdown
   hooks let Fastify finish in-flight requests, and the outbox worker stops claiming rows.
7. **Prune** to the newest 5 images (plus whatever either colour runs), so rollbacks never need a rebuild.

Inside a colour, Caddy load-balances `least_conn` across replicas, health-checks each one every 5 s, and
retries a different replica when a connection fails. A crashed replica is skipped until Docker restarts
it.

**Running two versions at once is safe for this codebase.** The outbox claims rows with
`FOR UPDATE SKIP LOCKED`, the 60 s watchdogs take Redis locks (`watchdog:*`), and delayed jobs go through
QStash. During the overlap, old and new containers share work instead of doing it twice. That relies on
real Upstash credentials: with in-memory fallbacks, each container has its own lock store.

### Database migrations: expand → contract

Both versions talk to the same database for a short while, and a rollback runs the old code against the
new schema. So each migration must work with the code **before and after** it:

| Change | Release 1 (expand) | Release 2 (contract, after release 1 is stable) |
|---|---|---|
| Add column | add it nullable or with a default | start requiring it in code |
| Rename column | add new column, write both, backfill | read new only, drop old |
| Drop column/table | stop using it in code | drop it |
| New NOT NULL | add with default / backfill | add constraint `NOT VALID`, then `VALIDATE` |
| Index | `create index concurrently` (own migration, no transaction) | |

With `RUN_DB_MIGRATIONS=true`, the `migrate` job runs `supabase db push` **before** the new code goes
live. If it fails, nothing is deployed. Before enabling it, run `supabase migration list --db-url …`
once to confirm the remote history matches `api/supabase/migrations`. A database that was set up from
`full_schema_and_seed.sql` by hand has no migration history, and `db push` would try to re-apply
everything. Leave it off and keep running `supabase db push` by hand until the history is aligned.

## 6. Day-2 operations (from the browser)

**Actions → API · ops → Run workflow**:

| Action | Use it when |
|---|---|
| `status` | Check what is live, container health, release history, disk/RAM. |
| `rollback` | A bad release got through. With `release` blank it goes to the previous release; you can also give any tag from `status`. Takes about 30 s, blue-green, no rebuild. |
| `redeploy` | You edited `API_ENV_FILE` or a variable (replicas, memory). Re-releases the current image with the new config, blue-green. |
| `logs` | Shows recent API logs. Refused while the repo is public. |

To deploy an older commit: **API · deploy → Run workflow → ref = `<sha or tag>`**. To pause deploys,
disable the *API · deploy* workflow (… menu) and pushes will stop releasing.

The same scripts work in a shell on the box as the `deploy` user: `deploy/scripts/status.sh`,
`rollback.sh [tag]`, `deploy.sh --image-tag <tag>` from the runner checkout at
`/opt/actions-runner/_work/bocardo_apps/bocardo_apps`.

## 7. Getting a shell when port 22 is blocked

From most to least convenient:

1. **Tailscale (recommended).** Re-run bootstrap with `TAILSCALE_AUTHKEY=tskey-auth-…` (from
   login.tailscale.com → Settings → Keys), install Tailscale on your laptop, then
   `ssh deploy@bocardo-<hostname>`. Traffic is WireGuard and falls back to HTTPS relays, so college
   firewalls don't stop it, and you can later close port 22 to the internet entirely.
2. **Alternate SSH port.** `ssh -p 2222 deploy@<ip>`. This works if your network only blocks 22.
3. **Provider web console.** Always works, and is your recovery path if a firewall change locks you out.
4. **No shell at all.** The `API · ops` workflow covers status, rollback, redeploy and logs.

## 8. Scaling

**Vertical (one box):** raise `API_REPLICAS` (about 1 per vCPU) and resize the VPS. Watch the database
connections:

```
peak connections = API_REPLICAS × DATABASE_POOL_MAX × 2   (×2: both colours are up during a release)
```

Keep that under your Supabase pooler's client limit (Supavisor transaction mode on port 6543 multiplexes
these onto a few real Postgres connections). For example, 4 replicas × 10 × 2 = 80.

**Horizontal (several boxes)**, when one VPS is not enough or you want no single point of failure:

1. Bootstrap a second VPS with a runner label `bocardo-prod-2`
   (`RUNNER_LABELS=bocardo-prod-2 bash install-runner.sh …`).
2. Put a load balancer in front, such as Hetzner/DO Load Balancer or Cloudflare Load Balancing, with a
   health check on `/health/ready`, and point DNS at the LB. With an L4 (TCP passthrough) LB, each box
   keeps its own Caddy certificate. With an L7 LB that terminates TLS, have Caddy listen on `:80` behind it.
3. Turn the `deploy` job into a matrix over the labels with `max-parallel: 1`. Each box does its own
   blue-green release in turn, so one box always serves while the other switches.

Because every bit of state lives in Supabase/Upstash, nothing else changes. Past about 3 boxes, move
the image build to CI (build once → push to GHCR → `docker pull` on each box) rather than building on
every server.

## 9. Monitoring and backups

* **Uptime:** add a check on `https://api.bocardo.in/health/ready` (UptimeRobot / Better Stack, free
  tiers) with alerts to your phone. A 503 means the database is unreachable.
* **Logs:** `docker logs bocardo-<colour>-api-1` (JSON, rotated at 5×10 MB per container);
  `docker logs bocardo-caddy` for access logs. For retention or search, ship them with Vector/Promtail to
  Better Stack, Grafana Cloud or Axiom.
* **Releases:** every response carries `X-Bocardo-Release`, and `state/releases.log` records who released
  what and when.
* **Backups:** the VPS holds no business data. Supabase backs up Postgres. If the box dies, bootstrap a new
  one, set DNS, and re-run the deploy. The only thing worth keeping is the `bocardo-edge_caddy_data`
  volume (TLS certificates), and Caddy simply re-issues them if it is lost.

## 10. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Deploy job stuck at "Waiting for a runner" | The runner is offline: run `sudo systemctl status 'actions.runner.*'` in the console, or re-run `install-runner.sh` with a fresh token. |
| `crashed during startup` | Usually env validation. The job prints the container logs, e.g. `Invalid environment configuration: RAZORPAY_KEY_ID: required in production`. Fix `API_ENV_FILE`, then re-run. Nothing went live. |
| `/health/ready fails` | Wrong `DATABASE_URL`, or Supabase is paused (free projects pause after inactivity). |
| `public check failed` on the first release | DNS isn't pointing at the VPS yet, or ports 80/443 are blocked at the provider's firewall (Hetzner/AWS security groups, in addition to `ufw`). See `docker logs bocardo-caddy`. |
| Build killed / exit 137 | Out of memory while building. Check that swap is on (`swapon --show`) or resize to 4 GB. |
| Disk filling up | `docker system df`. The deploy prunes old images and week-old build cache; `docker builder prune -af` clears everything (the next build is slower). |
| Brief blip when `deploy/compose/edge.compose.yml` changes | Changing Caddy's container (image version or ports) recreates it, about 1–2 s. Caddyfile edits are hot-reloaded with no blip. Ship edge changes at a quiet hour. |
| Need to stop everything | `docker stop $(docker ps -q --filter label=app.bocardo.color)` stops the API; Caddy then returns 502. |
