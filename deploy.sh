#!/usr/bin/env bash
#
# Suq deployment.
#
# Mounts Suq beside the existing YeneShop installation at /suq. It owns a
# separate service, database, web root and API port; it never replaces the
# YeneShop site or process.
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
BASE_PATH="/suq"
APP_URL="https://${DOMAIN}${BASE_PATH}"
PEM="${SUQ_PEM:-${YENESHOP_PEM:-$HOME/.ssh/yeneshop.pem}}"

REMOTE_DIR="/opt/suq"
SERVICE="suq"
API_PORT="8081"
WEB_ROOT="/var/www/yeneshop/suq"
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

  [ -f "$PEM" ] || die "key not found at $PEM (override with SUQ_PEM=...)"

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

  # A first deploy receives the one-time YeneShop key through the process
  # environment and writes it only to the remote .env. Later deploys keep that
  # remote file authoritative, so the secret never has to live in the repo.
  if ssh_run "test -f $REMOTE_DIR/.env"; then
    (cd "$LOCAL_ROOT/server" && \
      YENESHOP_API_KEY=ysk_live_deploy_validation_only_000000000000 npm run check:config >/dev/null) || \
      die "server/.env is invalid"
  else
    [ -n "${SUQ_YENESHOP_API_KEY:-}" ] || \
      die "first deploy requires SUQ_YENESHOP_API_KEY"
    (cd "$LOCAL_ROOT/server" && \
      YENESHOP_API_KEY="$SUQ_YENESHOP_API_KEY" npm run check:config >/dev/null) || \
      die "server/.env is invalid"
  fi
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
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='suq'" | grep -q 1; then
  log "database role already exists"
else
  log "creating database role and database"
  sudo -u postgres psql -qc "CREATE ROLE suq LOGIN PASSWORD '\$DB_PASSWORD'"
  sudo -u postgres createdb -O suq suq
  # Remember it so the app's .env can be generated below.
  install -m 600 /dev/null /root/.suq-db-password
  printf '%s' "\$DB_PASSWORD" > /root/.suq-db-password
fi

# --- directories ---
# data/ holds uploaded receipts and is deliberately outside server/, which
# every deploy replaces with rsync --delete.
mkdir -p "\$APP_DIR" "\$APP_DIR/assets" "\$APP_DIR/data/receipts" "\$APP_DIR/data/backups" "$WEB_ROOT"
# The deploying account owns the tree so rsync needs no sudo.
chown -R "$SSH_USER":"$SSH_USER" "\$APP_DIR" "$WEB_ROOT"
chmod 700 "\$APP_DIR/data/receipts" "\$APP_DIR/data/backups"

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
  db_password="$(ssh_run "sudo cat /root/.suq-db-password 2>/dev/null || true")"
  [ -n "$db_password" ] || die "database password not found on server; re-run to bootstrap it"

  local tmp
  tmp="$(mktemp)"

  # Rewrite the values that differ in production and quote anything containing
  # spaces — systemd's EnvironmentFile parser would otherwise truncate at the
  # first space (PRODUCT_SYNC_CRON is the one that bites). Use a dedicated file
  # descriptor instead of redirecting the compound loop: some managed shells
  # emit startup diagnostics on stdout, and those must never enter an env file.
  exec 3>"$tmp"
  while IFS= read -r line; do
    case "$line" in
      '#'*|'') printf '%s\n' "$line" >&3 ;;
      DATABASE_URL=*)
        printf 'DATABASE_URL=postgresql://suq:%s@127.0.0.1:5432/suq?schema=public\n' "$db_password" >&3 ;;
      WEB_APP_ORIGINS=*)  printf 'WEB_APP_ORIGINS=https://%s\n' "$DOMAIN" >&3 ;;
      WEB_APP_URL=*)      printf 'WEB_APP_URL=%s/\n' "$APP_URL" >&3 ;;
      WEB_API_PORT=*)     printf 'WEB_API_PORT=%s\n' "$API_PORT" >&3 ;;
      YENESHOP_API_KEY=*) printf 'YENESHOP_API_KEY=%s\n' "$SUQ_YENESHOP_API_KEY" >&3 ;;
      NODE_ENV=*)         printf 'NODE_ENV=production\n' >&3 ;;
      LOG_LEVEL=*)        printf 'LOG_LEVEL=info\n' >&3 ;;
      *)
        local key="${line%%=*}" value="${line#*=}"
        case "$value" in
          *' '*) printf '%s="%s"\n' "$key" "$value" >&3 ;;
          *)     printf '%s\n' "$line" >&3 ;;
        esac ;;
    esac
  done < "$LOCAL_ROOT/server/.env"
  exec 3>&-

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

  VITE_BASE_PATH="$BASE_PATH/" npm run build
  cd "$LOCAL_ROOT"
  ok "webapp built"
}

validate_webapp_build() {
  local index="$LOCAL_ROOT/webapp/dist/index.html"

  [ -f "$index" ] || die "webapp/dist is missing — build the web app before deploying"
  grep -qE '(src|href)="/suq/assets/' "$index" || \
    die "webapp build does not target /suq/ — rebuild with VITE_BASE_PATH=/suq/"
}

