#!/usr/bin/env bash
#
# YeneShop deployment.
#
# One script for both cases: on a fresh server it installs and configures
# everything, on an existing one it only ships new code and restarts. Every
# step is written to be safe to re-run.
#
#   ./deploy.sh              deploy (setup or update, whichever is needed)
#   ./deploy.sh --logs       tail the running service
#   ./deploy.sh --status     show what is running on the server
#   ./deploy.sh --skip-build reuse the existing webapp build
#
set -euo pipefail

# ---------------------------------------------------------------- settings ---

HOST="16.16.104.36"
DOMAIN="yeneshop.amixmon.com"
PEM="${YENESHOP_PEM:-$HOME/.ssh/yeneshop.pem}"
# Used by Let's Encrypt for expiry warnings.
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-ermimini10@gmail.com}"

REMOTE_DIR="/opt/yeneshop"
SERVICE="yeneshop"
NODE_MAJOR="22"

LOCAL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ----------------------------------------------------------------- helpers ---

BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RESET=$'\033[0m'

step() { printf '\n%s==> %s%s\n' "$BOLD" "$1" "$RESET"; }
info() { printf '    %s\n' "$1"; }
ok()   { printf '    %s✓%s %s\n' "$GREEN" "$RESET" "$1"; }
warn() { printf '    %s!%s %s\n' "$YELLOW" "$RESET" "$1"; }
die()  { printf '\n%serror:%s %s\n\n' "$RED" "$RESET" "$1" >&2; exit 1; }

SSH_USER=""

ssh_run() {
  ssh -i "$PEM" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 \
      "${SSH_USER}@${HOST}" "$@"
}

# Runs a script read from stdin on the server, as root.
ssh_script() {
  ssh -i "$PEM" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 \
      "${SSH_USER}@${HOST}" "sudo bash -s"
}

# ---------------------------------------------------------------- preflight ---

preflight() {
  step "Preflight"

  [ -f "$PEM" ] || die "key not found at $PEM (override with YENESHOP_PEM=...)"

  # ssh refuses to use a key that others can read.
  local perms
  perms="$(stat -c '%a' "$PEM")"
  if [ "$perms" != "400" ] && [ "$perms" != "600" ]; then
    chmod 400 "$PEM"
    ok "tightened key permissions ($perms → 400)"
  else
    ok "key permissions are $perms"
  fi

  for tool in ssh rsync npm; do
    command -v "$tool" >/dev/null || die "$tool is required locally but not installed"
  done

  # AMIs differ in their default account; find the one that works.
  step "Connecting to $HOST"
  for candidate in ubuntu ec2-user admin debian root; do
    if ssh -i "$PEM" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 \
           -o BatchMode=yes "${candidate}@${HOST}" true 2>/dev/null; then
      SSH_USER="$candidate"
      break
    fi
  done

  [ -n "$SSH_USER" ] || die "could not log in to $HOST with $PEM (tried ubuntu, ec2-user, admin, debian, root)"
  ok "connected as $SSH_USER"

  local os
  os="$(ssh_run '. /etc/os-release && echo "$PRETTY_NAME"')"
  ok "remote OS: $os"

  [ -f "$LOCAL_ROOT/server/.env" ] || die "server/.env not found — it is the source of the deployed configuration"
}

# --------------------------------------------------- remote system bootstrap ---

