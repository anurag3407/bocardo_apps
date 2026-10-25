# shellcheck shell=bash
# Shared helpers for the deploy scripts. Sourced, never executed directly.
# Host layout (created by bootstrap-vps.sh):
#   $BOCARDO_HOME/shared/api.env      API secrets (chmod 600), written from the API_ENV_FILE secret
#   $BOCARDO_HOME/shared/deploy.env   domain, replicas, limits; written from repository variables
#   $BOCARDO_HOME/state/              active colour, per-colour release, releases.log, deploy.lock
#   $BOCARDO_HOME/caddy/              rendered Caddyfile + upstreams/api.caddy (mounted into Caddy)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BOCARDO_HOME="${BOCARDO_HOME:-/opt/bocardo}"
export BOCARDO_HOME

SHARED_DIR="$BOCARDO_HOME/shared"
STATE_DIR="$BOCARDO_HOME/state"
CADDY_DIR="$BOCARDO_HOME/caddy"
UPSTREAM_FILE="$CADDY_DIR/upstreams/api.caddy"

IMAGE="bocardo-api"
API_PORT=4000
EDGE_NETWORK="bocardo_edge"
CADDY_CONTAINER="bocardo-caddy"
API_COMPOSE="$REPO_ROOT/deploy/compose/api.compose.yml"
EDGE_COMPOSE="$REPO_ROOT/deploy/compose/edge.compose.yml"
CADDY_TEMPLATE="$REPO_ROOT/deploy/caddy/Caddyfile"

log() { printf '%s  %s\n' "$(date -u +%H:%M:%S)" "$*"; }

warn() {
  if [[ "${GITHUB_ACTIONS:-}" == true ]]; then echo "::warning::$*"; else log "WARN: $*"; fi >&2
}

die() {
  if [[ "${GITHUB_ACTIONS:-}" == true ]]; then echo "::error::$*"; else log "ERROR: $*"; fi >&2
  exit 1
}

# Collapsible log sections in the Actions UI; plain headings elsewhere.
group() { if [[ "${GITHUB_ACTIONS:-}" == true ]]; then echo "::group::$*"; else log "── $*"; fi; }
endgroup() { if [[ "${GITHUB_ACTIONS:-}" == true ]]; then echo "::endgroup::"; fi; }

load_config() {
  [[ -f "$SHARED_DIR/deploy.env" ]] || die "missing $SHARED_DIR/deploy.env (run write-config.sh)"
  [[ -s "$SHARED_DIR/api.env" ]] || die "missing $SHARED_DIR/api.env (set the API_ENV_FILE secret)"
  set -a
  # shellcheck disable=SC1091
  source "$SHARED_DIR/deploy.env"
  set +a
  : "${API_DOMAIN:?API_DOMAIN is not set in deploy.env}"
  : "${ACME_EMAIL:?ACME_EMAIL is not set in deploy.env}"
  API_REPLICAS="${API_REPLICAS:-2}"
  DRAIN_SECONDS="${DRAIN_SECONDS:-15}"
  READY_TIMEOUT="${READY_TIMEOUT:-180}"
  KEEP_IMAGES="${KEEP_IMAGES:-5}"
  export API_MEMORY_LIMIT="${API_MEMORY_LIMIT:-512m}"
  export API_CPUS="${API_CPUS:-1.0}"
  export API_HEAP_MB="${API_HEAP_MB:-384}"
  [[ "$API_REPLICAS" =~ ^[1-9][0-9]*$ ]] || die "API_REPLICAS must be a positive integer"
  mkdir -p "$STATE_DIR" "$CADDY_DIR/upstreams"
}

# One deploy/rollback at a time, even if two workflows race.
take_lock() {
  exec 9>"$STATE_DIR/deploy.lock"
  if ! flock -n 9; then
    log "another deploy holds the lock; waiting (up to 15 min)"
    flock -w 900 9 || die "timed out waiting for the deploy lock"
  fi
}

active_color() { cat "$STATE_DIR/active_color" 2>/dev/null || echo none; }
idle_color() { [[ "$1" == blue ]] && echo green || echo blue; }
release_of() { cat "$STATE_DIR/release-$1" 2>/dev/null || echo none; }

# Containers of one colour, sorted by name. Pass "-a" to include stopped ones.
color_containers() {
  docker ps ${2:+"$2"} \
    --filter "label=com.docker.compose.project=bocardo-$1" \
    --filter "label=com.docker.compose.service=api" \
    --format '{{.Names}}' | sort
}

compose_api() {
  local color="$1" tag="$2"
  shift 2
  COLOR="$color" IMAGE_TAG="$tag" docker compose -p "bocardo-$color" -f "$API_COMPOSE" "$@"
}

caddy_running() {
  [[ "$(docker inspect -f '{{.State.Running}}' "$CADDY_CONTAINER" 2>/dev/null)" == true ]]
}

# Graceful: Caddy swaps config in place and lets in-flight requests finish. A freshly created
# Caddy container needs a moment before its admin endpoint answers, hence the retries.
caddy_reload() {
  local i
  for i in 1 2 3; do
    docker exec "$CADDY_CONTAINER" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile && return 0
    sleep 2
  done
  return 1
}
