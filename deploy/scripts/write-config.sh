#!/usr/bin/env bash
# Writes the host config from GitHub secrets/variables, so nobody has to SSH in to edit files.
#
#   API_ENV_FILE    (secret)   full contents of the API's .env; skipped when empty, keeping the file on disk
#   SUPABASE_SEND_SMS_HOOK_SECRET, DEV_OTP_WEBHOOK_URL, FIREBASE_SERVICE_ACCOUNT_BASE64 (secrets, optional) upserted into api.env
#   API_DOMAIN      (variable) e.g. api.bocardo.in — must resolve to this VPS
#   ACME_EMAIL      (variable) Let's Encrypt account email
#   API_REPLICAS, API_MEMORY_LIMIT, API_CPUS, API_HEAP_MB, DRAIN_SECONDS   (variables, optional)
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

: "${API_DOMAIN:?set the API_DOMAIN repository variable}"
: "${ACME_EMAIL:?set the ACME_EMAIL repository variable}"

mkdir -p "$SHARED_DIR" "$STATE_DIR"
umask 077

if [[ -n "${API_ENV_FILE:-}" ]]; then
  # strip CRLF from values pasted on Windows/macOS editors
  printf '%s\n' "$API_ENV_FILE" | tr -d '\r' >"$SHARED_DIR/api.env.tmp"
  mv -f "$SHARED_DIR/api.env.tmp" "$SHARED_DIR/api.env"
  log "api.env updated from the API_ENV_FILE secret"
elif [[ -s "$SHARED_DIR/api.env" ]]; then
  log "API_ENV_FILE secret is empty; keeping the existing api.env"
else
  die "no API env: add the API_ENV_FILE secret (contents of a production api/.env)"
fi

# Operator-managed values travel as their own small secrets, so nobody has to re-paste the whole
# env file just to rotate the SMS hook secret. Empty secrets leave the existing value untouched.
apply_secret() {
  local key="$1" value="$2" tmp="$SHARED_DIR/api.env.merge"
  [[ -z "$value" ]] && return 0
  grep -v "^${key}=" "$SHARED_DIR/api.env" >"$tmp" || true
  printf '%s=%s\n' "$key" "$value" >>"$tmp"
  mv -f "$tmp" "$SHARED_DIR/api.env"
}
apply_secret SUPABASE_SEND_SMS_HOOK_SECRET "${SUPABASE_SEND_SMS_HOOK_SECRET:-}"
apply_secret DEV_OTP_WEBHOOK_URL "${DEV_OTP_WEBHOOK_URL:-}"
apply_secret FIREBASE_SERVICE_ACCOUNT_BASE64 "${FIREBASE_SERVICE_ACCOUNT_BASE64:-}"

public_url="$(sed -n 's/^API_PUBLIC_URL=//p' "$SHARED_DIR/api.env" | tail -1 | tr -d "\"'")"
if [[ "$public_url" != "https://$API_DOMAIN" ]]; then
  warn "API_PUBLIC_URL is '$public_url' but API_DOMAIN is '$API_DOMAIN'; QStash callbacks go to API_PUBLIC_URL"
fi

cat >"$SHARED_DIR/deploy.env.tmp" <<EOF
# Written by deploy/scripts/write-config.sh from repository variables. Edits here are overwritten.
API_DOMAIN=$API_DOMAIN
ACME_EMAIL=$ACME_EMAIL
API_REPLICAS=${API_REPLICAS:-2}
API_MEMORY_LIMIT=${API_MEMORY_LIMIT:-512m}
API_CPUS=${API_CPUS:-1.0}
API_HEAP_MB=${API_HEAP_MB:-384}
DRAIN_SECONDS=${DRAIN_SECONDS:-15}
EOF
mv -f "$SHARED_DIR/deploy.env.tmp" "$SHARED_DIR/deploy.env"
log "deploy.env written (domain $API_DOMAIN, ${API_REPLICAS:-2} replicas)"
