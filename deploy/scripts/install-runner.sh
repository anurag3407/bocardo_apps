#!/usr/bin/env bash
# Installs a GitHub Actions self-hosted runner as a systemd service running as $DEPLOY_USER.
# The runner dials OUT to github.com over HTTPS (443) and long-polls for jobs, so the VPS needs no
# inbound port for deploys and nothing ever SSHes into it.
#
#   sudo bash install-runner.sh https://github.com/<owner>/<repo> <registration-token>
#
# Token: repo → Settings → Actions → Runners → New self-hosted runner (valid for 1 hour).
# Re-running replaces the existing registration.
set -Eeuo pipefail

REPO_URL="${1:?usage: install-runner.sh <repo-url> <registration-token>}"
TOKEN="${2:?usage: install-runner.sh <repo-url> <registration-token>}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
RUNNER_DIR="${RUNNER_DIR:-/opt/actions-runner}"
RUNNER_LABELS="${RUNNER_LABELS:-bocardo-prod}"
RUNNER_NAME="${RUNNER_NAME:-$(hostname -s)-bocardo}"

[[ $EUID -eq 0 ]] || { echo "run as root (sudo)" >&2; exit 1; }
id "$DEPLOY_USER" >/dev/null 2>&1 || { echo "user $DEPLOY_USER does not exist; run bootstrap-vps.sh first" >&2; exit 1; }

case "$(uname -m)" in
  x86_64) arch=x64 ;;
  aarch64 | arm64) arch=arm64 ;;
  *) echo "unsupported architecture $(uname -m)" >&2; exit 1 ;;
esac

version="$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest | jq -r .tag_name)"
version="${version#v}"
[[ "$version" =~ ^[0-9.]+$ ]] || { echo "could not resolve the runner version" >&2; exit 1; }

install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$RUNNER_DIR"
cd "$RUNNER_DIR"

if [[ -f .runner ]]; then
  # --replace below takes over the old registration on GitHub; only the local service needs to go
  echo "removing the previous runner service"
  ./svc.sh stop || true
  ./svc.sh uninstall || true
  rm -f .runner .credentials .credentials_rsaparams
fi

if [[ ! -x ./config.sh || "$(cat .bocardo-runner-version 2>/dev/null)" != "$version" ]]; then
  echo "downloading actions-runner $version ($arch)"
  curl -fsSL -o runner.tgz \
    "https://github.com/actions/runner/releases/download/v$version/actions-runner-linux-$arch-$version.tar.gz"
  tar xzf runner.tgz && rm -f runner.tgz
  echo "$version" >.bocardo-runner-version
  chown -R "$DEPLOY_USER:$DEPLOY_USER" "$RUNNER_DIR"
  ./bin/installdependencies.sh
fi

sudo -u "$DEPLOY_USER" ./config.sh \
  --unattended \
  --replace \
  --url "$REPO_URL" \
  --token "$TOKEN" \
  --name "$RUNNER_NAME" \
  --labels "$RUNNER_LABELS" \
  --work _work

./svc.sh install "$DEPLOY_USER"
./svc.sh start
./svc.sh status | head -5

echo "runner '$RUNNER_NAME' online with labels: self-hosted, linux, $RUNNER_LABELS"
