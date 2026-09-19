#!/usr/bin/env bash
#
# Deploy the Pipeline Tracker, run ON AWS-App from a checkout of this
# repository.
#
#   bash deploy/server-deploy.sh [--no-build]
#
# Both ways of deploying end up here: the CI workflow runs it on the
# self-hosted runner after checking out the commit, and scripts/deploy/push.mjs
# runs it over ssh after uploading the working tree. One script, so the two
# paths cannot drift into deploying differently - which matters most for the
# edge route and the route guard, the parts that are easy to leave out and
# invisible until the site is down.
#
# Everything it touches: /opt/aws/mepplms, the single file
# /opt/aws/edge/apps/awsmepplt.conf, and one line of this account's crontab.
# The platform's own files - docker-compose.app.yml, the rest of the edge -
# are left alone.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET=/opt/aws/mepplms
EDGE_CONF=/opt/aws/edge/apps/awsmepplt.conf
EDGE=aws-edge-nginx-1
BASE_PATH=/awsmepplt
PUBLIC_HOST=ralsnahashho.dyndns.org

step() { printf '\n--- %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[ "$(id -un)" != root ] || die "run this as the account that owns /opt/aws, not root"
command -v docker >/dev/null || die "docker is not available to $(id -un)"

# ---------------------------------------------------------------- environment
#
# The runtime environment is NOT written from here, and that is deliberate: it
# holds the database password and the session secret, and keeping it on the
# server means neither has to exist in GitHub for the workflow to deploy. It is
# written once by scripts/deploy/push.mjs and then persists across every
# deploy, CI or manual.
#
# AUTH_SECRET in particular must survive: regenerating it would invalidate
# every signed session cookie and sign out everyone who happened to be working.
[ -s "$TARGET/.env" ] || die "$TARGET/.env is missing - run 'npm run deploy' once from a workstation to write it"

step "sync source"
mkdir -p "$TARGET/src"
if [ "$SRC" = "$TARGET/src" ]; then
  # Already in place: this is the manual path, which uploads the working tree
  # straight to its final home and then runs this script out of it. Copying a
  # directory onto itself with --delete would empty it mid-deploy.
  echo "  already in $TARGET/src"
elif command -v rsync >/dev/null; then
  rsync -a --delete \
    --exclude .git --exclude node_modules --exclude .next --exclude ui-shots \
    "$SRC"/ "$TARGET/src"/
else
  rm -rf "$TARGET/src"
  mkdir -p "$TARGET/src"
  tar -C "$SRC" --exclude=.git --exclude=node_modules --exclude=.next --exclude=ui-shots -cf - . \
    | tar -C "$TARGET/src" -xf -
fi
cp -f "$SRC/deploy/docker-compose.yml" "$TARGET/docker-compose.yml"

# The commit being deployed, compiled into the image and served by
# /api/version. Taken from the checkout when there is one - CI always has one,
# the manual path uploads a tree without .git - and otherwise left unknown
# rather than guessed at.
APP_COMMIT="${APP_COMMIT:-${GITHUB_SHA:-$(git -C "$SRC" rev-parse HEAD 2>/dev/null || echo unknown)}}"
APP_BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export APP_COMMIT APP_BUILT_AT
echo "  commit: $APP_COMMIT"

if [ "${1:-}" != "--no-build" ]; then
  step "build image"
  ( cd "$TARGET" && docker compose build )
fi

step "start container"
( cd "$TARGET" && docker compose up -d )

step "install edge route"
#
# Retire any earlier prefix first. The base path is compiled into the image, so
# after a rename the old location still proxies here and still answers - with
# HTML whose every asset 404s, which is worse than a clean 404. Matched on the
# upstream rather than a remembered filename, so it keeps working however many
# times the prefix changes and touches no other application's config.
grep -l 'mepplms:3000' /opt/aws/edge/apps/*.conf 2>/dev/null \
  | grep -vx "$EDGE_CONF" \
  | xargs -r rm -f --
cp -f "$SRC/deploy/awsmepplt.conf" "$EDGE_CONF"
chmod 644 "$EDGE_CONF"

docker exec "$EDGE" nginx -t >/dev/null 2>&1 || die "nginx rejected the configuration; it was NOT reloaded"
docker exec "$EDGE" nginx -s reload
echo "  route installed and the edge reloaded"

step "install route guard"
#
# The route does not stay installed on its own: sync-infra.sh reconciles
# /opt/aws/edge/apps against the platform's infrastructure image and deletes
# anything that image does not carry. The guard puts our route back. See
# deploy/route-guard.sh for the whole story.
cp -f "$SRC/deploy/awsmepplt.conf" "$TARGET/awsmepplt.conf"
install -m 755 "$SRC/deploy/route-guard.sh" "$TARGET/route-guard.sh"

# Rewritten through a filter rather than appended to, so a hundred deploys
# leave one line. Every other entry is preserved.
( crontab -l 2>/dev/null | grep -v 'mepplms/route-guard.sh' || true
  echo "* * * * * $TARGET/route-guard.sh >/dev/null 2>&1" ) | crontab -
[ "$(crontab -l | grep -c 'route-guard.sh')" = 1 ] || die "could not install the route guard in cron"
echo "  guard installed"

step "verify"
#
# From the server's own vantage point, which is not the public one: this host
# cannot reach its own public address, because the name resolves to the
# external IP and nothing routes it back in. These are the two hops it can see.
# The public address is checked by whoever triggered the deploy.
app=$(docker exec mepplms node -e \
  "fetch('http://127.0.0.1:3000$BASE_PATH/login').then(r=>console.log(r.status)).catch(e=>console.log(e.code||'unreachable'))")
echo "  app:  $app"

edge_addr=$(docker port "$EDGE" 1000 | head -1)
edge=$(curl -sk -m 10 -o /dev/null -w '%{http_code}' -H "Host: $PUBLIC_HOST" "https://$edge_addr$BASE_PATH/login")
echo "  edge: $edge"
echo "  container: $(docker inspect -f '{{.State.Status}}' mepplms)"

# What the running container says it is, which is the only proof that the
# restart actually picked up this build rather than leaving the old one up.
running=$(docker exec mepplms node -e   "fetch('http://127.0.0.1:3000$BASE_PATH/api/version').then(r=>r.json()).then(v=>console.log(v.commit)).catch(()=>console.log('unreachable'))")
echo "  serving commit: $running"

[ "$edge" = 200 ] || die "the edge did not serve the application after the reload"
[ "$APP_COMMIT" = unknown ] || [ "$running" = "$APP_COMMIT" ]   || die "the container is serving $running, not $APP_COMMIT - the restart did not take"

printf '\nDeployed https://%s:1000%s\n' "$PUBLIC_HOST" "$BASE_PATH"