bootstrap_system() {
  step "Server setup (installs only what is missing)"

  # A password is only generated on the very first deploy; afterwards the
  # server's own .env stays authoritative.
  local db_password
  db_password="$(openssl rand -hex 24)"

  ssh_script <<REMOTE
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

APP_DIR="$REMOTE_DIR"
DB_PASSWORD="$db_password"
NODE_MAJOR="$NODE_MAJOR"

log() { printf '    %s\n' "\$1"; }

# --- packages ---
MISSING=""
for pkg in nginx postgresql redis-server rsync ufw certbot python3-certbot-nginx; do
  dpkg -s "\$pkg" >/dev/null 2>&1 || MISSING="\$MISSING \$pkg"
done

if [ -n "\$MISSING" ]; then
  log "installing:\$MISSING"
  apt-get update -qq
  apt-get install -y -qq \$MISSING >/dev/null
else
  log "system packages already present"
fi

# --- node ---
node_major() { node -v 2>/dev/null | cut -c2- | cut -d. -f1; }

if ! command -v node >/dev/null || [ "\$(node_major)" -lt "\$NODE_MAJOR" ]; then
  # Try the distribution's own package first: on recent Ubuntu it is already
  # new enough, and NodeSource may not publish a repo for a fresh release yet.
  log "installing Node from the distribution"
  apt-get install -y -qq nodejs npm >/dev/null 2>&1 || true

  if ! command -v node >/dev/null || [ "\$(node_major)" -lt "\$NODE_MAJOR" ]; then
    log "distribution Node is missing or too old, using NodeSource"
    curl -fsSL "https://deb.nodesource.com/setup_\${NODE_MAJOR}.x" | bash - >/dev/null 2>&1
    apt-get install -y -qq nodejs >/dev/null
  fi
fi

command -v node >/dev/null || { echo "could not install Node" >&2; exit 1; }
[ "\$(node_major)" -ge 20 ] || { echo "Node \$(node -v) is too old; 20+ required" >&2; exit 1; }
log "node \$(node -v), npm \$(npm -v)"

# --- services ---
systemctl enable --now postgresql >/dev/null 2>&1 || true
systemctl enable --now redis-server >/dev/null 2>&1 || true
systemctl enable --now nginx >/dev/null 2>&1 || true

# --- database (created once, never reset) ---
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='yeneshop'" | grep -q 1; then
  log "database role already exists"
else
  log "creating database role and database"
  sudo -u postgres psql -qc "CREATE ROLE yeneshop LOGIN PASSWORD '\$DB_PASSWORD'"
  sudo -u postgres createdb -O yeneshop yeneshop
  # Remember it so the app's .env can be generated below.
  install -m 600 /dev/null /root/.yeneshop-db-password
  printf '%s' "\$DB_PASSWORD" > /root/.yeneshop-db-password
fi

# --- directories ---
mkdir -p "\$APP_DIR" "\$APP_DIR/assets" /var/www/yeneshop
# The deploying account owns the tree so rsync needs no sudo.
chown -R "$SSH_USER":"$SSH_USER" "\$APP_DIR" /var/www/yeneshop

# --- firewall (only if already enabled; do not lock anyone out) ---
if ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow 'Nginx Full' >/dev/null 2>&1 || true
fi
REMOTE

  ok "system ready"
}

# ------------------------------------------------------------ configuration ---

push_env() {
  step "Configuration"

  if ssh_run "test -f $REMOTE_DIR/.env"; then
    ok "server already has .env — leaving it untouched"
    return
  fi

  info "first deploy: generating .env from server/.env"

  local db_password
  db_password="$(ssh_run "sudo cat /root/.yeneshop-db-password 2>/dev/null || true")"
  [ -n "$db_password" ] || die "database password not found on server; re-run to bootstrap it"

  local tmp
  tmp="$(mktemp)"

  # Rewrite the values that differ in production and quote anything containing
  # spaces — systemd's EnvironmentFile parser would otherwise truncate at the
  # first space (PRODUCT_SYNC_CRON is the one that bites).
  while IFS= read -r line; do
    case "$line" in
      '#'*|'') printf '%s\n' "$line" ;;
      DATABASE_URL=*)
        printf 'DATABASE_URL=postgresql://yeneshop:%s@127.0.0.1:5432/yeneshop?schema=public\n' "$db_password" ;;
      WEB_APP_ORIGINS=*)  printf 'WEB_APP_ORIGINS=https://%s\n' "$DOMAIN" ;;
      NODE_ENV=*)         printf 'NODE_ENV=production\n' ;;
      LOG_LEVEL=*)        printf 'LOG_LEVEL=info\n' ;;
      *)
        local key="${line%%=*}" value="${line#*=}"
        case "$value" in
          *' '*) printf '%s="%s"\n' "$key" "$value" ;;
          *)     printf '%s\n' "$line" ;;
        esac ;;
    esac
  done < "$LOCAL_ROOT/server/.env" > "$tmp"

  scp -q -i "$PEM" "$tmp" "${SSH_USER}@${HOST}:${REMOTE_DIR}/.env"
  ssh_run "chmod 600 $REMOTE_DIR/.env"
  rm -f "$tmp"

  ok "wrote $REMOTE_DIR/.env (DATABASE_URL and origins rewritten for production)"
}

# ------------------------------------------------------------------ shipping ---

