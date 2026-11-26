#!/usr/bin/env bash
# Copy a freshly built release APK onto the VPS release host, register it with the API, and verify both are live.
# Usage: publish-apk.sh <customer|restaurant|rider> <version> <versionCode> <apkPath> [force:true|false] [releaseNotes]
set -euo pipefail

APP="${1:?app required (customer|restaurant|rider)}"
VERSION="${2:?version required}"
VERSION_CODE="${3:?versionCode required}"
APK_PATH="${4:?apk path required}"
FORCE="${5:-false}"
RELEASE_NOTES="${6:-}"

case "$APP" in
  customer|restaurant|rider) ;;
  *) echo "error: invalid app '$APP'" >&2; exit 1 ;;
esac
[[ -f "$APK_PATH" ]] || { echo "error: APK not found at $APK_PATH" >&2; exit 1; }
[[ "$VERSION_CODE" =~ ^[0-9]+$ ]] || { echo "error: versionCode must be numeric" >&2; exit 1; }

# shellcheck source=lib.sh
source "$(dirname "$0")/lib.sh"
load_config

install -d -m 755 "$RELEASES_DIR"
FILE_NAME="bocardo-${APP}-${VERSION}.apk"
LATEST_NAME="bocardo-${APP}-latest.apk"
install -m 644 "$APK_PATH" "$RELEASES_DIR/$FILE_NAME"
install -m 644 "$APK_PATH" "$RELEASES_DIR/$LATEST_NAME"

# Keep only the newest 5 versioned APKs per app so VPS disk stays bounded
mapfile -t old_apks < <(ls -1t "$RELEASES_DIR"/bocardo-"${APP}"-[0-9]*.apk 2>/dev/null | tail -n +6 || true)
if (( ${#old_apks[@]} > 0 )); then
  rm -f "${old_apks[@]}"
fi

APK_URL="https://${API_DOMAIN}/releases/${FILE_NAME}"

SECRET_LINE="$(grep -E '^APP_SECRET=' "$SHARED_DIR/api.env" | tail -n1 || true)"
APP_SECRET="${SECRET_LINE#APP_SECRET=}"
APP_SECRET="${APP_SECRET%\"}"
APP_SECRET="${APP_SECRET#\"}"
APP_SECRET="${APP_SECRET%\'}"
APP_SECRET="${APP_SECRET#\'}"
[[ -n "$APP_SECRET" ]] || die "APP_SECRET missing from $SHARED_DIR/api.env"

PAYLOAD="$(node -e "
  const [app, version, vc, apkUrl, force, notes] = process.argv.slice(1);
  const body = { app, version, versionCode: Number(vc), apkUrl, force: force === 'true' };
  if (notes && notes.trim()) body.releaseNotes = notes.trim();
  process.stdout.write(JSON.stringify(body));
" "$APP" "$VERSION" "$VERSION_CODE" "$APK_URL" "$FORCE" "$RELEASE_NOTES")"

# Wait up to 240s in case a concurrent API · deploy is reloading Caddy or swapping containers
deadline=$((SECONDS + 240))
while (( SECONDS < deadline )); do
  if curl -fsI --resolve "${API_DOMAIN}:443:127.0.0.1" "$APK_URL" >/dev/null 2>&1; then
    break
  fi
  sleep 3
done
curl -fsI --resolve "${API_DOMAIN}:443:127.0.0.1" "$APK_URL" >/dev/null || die "APK not reachable at $APK_URL"

deadline=$((SECONDS + 240))
status=""
while (( SECONDS < deadline )); do
  status="$(curl -sS -o /tmp/publish-apk-resp.json -w '%{http_code}' \
    --resolve "${API_DOMAIN}:443:127.0.0.1" \
    -X POST "https://${API_DOMAIN}/internal/releases" \
    -H 'content-type: application/json' \
    -H "x-deploy-secret: ${APP_SECRET}" \
    -d "$PAYLOAD" || true)"
  if [[ "$status" == "200" || "$status" == "201" ]]; then
    break
  fi
  sleep 3
done
if [[ "$status" != "200" && "$status" != "201" ]]; then
  cat /tmp/publish-apk-resp.json >&2 || true
  die "POST /internal/releases failed with HTTP $status"
fi
rm -f /tmp/publish-apk-resp.json

# Verify live public /app-config endpoint returns the newly published version
cfg_json="$(curl -fsS --resolve "${API_DOMAIN}:443:127.0.0.1" "https://${API_DOMAIN}/app-config/${APP}")"
node -e "
  const cfg = JSON.parse(process.argv[1]);
  if (cfg.latestVersion !== process.argv[2] || cfg.apkUrl !== process.argv[3]) {
    console.error('app-config mismatch:', cfg);
    process.exit(1);
  }
" "$cfg_json" "$VERSION" "$APK_URL"

log "published ${APP} v${VERSION} (${VERSION_CODE}) -> ${APK_URL}"
