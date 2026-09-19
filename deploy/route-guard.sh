#!/usr/bin/env bash
#
# Keeps /awsmepplt routed on the shared edge.
#
# Installed by scripts/deploy/push.mjs and run from cron every minute.
#
# ---------------------------------------------------------------------------
# Why this exists
# ---------------------------------------------------------------------------
#
# The edge's route directory, /opt/aws/edge/apps, is reconciled by
# /opt/aws/sync-infra.sh against a published infrastructure image. Anything in
# that directory the image does not carry is deleted and nginx reloaded:
#
#   for f in /opt/aws/edge/apps/*.conf; do
#     [ -e "$STAGING/edge/apps/$(basename "$f")" ] || rm -f "$f"
#   done
#
# That is correct behaviour for infrastructure the image owns - a route
# deleted in git should stop existing here. But this application is deployed
# from its own repository and is not in that image, so its route was being
# deleted minutes after each deploy, taking the site to a bare nginx 404 while
# every other application kept serving. It happened on 2026-09-18 at 12:45 and
# again at 13:12, both logged as "removed route awsmepplt.conf".
#
# The alternative fix is to put the route in the infrastructure repository.
# That was declined deliberately: this project is meant to deploy on its own,
# without a second repository having to be changed in step with it. So it
# defends its own route instead.
#
# ---------------------------------------------------------------------------
# What it does
# ---------------------------------------------------------------------------
#
# Compares the installed route with this project's copy and reinstalls it if
# it is missing or has been changed, then reloads - never restarts - the edge.
# A reload with a bad configuration leaves the working one serving; a restart
# would take every application on the port down at once.
#
# Three passes twenty seconds apart, because cron's finest resolution is a
# minute and the gap between the sync deleting the route and this putting it
# back is downtime. Twenty seconds of it is tolerable; sixty is not.
#
# Silent when there is nothing to do. Only real repairs are logged, so a
# non-empty log is a list of times this actually saved the site.
set -uo pipefail

SOURCE=/opt/aws/mepplms/awsmepplt.conf
TARGET=/opt/aws/edge/apps/awsmepplt.conf
EDGE=aws-edge-nginx-1
LOG=/opt/aws/mepplms/route-guard.log
LOCK=/tmp/mepplms-route-guard.lock

log() { printf '%s  %s\n' "$(date -Is)" "$*" >> "$LOG"; }

# One at a time. Two copies racing would reload the edge twice for one repair.
exec 9>"$LOCK"
flock -n 9 || exit 0

[ -r "$SOURCE" ] || { log "no route to install at $SOURCE - deploy has not run here"; exit 1; }

repair() {
  cmp -s "$SOURCE" "$TARGET" 2>/dev/null && return 0

  reason=$([ -e "$TARGET" ] && echo "differed" || echo "was missing")

  install -m 644 "$SOURCE" "${TARGET}.incoming" && mv -f "${TARGET}.incoming" "$TARGET" || {
    log "FAILED to write $TARGET"
    rm -f "${TARGET}.incoming"
    return 1
  }

  # Checked before reloading, for the same reason sync-infra.sh checks: a
  # reload is refused wholesale, so a bad file here would leave the edge
  # running its previous configuration and this script reporting success.
  if ! docker exec "$EDGE" nginx -t >/dev/null 2>&1; then
    log "the edge refused the configuration - route NOT reloaded, CHECK THIS"
    return 1
  fi

  docker exec "$EDGE" nginx -s reload >/dev/null 2>&1
  log "route $reason; reinstalled and the edge reloaded"
}

for pass in 1 2 3; do
  repair
  [ "$pass" = 3 ] || sleep 20
done

exit 0