ship() {
  step "Uploading"

  local rsync_opts=(-az --delete --exclude node_modules --exclude dist --exclude .env)

  rsync "${rsync_opts[@]}" -e "ssh -i $PEM -o StrictHostKeyChecking=accept-new" \
    "$LOCAL_ROOT/server/" "${SSH_USER}@${HOST}:${REMOTE_DIR}/server/"
  ok "server source"

  # Deliberately no --delete: logos uploaded from the admin panel live in this
  # directory and exist only on the server, so mirroring the local copy would
  # wipe every product whose artwork was added after the last checkout.
  rsync -az -e "ssh -i $PEM -o StrictHostKeyChecking=accept-new" \
    "$LOCAL_ROOT/assets/" "${SSH_USER}@${HOST}:${REMOTE_DIR}/assets/"
  ok "product logos"

  rsync -az --delete -e "ssh -i $PEM -o StrictHostKeyChecking=accept-new" \
    "$LOCAL_ROOT/webapp/dist/" "${SSH_USER}@${HOST}:$WEB_ROOT/"
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
Description=Suq Telegram bot and web API
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
  step "Nginx sub-application"

  ssh_script <<REMOTE
set -euo pipefail

SITE="/etc/nginx/sites-available/yeneshop"
SNIPPET_DIR="/etc/nginx/snippets/yeneshop-apps"
SNIPPET="\$SNIPPET_DIR/suq.conf"
INCLUDE_LINE="include /etc/nginx/snippets/yeneshop-apps/*.conf;"

test -f "\$SITE" || {
  echo "YeneShop nginx site is missing at \$SITE; deploy YeneShop first" >&2
  exit 1
}

mkdir -p "\$SNIPPET_DIR"

cat > "\$SNIPPET" <<'CONF'
# Suq is an independent service mounted beside YeneShop.
location = /suq {
    return 308 /suq/;
}

location ^~ /suq/assets/ {
    root /var/www/yeneshop;
    expires 1y;
    add_header Cache-Control "public, immutable";
}

location ^~ /suq/fonts/ {
    root /var/www/yeneshop;
    expires 1y;
    add_header Cache-Control "public, immutable";
}

location ^~ /suq/logos/ {
    alias /opt/suq/assets/logos/;
    expires 7d;
    add_header Cache-Control "public";
}

location ^~ /suq/api/admin/backups {
    client_max_body_size 1024M;
    proxy_pass http://127.0.0.1:8081/api/admin/backups;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_request_buffering off;
    proxy_buffering off;
    proxy_read_timeout 660s;
    proxy_send_timeout 660s;
}

location ^~ /suq/api/ {
    proxy_pass http://127.0.0.1:8081/api/;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 60s;
}

location = /suq/index.html {
    root /var/www/yeneshop;
    add_header Cache-Control "no-cache";
}

location ^~ /suq/ {
    root /var/www/yeneshop;
    try_files \$uri \$uri/ /suq/index.html;
}
CONF

# Current production may predate the extension point. Add it once inside the
# existing YeneShop server block; future YeneShop deploys preserve this line.
if ! grep -Fq "\$INCLUDE_LINE" "\$SITE"; then
  # Insert only in the first (HTTPS) server block. The site also has an HTTP
  # redirect block with the same server_name, where location snippets are not
  # useful and can create duplicate-location errors.
  sed -i "0,/server_name $DOMAIN;/{/server_name $DOMAIN;/a\\    \$INCLUDE_LINE
}" "\$SITE"
fi

nginx -t
systemctl reload nginx
REMOTE

  ok "mounted Suq at $APP_URL without replacing YeneShop's site"
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
  api="$(ssh_run "curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:$API_PORT/api/health" || true)"
  [ "$api" = "200" ] && ok "API health check passed" || warn "API health check returned $api"

  local site
  site="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$APP_URL/" || true)"
  if [ "$site" = "200" ]; then
    ok "$APP_URL is serving the web app"
  else
    site="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "http://$DOMAIN$BASE_PATH/" || true)"
    [ "$site" = "200" ] && warn "http://$DOMAIN$BASE_PATH works but HTTPS does not yet" \
                        || warn "the site returned $site"
  fi
}

summary() {
  printf '\n%s──────────────────────────────────────────────%s\n' "$DIM" "$RESET"
  printf '%sDeployed%s  %s\n' "$BOLD" "$RESET" "$APP_URL"
  printf '\n'
  printf '  logs     ./deploy.sh --logs\n'
  printf '  status   ./deploy.sh --status\n'
  printf '\n'
  printf '%sOne bot token cannot poll from two places.%s\n' "$YELLOW" "$RESET"
  printf 'Stop any local instance, or Telegram will 409 and updates will be split.\n'
  printf '\n'
  printf 'Set the Mini App URL with @BotFather:  %s\n' "$APP_URL"
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
validate_webapp_build
ship
install_app
install_service
configure_nginx
verify
summary
