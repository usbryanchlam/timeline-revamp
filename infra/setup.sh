#!/usr/bin/env bash
set -euo pipefail

# Phase 8 (D-04, D-12) bootstrap script for a fresh OCI Ampere A1 VM.
# Adapted from /Users/bryanlam/Workspaces/mykb/infra/setup.sh; the
# host-installed package set swaps node/pnpm/pm2/caddy for
# docker.io/docker-compose-plugin/nginx/certbot, and the repo path is
# /opt/timeline-revamp owned by ubuntu (the OCI Ubuntu default user).
#
# Run from the VM (curl-pipe or git-clone form, see infra/DEPLOY.md
# "Initial VM Setup"):
#   curl -fsSL https://raw.githubusercontent.com/usbryanchlam/timeline-revamp/main/infra/setup.sh | sudo bash
# or:
#   git clone https://github.com/usbryanchlam/timeline-revamp.git /opt/timeline-revamp
#   sudo bash /opt/timeline-revamp/infra/setup.sh
#
# Idempotent: re-running on the same VM is safe (git clone step detects
# existing .git/ and skips; iptables -I duplicates are filtered by
# netfilter-persistent at save time).

echo "==> Updating system packages..."
sudo apt-get update && sudo apt-get upgrade -y

echo "==> Installing Docker, Compose plugin, Nginx, certbot, iptables-persistent, git..."
sudo apt-get install -y \
    docker.io \
    docker-compose-plugin \
    nginx \
    certbot \
    python3-certbot-nginx \
    iptables-persistent \
    git

echo "==> Adding ubuntu to docker group (logout/login required to take effect)..."
sudo usermod -aG docker ubuntu

echo "==> Opening firewall ports (80, 443)..."
# Insert at position 6 so the rules sit ABOVE the OCI Ubuntu base image's
# default deny-all rule. The position number mirrors the mykb pattern;
# verify on the VM with: sudo iptables -L INPUT -n --line-numbers
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save

echo "==> Setting timezone to UTC..."
sudo timedatectl set-timezone UTC

echo "==> Creating app directory at /opt/timeline-revamp..."
sudo mkdir -p /opt/timeline-revamp
sudo chown ubuntu:ubuntu /opt/timeline-revamp

echo "==> Cloning repository..."
if [ ! -d /opt/timeline-revamp/.git ]; then
    git clone https://github.com/usbryanchlam/timeline-revamp.git /opt/timeline-revamp
else
    echo "    Repository already cloned, skipping."
fi

echo "==> Preparing OCI credentials directory..."
mkdir -p /opt/timeline-revamp/.oci
chmod 700 /opt/timeline-revamp/.oci

echo ""
echo "==> Setup complete!"
echo ""
echo "Next steps (full runbook: infra/DEPLOY.md):"
echo "  1. Log out and back in so the docker group takes effect."
echo "  2. scp .env from local laptop to /opt/timeline-revamp/.env on the VM."
echo "  3. scp the OCI PEM to /opt/timeline-revamp/.oci/timeline-revamp.pem."
echo "  4. chmod 600 /opt/timeline-revamp/.env /opt/timeline-revamp/.oci/timeline-revamp.pem"
echo "  5. Update the Auth0 dashboard with the production callback URL."
echo "  6. cd /opt/timeline-revamp && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build"
echo "  7. Wait-for-healthy loop: curl -sf http://127.0.0.1:8787/api/health | grep -q '\"db\":\"ok\"'"
echo "  8. docker compose -f docker-compose.yml -f docker-compose.prod.yml exec api bun run db:migrate"
echo "  9. Symlink ops/nginx/timeline.conf into /etc/nginx/conf.d/ (08-02)."
echo " 10. sudo nginx -t && sudo systemctl reload nginx (08-02)."
echo " 11. sudo certbot --nginx -d timeline.bryanlam.dev (08-02)."
echo " 12. Pre-DNS curl --resolve smoke test (08-03)."
echo " 13. Update DNS A record to the VM's reserved public IP (08-03)."
echo "    Then run the full smoke battery."
