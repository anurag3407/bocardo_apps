#!/usr/bin/env bash
# Zero-downtime blue-green release of the Bocardo API on this host.
#
#   deploy.sh [--sha <git sha>]     build api/ from this checkout on the VPS and release it
#   deploy.sh --image-tag <tag>     release an image already on this host (rollback / redeploy)
#
# build → start the idle colour → wait until every replica is healthy and ready →
# point Caddy at it → verify through Caddy → drain and stop the old colour.
# The live colour keeps serving until the new one has passed every check; any failure
# before the switch leaves it untouched, and a failure after the switch reverts Caddy.
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

SHA=""
TAG=""
while (($#)); do
  case "$1" in
    --sha) SHA="${2:?--sha needs a value}"; shift 2 ;;
    --image-tag) TAG="${2:?--image-tag needs a value}"; shift 2 ;;
    -h | --help) sed -n '2,10p' "$0"; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

PHASE=init
LIVE=none
NEXT=none

on_exit() {
  local status=$?
  [[ $status -eq 0 || "$PHASE" == released ]] && return
  case "$PHASE" in
    starting)
      group "logs of failed $NEXT containers"
      for c in $(color_containers "$NEXT" -a); do
        echo "── $c"
        docker logs --tail 60 "$c" 2>&1 || true
      done
      endgroup
      stop_color "$NEXT" 0
      warn "release aborted before the switch; $LIVE ($(release_of "$LIVE")) is still serving"
      ;;
    switched)
      if [[ -f "$UPSTREAM_FILE.prev" ]]; then
        mv -f "$UPSTREAM_FILE.prev" "$UPSTREAM_FILE"
        caddy_reload >/dev/null 2>&1 || true
        warn "traffic switched back to $LIVE ($(release_of "$LIVE"))"
      fi
      stop_color "$NEXT" 0
      ;;
  esac
}
trap on_exit EXIT

stop_color() {
  local color="$1" grace="${2:-30}" names
  names="$(color_containers "$color")"
  [[ -n "$names" ]] || return 0
  log "stopping $color: $(echo $names)"
  # shellcheck disable=SC2086
  docker stop -t "$grace" $names >/dev/null
}

build_image() {
  local tag="$1" sha="$2"
  if docker image inspect "$IMAGE:$tag" >/dev/null 2>&1; then
    log "image $IMAGE:$tag already built; reusing it"
    return
  fi
  group "docker build $IMAGE:$tag"
  DOCKER_BUILDKIT=1 docker build \
    --pull \
    --build-arg "GIT_SHA=$sha" \
    --label "app.bocardo.sha=$sha" \
    --tag "$IMAGE:$tag" \
    "$REPO_ROOT/api"
  endgroup
}

