#!/usr/bin/env bash
# What is live, how healthy it is, and what can be rolled back to.
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_config

live="$(active_color)"
echo "live colour : $live"
echo "release     : $(release_of "$live")"
echo "domain      : https://$API_DOMAIN"
echo

echo "── containers"
docker ps -a --filter "label=com.docker.compose.service=api" --filter "label=app.bocardo.color" \
  --format 'table {{.Names}}\t{{.Status}}\t{{.Label "app.bocardo.release"}}'
docker ps -a --filter "name=^${CADDY_CONTAINER}$" --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}' | tail -n +2
echo

echo "── public health"
curl -sS --max-time 5 --resolve "$API_DOMAIN:443:127.0.0.1" -D - "https://$API_DOMAIN/health/ready" 2>&1 |
  tr -d '\r' | grep -iE '^(HTTP/|x-bocardo-release)|database' || echo "unreachable"
echo

echo "── recent releases (newest first)"
tail -n 10 "$STATE_DIR/releases.log" 2>/dev/null | tac || echo "none"
echo

echo "── images available for instant rollback"
docker image ls "$IMAGE" --format 'table {{.Tag}}\t{{.CreatedSince}}\t{{.Size}}'
echo

echo "── host"
uptime
free -h | head -2
df -h / | tail -1
docker system df