build_webapp() {
  step "Building web app"

  cd "$LOCAL_ROOT/webapp"
  [ -d node_modules ] || npm ci --no-audit --no-fund

  # Fonts are build inputs, not sources; regenerate if absent.
  [ -f public/fonts/SchriftedSans-Regular.woff2 ] || npm run fonts:build

  npm run build
  cd "$LOCAL_ROOT"
  ok "webapp built"
}

ship() {
  step "Uploading"

  local rsync_opts=(-az --delete --exclude node_modules --exclude dist --exclude .env)

  rsync "${rsync_opts[@]}" -e "ssh -i $PEM -o StrictHostKeyChecking=accept-new" \
    "$LOCAL_ROOT/server/" "${SSH_USER}@${HOST}:${REMOTE_DIR}/server/"
  ok "server source"

  rsync -az --delete -e "ssh -i $PEM -o StrictHostKeyChecking=accept-new" \
    "$LOCAL_ROOT/assets/" "${SSH_USER}@${HOST}:${REMOTE_DIR}/assets/"
  ok "product logos"

  rsync -az --delete -e "ssh -i $PEM -o StrictHostKeyChecking=accept-new" \
    "$LOCAL_ROOT/webapp/dist/" "${SSH_USER}@${HOST}:/var/www/yeneshop/"
  ok "web app"
}

# --------------------------------------------------------------- application ---

install_app() {
  step "Installing dependencies and migrating"

  ssh_run "bash -s" <<REMOTE
set -euo pipefail
cd "$REMOTE_DIR/server"

# The app reads its configuration from the environment; prisma's CLI needs it
# in the shell too.
set -a; . "$REMOTE_DIR/.env"; set +a

# Full install, including devDependencies: the Prisma CLI and TypeScript are
# both needed to produce a runnable build, and installing with --omit=dev
# leaves Prisma's own dependency tree incomplete (it fails on empathic/package).
# The tree is left in place rather than pruned afterwards, because pruning also
# removes the generated Prisma client from node_modules/.prisma.
# NODE_ENV comes from .env as "production", and npm silently skips
# devDependencies in that case — which is exactly what breaks the build.
NODE_ENV=development npm ci --include=dev --no-audit --no-fund 2>&1 | tail -1

npx prisma generate 2>&1 | tail -1
npx prisma migrate deploy 2>&1 | tail -2
npm run build 2>&1 | tail -3

test -f dist/index.js || { echo "build produced no dist/index.js" >&2; exit 1; }
REMOTE

  ok "application installed"
}

install_service() {
  step "Service"

  ssh_script <<REMOTE
set -euo pipefail

cat > /etc/systemd/system/$SERVICE.service <<'UNIT'
[Unit]
Description=YeneShop Telegram bot and web API
After=network-online.target postgresql.service redis-server.service
Wants=network-online.target

[Service]
Type=simple
User=$SSH_USER
WorkingDirectory=$REMOTE_DIR/server
EnvironmentFile=$REMOTE_DIR/.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
# Telegram DNS can be briefly unavailable at boot; do not give up on it.
StartLimitBurst=0
StandardOutput=journal
StandardError=journal
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable $SERVICE >/dev/null 2>&1
systemctl restart $SERVICE
REMOTE

  ok "$SERVICE restarted"
}

# --------------------------------------------------------------------- nginx ---

configure_nginx() {
  step "Nginx"

  ssh_script <<REMOTE
set -euo pipefail

# Written without TLS directives; configure_tls re-applies the certificate
# afterwards. This file is regenerated on every deploy so config changes ship,
# which means certbot's edits are lost here and must be restored there.
cat > /etc/nginx/sites-available/yeneshop <<'CONF'
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    root /var/www/yeneshop;
    index index.html;

    # Uploaded receipts are base64 in a JSON body; the API caps them at 5MB.
    client_max_body_size 12M;

    gzip on;
    gzip_types text/css application/javascript image/svg+xml application/json;
    gzip_min_length 1024;

    # Hashed filenames, so they can be cached indefinitely.
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location /fonts/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Served straight from disk rather than through node.
    location /logos/ {
        alias $REMOTE_DIR/assets/logos/;
        expires 7d;
        add_header Cache-Control "public";
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }

    # Single-page app: unknown paths return the shell, not a 404.
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
CONF

ln -sf /etc/nginx/sites-available/yeneshop /etc/nginx/sites-enabled/yeneshop
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl reload nginx
REMOTE

  ok "nginx configured for $DOMAIN"
}