render_caddyfile() {
  [[ "$API_DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || die "API_DOMAIN '$API_DOMAIN' is not a hostname"
  [[ "$ACME_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+$ ]] || die "ACME_EMAIL '$ACME_EMAIL' is not an email"
  sed -e "s/__API_DOMAIN__/$API_DOMAIN/g" -e "s/__ACME_EMAIL__/$ACME_EMAIL/g" "$CADDY_TEMPLATE"
}

# Network, Caddy config and the Caddy container. Idempotent; changes reload without downtime.
ensure_edge() {
  docker network inspect "$EDGE_NETWORK" >/dev/null 2>&1 || docker network create "$EDGE_NETWORK" >/dev/null
  if [[ ! -f "$UPSTREAM_FILE" ]]; then
    printf 'respond "Bocardo API is starting" 503\n' >"$UPSTREAM_FILE"
  fi

  render_caddyfile >"$CADDY_DIR/Caddyfile.next"
  if ! cmp -s "$CADDY_DIR/Caddyfile.next" "$CADDY_DIR/Caddyfile" 2>/dev/null; then
    if caddy_running; then
      docker exec "$CADDY_CONTAINER" caddy validate --config /etc/caddy/Caddyfile.next --adapter caddyfile >/dev/null ||
        die "the new Caddyfile does not validate; nothing was changed"
      mv -f "$CADDY_DIR/Caddyfile.next" "$CADDY_DIR/Caddyfile"
      caddy_reload
      log "Caddyfile updated and reloaded"
    else
      mv -f "$CADDY_DIR/Caddyfile.next" "$CADDY_DIR/Caddyfile"
    fi
  else
    rm -f "$CADDY_DIR/Caddyfile.next"
  fi

  docker compose -p bocardo-edge -f "$EDGE_COMPOSE" up -d --remove-orphans
}

# Every replica must be running, Docker-healthy and answer /health/ready (database reachable).
wait_ready() {
  local color="$1" deadline=$((SECONDS + READY_TIMEOUT)) c state
  local -a names
  mapfile -t names < <(color_containers "$color" -a)
  ((${#names[@]} == API_REPLICAS)) || die "expected $API_REPLICAS $color containers, found ${#names[@]}"

  for c in "${names[@]}"; do
    while :; do
      # status health restarts
      state="$(docker inspect -f '{{.State.Status}} {{.State.Health.Status}} {{.RestartCount}}' "$c")"
      read -r status health restarts <<<"$state"
      [[ "$health" == healthy ]] && break
      [[ "$status" == running && "$restarts" == 0 ]] || die "$c crashed during startup ($state)"
      [[ "$health" != unhealthy ]] || die "$c reported unhealthy"
      ((SECONDS < deadline)) || die "$c not healthy after ${READY_TIMEOUT}s ($state)"
      sleep 2
    done
    docker exec "$c" wget -qO- -T 5 "http://127.0.0.1:$API_PORT/health/ready" >/dev/null ||
      die "$c is up but /health/ready fails (database unreachable?)"
    log "$c healthy and ready"
  done
}

write_upstream() {
  local color="$1" tag="$2" targets="" c
  for c in $(color_containers "$color"); do targets+=" $c:$API_PORT"; done
  [[ -n "$targets" ]] || die "no running $color containers to route to"
  cat >"$UPSTREAM_FILE.next" <<EOF
# Generated by deploy/scripts/deploy.sh at $(date -u +%FT%TZ). Do not edit.
reverse_proxy$targets {
	lb_policy least_conn
	# retry another replica when one is unreachable (connection errors only; bodies are never replayed)
	lb_try_duration 5s
	lb_try_interval 250ms
	health_uri /health
	health_interval 5s
	health_timeout 2s
	fail_duration 30s
	max_fails 3
}
header X-Bocardo-Release "$color-$tag"
EOF
  [[ -f "$UPSTREAM_FILE" ]] && cp -f "$UPSTREAM_FILE" "$UPSTREAM_FILE.prev"
  mv -f "$UPSTREAM_FILE.next" "$UPSTREAM_FILE"
}

# Through Caddy over TLS, exactly like a phone would, and confirm the new release answered.
verify_public() {
  local expect="$1" headers code release i
  for i in $(seq 1 15); do
    headers="$(curl -sS -o /dev/null -D - --max-time 5 \
      --resolve "$API_DOMAIN:443:127.0.0.1" "https://$API_DOMAIN/health/ready" 2>/dev/null | tr -d '\r')" || true
    code="$(awk 'NR==1 {print $2}' <<<"$headers")"
    release="$(awk -F': ' 'tolower($1)=="x-bocardo-release" {print $2}' <<<"$headers")"
    if [[ "$code" == 200 && "$release" == "$expect" ]]; then
      log "https://$API_DOMAIN serves $release"
      return 0
    fi
    sleep 2
  done
  warn "public check failed: status=${code:-none} release=${release:-none} (expected $expect)"
  return 1
}

record_release() {
  local color="$1" tag="$2"
  echo "$tag" >"$STATE_DIR/release-$color"
  echo "$color" >"$STATE_DIR/active_color.tmp" && mv -f "$STATE_DIR/active_color.tmp" "$STATE_DIR/active_color"
  printf '%s %s %s %s\n' "$(date -u +%FT%TZ)" "$color" "$tag" "${GITHUB_ACTOR:-$(id -un)}" >>"$STATE_DIR/releases.log"
}

# Keep the newest $KEEP_IMAGES images (plus whatever either colour runs) so rollbacks stay instant.
prune_images() {
  local keep_blue keep_green tag n=0
  keep_blue="$(release_of blue)"
  keep_green="$(release_of green)"
  while read -r tag; do
    n=$((n + 1))
    [[ $n -le $KEEP_IMAGES || "$tag" == "$keep_blue" || "$tag" == "$keep_green" ]] && continue
    docker rmi "$IMAGE:$tag" >/dev/null 2>&1 && log "pruned $IMAGE:$tag" || true
  done < <(docker image ls "$IMAGE" --format '{{.CreatedAt}}\t{{.Tag}}' | sort -r | cut -f2)
  docker image prune -f >/dev/null || true
  docker builder prune -f --filter until=168h >/dev/null 2>&1 || true
}

# ── main ───────────────────────────────────────────────
load_config
take_lock

if [[ -z "$TAG" ]]; then
  SHA="${SHA:-$(git -C "$REPO_ROOT" rev-parse HEAD)}"
  TAG="${SHA:0:12}"
  PHASE=build
  build_image "$TAG" "$SHA"
else
  docker image inspect "$IMAGE:$TAG" >/dev/null 2>&1 || die "image $IMAGE:$TAG is not on this host"
fi

ensure_edge

LIVE="$(active_color)"
NEXT="$(idle_color "$LIVE")"
log "live: $LIVE ($(release_of "$LIVE"))  →  releasing $TAG on $NEXT × $API_REPLICAS"

PHASE=starting
group "start $NEXT"
compose_api "$NEXT" "$TAG" up -d --no-build --force-recreate --remove-orphans --scale "api=$API_REPLICAS"
endgroup
wait_ready "$NEXT"

PHASE=switched
write_upstream "$NEXT" "$TAG"
caddy_reload || die "caddy rejected the new upstream config"
log "traffic → $NEXT"

if ! verify_public "$NEXT-$TAG"; then
  # a brand-new box may still be waiting for its first TLS certificate; nothing to fall back to anyway
  [[ "$LIVE" == none ]] || die "new release is not reachable through Caddy"
  warn "first release: check DNS for $API_DOMAIN and 'docker logs $CADDY_CONTAINER' for the certificate"
fi

record_release "$NEXT" "$TAG"
rm -f "$UPSTREAM_FILE.prev"
PHASE=released

if [[ "$LIVE" != none ]]; then
  log "draining $LIVE for ${DRAIN_SECONDS}s"
  sleep "$DRAIN_SECONDS"
  stop_color "$LIVE" 30
fi

prune_images
log "released $TAG on $NEXT — https://$API_DOMAIN"
