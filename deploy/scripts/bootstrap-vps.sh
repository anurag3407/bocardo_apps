#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 22.04/24.04 (or Debian 12) VPS. Run as root, from the provider's
# web console if port 22 is blocked on your network:
#
#   curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/main/deploy/scripts/bootstrap-vps.sh -o bootstrap.sh
#   sudo GH_REPO_URL=https://github.com/<owner>/<repo> GH_RUNNER_TOKEN=<token> bash bootstrap.sh
#
# Optional env:
#   GH_REPO_URL + GH_RUNNER_TOKEN  also install the GitHub Actions runner (see install-runner.sh)
#   SSH_ALT_PORT=2222              extra sshd port for networks that block 22 (0 disables)
#   TAILSCALE_AUTHKEY=tskey-...    join your tailnet with Tailscale SSH (works through any firewall)
#   DEPLOY_USER=deploy             user that owns /opt/bocardo and runs the runner
#   BOCARDO_HOME=/opt/bocardo
# Safe to re-run.
set -Eeuo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"
BOCARDO_HOME="${BOCARDO_HOME:-/opt/bocardo}"
SSH_ALT_PORT="${SSH_ALT_PORT:-2222}"

log() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
[[ $EUID -eq 0 ]] || { echo "run as root (sudo)" >&2; exit 1; }
export DEBIAN_FRONTEND=noninteractive

log "packages"
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl git jq ufw fail2ban unattended-upgrades util-linux
dpkg-reconfigure -f noninteractive unattended-upgrades

log "docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
mkdir -p /etc/docker
if [[ ! -f /etc/docker/daemon.json ]]; then
  # live-restore keeps containers serving while dockerd itself restarts or upgrades
  cat >/etc/docker/daemon.json <<'EOF'
{
  "live-restore": true,
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" },
  "features": { "buildkit": true }
}
EOF
  systemctl restart docker
fi
systemctl enable --now docker

log "deploy user ($DEPLOY_USER)"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"
home="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$home/.ssh"
for src in /root/.ssh/authorized_keys "/home/${SUDO_USER:-}/.ssh/authorized_keys"; do
  if [[ -s "$src" && ! -s "$home/.ssh/authorized_keys" ]]; then
    install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$src" "$home/.ssh/authorized_keys"
  fi
done

log "directories under $BOCARDO_HOME"
install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$BOCARDO_HOME"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$BOCARDO_HOME/shared"
install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$BOCARDO_HOME/state" "$BOCARDO_HOME/caddy" "$BOCARDO_HOME/caddy/upstreams"
docker network inspect bocardo_edge >/dev/null 2>&1 || docker network create bocardo_edge >/dev/null

log "swap and kernel limits"
mem_mb=$(($(awk '/MemTotal/ {print $2}' /proc/meminfo) / 1024))
if [[ -z "$(swapon --show --noheadings)" && $mem_mb -lt 8192 ]]; then
  # building the image next to the live API needs headroom on small boxes
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi
cat >/etc/sysctl.d/90-bocardo.conf <<'EOF'
vm.swappiness = 10
net.core.somaxconn = 4096
net.ipv4.tcp_max_syn_backlog = 4096
net.ipv4.ip_local_port_range = 10240 65535
fs.file-max = 1048576
EOF
sysctl --system >/dev/null

log "ssh"
if [[ "$SSH_ALT_PORT" != 0 ]]; then
  cat >/etc/ssh/sshd_config.d/10-bocardo.conf <<EOF
Port 22
Port $SSH_ALT_PORT
EOF
fi
# only turn passwords off once a key is in place, so this can never lock you out
if [[ -s "$home/.ssh/authorized_keys" || -s /root/.ssh/authorized_keys ]]; then
  cat >/etc/ssh/sshd_config.d/20-bocardo-keys.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
fi
sshd -t
if systemctl is-active --quiet ssh.socket; then
  # Ubuntu 22.10+ socket-activates sshd; ports come from the socket unit generated at daemon-reload
  systemctl daemon-reload
  systemctl restart ssh.socket
else
  systemctl restart ssh 2>/dev/null || systemctl restart sshd
fi

log "firewall"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
[[ "$SSH_ALT_PORT" != 0 ]] && ufw allow "$SSH_ALT_PORT/tcp"
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
systemctl enable --now fail2ban

if [[ -n "${TAILSCALE_AUTHKEY:-}" ]]; then
  log "tailscale"
  command -v tailscale >/dev/null || curl -fsSL https://tailscale.com/install.sh | sh
  tailscale up --ssh --authkey "$TAILSCALE_AUTHKEY" --hostname "bocardo-$(hostname -s)"
fi

if [[ -n "${GH_REPO_URL:-}" && -n "${GH_RUNNER_TOKEN:-}" ]]; then
  log "github actions runner"
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [[ -f "$script_dir/install-runner.sh" ]]; then
    DEPLOY_USER="$DEPLOY_USER" bash "$script_dir/install-runner.sh" "$GH_REPO_URL" "$GH_RUNNER_TOKEN"
  else
    curl -fsSL "${GH_REPO_URL/github.com/raw.githubusercontent.com}/main/deploy/scripts/install-runner.sh" -o /tmp/install-runner.sh
    DEPLOY_USER="$DEPLOY_USER" bash /tmp/install-runner.sh "$GH_REPO_URL" "$GH_RUNNER_TOKEN"
  fi
fi

log "done"
cat <<EOF
Docker      : $(docker --version)
Deploy user : $DEPLOY_USER (in the docker group)
Config dir  : $BOCARDO_HOME
SSH ports   : 22$([[ "$SSH_ALT_PORT" != 0 ]] && echo " and $SSH_ALT_PORT")
Firewall    : $(ufw status | head -1)

Next: set the GitHub secrets/variables from docs/deployment-vps.md and push to main.
EOF