configure_tls() {
  step "TLS certificate"

  if ssh_run "sudo test -d /etc/letsencrypt/live/$DOMAIN"; then
    # configure_nginx rewrote the site file from scratch, which removes the
    # listen 443 / ssl_certificate lines certbot had added. Re-install the
    # existing certificate into the fresh config rather than requesting a new
    # one — issuing is rate-limited, installing is not.
    info "certificate exists; re-applying it to the regenerated nginx config"

    ssh_script <<REMOTE
set -euo pipefail
certbot install --nginx --cert-name "$DOMAIN" --redirect --non-interactive
systemctl reload nginx
REMOTE

    ok "certificate re-applied (renewal runs from certbot's timer)"
    return
  fi

  info "requesting a certificate from Let's Encrypt for $DOMAIN"
  info "this needs the domain's DNS to already point at $HOST, and port 80 open"

  if ssh_script <<REMOTE
set -euo pipefail
certbot --nginx -d "$DOMAIN" \
  --non-interactive --agree-tos -m "$LETSENCRYPT_EMAIL" \
  --redirect
systemctl reload nginx
REMOTE
  then
    ok "certificate issued, HTTP now redirects to HTTPS"
  else
    warn "certbot failed — the site will still serve over plain HTTP"
    warn "check that DNS for $DOMAIN resolves to $HOST and that port 80 is open in the security group"
    warn "then re-run: ./deploy.sh"
  fi
}

# -------------------------------------------------------------------- verify ---

verify() {
  step "Verifying"

  sleep 3

  local state
  state="$(ssh_run "systemctl is-active $SERVICE" || true)"
  if [ "$state" = "active" ]; then
    ok "service is $state"
  else
    warn "service is $state"
    ssh_run "sudo journalctl -u $SERVICE -n 30 --no-pager" || true
    die "the service did not start; see the log above"
  fi

  local api
  api="$(ssh_run "curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:8080/api/health" || true)"
  [ "$api" = "200" ] && ok "API health check passed" || warn "API health check returned $api"

  local site
  site="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://$DOMAIN/" || true)"
  if [ "$site" = "200" ]; then
    ok "https://$DOMAIN is serving the web app"
  else
    site="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "http://$DOMAIN/" || true)"
    [ "$site" = "200" ] && warn "http://$DOMAIN works but HTTPS does not yet" \
                        || warn "the site returned $site"
  fi
}

summary() {
  printf '\n%s──────────────────────────────────────────────%s\n' "$DIM" "$RESET"
  printf '%sDeployed%s  https://%s\n' "$BOLD" "$RESET" "$DOMAIN"
  printf '\n'
  printf '  logs     ./deploy.sh --logs\n'
  printf '  status   ./deploy.sh --status\n'
  printf '\n'
  printf '%sOne bot token cannot poll from two places.%s\n' "$YELLOW" "$RESET"
  printf 'Stop any local instance, or Telegram will 409 and updates will be split.\n'
  printf '\n'
  printf 'Set the Mini App URL with @BotFather:  https://%s\n' "$DOMAIN"
  printf '%s──────────────────────────────────────────────%s\n\n' "$DIM" "$RESET"
}

# ---------------------------------------------------------------------- main ---

SKIP_BUILD=0

case "${1:-}" in
  --logs)
    preflight >/dev/null
    ssh_run "sudo journalctl -u $SERVICE -f --no-pager"
    exit 0 ;;
  --status)
    preflight >/dev/null
    ssh_run "systemctl status $SERVICE --no-pager -l | head -20; echo; \
             echo 'nginx:'; systemctl is-active nginx; \
             echo 'postgres:'; systemctl is-active postgresql; \
             echo 'redis:'; systemctl is-active redis-server; \
             echo; echo 'certificate:'; sudo certbot certificates 2>/dev/null | grep -E 'Domains|Expiry' || echo '  none'"
    exit 0 ;;
  --skip-build) SKIP_BUILD=1 ;;
  '') ;;
  *) die "unknown option: $1" ;;
esac

preflight
bootstrap_system
push_env
[ "$SKIP_BUILD" -eq 1 ] || build_webapp
ship
install_app
install_service
configure_nginx
configure_tls
verify
summary
