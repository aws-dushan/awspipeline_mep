#!/usr/bin/env bash
#
# Install the GitHub Actions self-hosted runner that deploys this project.
#
#   sudo bash deploy/install-runner.sh <registration-token>
#
# The token comes from the repository page: Settings -> Actions -> Runners ->
# New self-hosted runner. It expires in an hour, it can enrol a runner and do
# nothing else, and it is not written to disk by this script.
#
# ---------------------------------------------------------------------------
# Why a runner at all, and why on this machine
# ---------------------------------------------------------------------------
#
# AWS-App accepts no inbound SSH. A hosted runner could build an image but
# could not reach the server to install it, so the only way a push can deploy
# is for the thing doing the deploying to already be inside. The runner polls
# github.com outbound, which the host can do.
#
# ---------------------------------------------------------------------------
# Why it runs as admin-app
# ---------------------------------------------------------------------------
#
# The deploy writes /opt/aws/mepplms, installs a file into /opt/aws/edge/apps
# and adds a line to the crontab that runs the route guard. All three belong
# to admin-app. The platform's own runner uses a dedicated `github-runner`
# account, which is the better pattern in general and the wrong one here: that
# account cannot write any of those paths, so every deploy would check out
# cleanly and then fail. Running as the owner is the honest arrangement for a
# runner whose entire job is to deploy this one application.
#
# This runner is registered to THIS repository only. It cannot be used by any
# other repository's workflows, including the platform's.
#
# Re-running is safe: it registers with --replace and stops any existing
# service first.
set -euo pipefail

REPO_URL="https://github.com/aws-dushan/awspipeline_mep"
RUNNER_USER="admin-app"
RUNNER_HOME="/home/admin-app/actions-runner"
RUNNER_VERSION="2.337.0"
LABELS="self-hosted,linux,x64,mepplms"
NAME="aws-app-mepplms"

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run this with sudo - registering the service needs root"
[ $# -ge 1 ] || die "usage: sudo $0 <registration-token>"
TOKEN="$1"

id "$RUNNER_USER" >/dev/null 2>&1 || die "$RUNNER_USER does not exist on this host"
id -nG "$RUNNER_USER" | tr ' ' '\n' | grep -qx docker \
  || die "$RUNNER_USER is not in the docker group; the deploy builds an image"

# Checked before anything changes. A runner that installs cleanly and then
# cannot reach the service it polls looks like a working install right up
# until the first job queues for ever.
curl -fsS -o /dev/null --max-time 20 https://github.com \
  || die "no egress to github.com from this host"

log "preparing $RUNNER_HOME"
install -d -o "$RUNNER_USER" -g "$RUNNER_USER" "$RUNNER_HOME"

TARBALL="actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
if [ ! -x "$RUNNER_HOME/config.sh" ]; then
  if [ ! -f "$RUNNER_HOME/$TARBALL" ]; then
    log "downloading runner $RUNNER_VERSION"
    curl -fsSL -o "$RUNNER_HOME/$TARBALL" \
      "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${TARBALL}"
  fi
  log "unpacking"
  tar -C "$RUNNER_HOME" -xzf "$RUNNER_HOME/$TARBALL"
  chown -R "$RUNNER_USER:$RUNNER_USER" "$RUNNER_HOME"
fi

# An existing service holds the working directory open and would fight the
# re-registration.
SERVICE="actions.runner.aws-dushan-awspipeline_mep.${NAME}.service"
if systemctl list-units --all --type=service 2>/dev/null | grep -q "$SERVICE"; then
  log "stopping the existing service"
  ( cd "$RUNNER_HOME" && sudo -u "$RUNNER_USER" ./svc.sh stop || true )
  ( cd "$RUNNER_HOME" && sudo -u "$RUNNER_USER" ./svc.sh uninstall || true )
fi

log "registering with $REPO_URL"
cd "$RUNNER_HOME"
sudo -u "$RUNNER_USER" ./config.sh \
  --unattended --replace \
  --url "$REPO_URL" \
  --token "$TOKEN" \
  --name "$NAME" \
  --labels "$LABELS" \
  --work _work

log "installing the service"
./svc.sh install "$RUNNER_USER"
./svc.sh start

sleep 3
systemctl is-active --quiet "$SERVICE" \
  && log "runner is running as $RUNNER_USER with labels: $LABELS" \
  || die "the service did not start; journalctl -u $SERVICE"

cat <<'NOTE'

Next: push to main, or run the Deploy workflow by hand from the Actions tab.
The runtime environment at /opt/aws/mepplms/.env is NOT created by CI - if
this is a fresh server, run `npm run deploy` once from a workstation first.
NOTE
