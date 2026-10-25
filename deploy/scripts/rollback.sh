#!/usr/bin/env bash
# Re-releases an earlier image through the same blue-green path (no rebuild, ~30 s, zero downtime).
#
#   rollback.sh            the release before the current one
#   rollback.sh <tag>      a specific release (see `status.sh` for the list)
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

target="${1:-}"
if [[ -z "$target" ]]; then
  current="$(release_of "$(active_color)")"
  [[ -f "$STATE_DIR/releases.log" ]] || die "no release history yet"
  target="$(awk '{print $3}' "$STATE_DIR/releases.log" | tac | awk -v cur="$current" '$0 != cur' | head -1)"
  [[ -n "$target" ]] || die "no earlier release than $current"
fi

docker image inspect "$IMAGE:$target" >/dev/null 2>&1 ||
  die "image $IMAGE:$target was pruned; redeploy that commit from the Actions tab instead"

log "rolling back to $target"
exec "$SCRIPT_DIR/deploy.sh" --image-tag "$target"
