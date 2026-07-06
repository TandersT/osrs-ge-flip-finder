#!/usr/bin/env bash
#
# Manage a persistent production server for the GE Flip Finder on this box.
#
# `npm start` serves the built app + API on one port (PORT, default 3000). Run
# straight from a terminal it dies when that terminal (or the SSH/VS Code
# session) closes. This wrapper daemonises it with `setsid` into its own
# session, so it keeps running after you disconnect, and tracks it with a PID
# file so it can be restarted/stopped cleanly.
#
# Usage: scripts/server.sh {start|stop|restart|status|logs [-f]}
#   restart  build, then (if the build succeeds) bounce the server — the one
#            you want after pulling changes. A failed build leaves the running
#            server untouched.
#   start    build, then launch (no-op with a note if already running)
#   stop     terminate the running server
#   status   is it up? PID, port, health probe
#   logs     print the tail of the server log ( -f to follow )
#
# No sudo, no extra dependencies. This does NOT survive a machine reboot — see
# the note at the bottom of the file for the systemd follow-up if you want that.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT/.run"
PID_FILE="$RUN_DIR/server.pid"
LOG_FILE="$RUN_DIR/server.log"

# The server reads PORT from .env itself; mirror that here for status/probe.
PORT="$(grep -E '^PORT=' "$ROOT/.env" 2>/dev/null | tail -1 | cut -d= -f2 | tr -d '[:space:]' || true)"
PORT="${PORT:-3000}"
URL="http://localhost:$PORT"

is_running() {
  [ -f "$PID_FILE" ] || return 1
  local pid
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

current_pid() { cat "$PID_FILE" 2>/dev/null || true; }

build() {
  echo "› building (shared → server → client)…"
  ( cd "$ROOT" && npm run build )
}

launch() {
  mkdir -p "$RUN_DIR"
  # setsid: new session so the server outlives this shell / SSH / VS Code task.
  # The launched bash records its own PID (which `exec` hands to npm), so the
  # PID file always points at the real process group leader — group-kill on stop
  # then reaps npm and its node child together.
  setsid bash -c "echo \$\$ > '$PID_FILE'; exec npm start >> '$LOG_FILE' 2>&1" \
    < /dev/null > /dev/null 2>&1 &
  disown || true

  # Give it a moment and confirm it actually bound the port.
  local pid=""
  for _ in $(seq 1 30); do
    sleep 1
    pid="$(current_pid)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null \
       && curl -fsS -o /dev/null "$URL" 2>/dev/null; then
      echo "✓ server up — PID $pid — $URL"
      return 0
    fi
    if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
      echo "✗ server exited during startup — last log lines:" >&2
      tail -n 20 "$LOG_FILE" >&2 || true
      return 1
    fi
  done
  echo "✗ server did not answer on $URL within 30s — last log lines:" >&2
  tail -n 20 "$LOG_FILE" >&2 || true
  return 1
}

stop() {
  if ! is_running; then
    echo "server not running"
    rm -f "$PID_FILE"
    return 0
  fi
  local pid
  pid="$(current_pid)"
  echo "› stopping PID $pid…"
  # Negative PID targets the whole process group (npm + node child).
  kill -TERM "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  for _ in $(seq 1 15); do
    kill -0 "$pid" 2>/dev/null || { rm -f "$PID_FILE"; echo "✓ stopped"; return 0; }
    sleep 1
  done
  echo "› still alive, sending KILL…"
  kill -KILL "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
  rm -f "$PID_FILE"
  echo "✓ stopped (forced)"
}

case "${1:-}" in
  start)
    if is_running; then
      echo "already running — PID $(current_pid) — $URL (use 'restart' to bounce)"
      exit 0
    fi
    build
    launch
    ;;
  restart)
    # Build BEFORE touching the running server: a broken build must not take
    # the live server down.
    build
    is_running && stop
    launch
    ;;
  stop)
    stop
    ;;
  status)
    if is_running; then
      pid="$(current_pid)"
      echo "running — PID $pid — $URL"
      if curl -fsS -o /dev/null "$URL/api/health" 2>/dev/null; then
        echo "health: $(curl -fsS "$URL/api/health" 2>/dev/null)"
      else
        echo "health: no response on $URL/api/health"
      fi
    else
      echo "stopped"
      exit 1
    fi
    ;;
  logs)
    [ -f "$LOG_FILE" ] || { echo "no log yet at $LOG_FILE"; exit 0; }
    if [ "${2:-}" = "-f" ]; then
      tail -n 120 -f "$LOG_FILE"
    else
      tail -n 120 "$LOG_FILE"
    fi
    ;;
  *)
    echo "usage: scripts/server.sh {start|stop|restart|status|logs [-f]}" >&2
    exit 2
    ;;
esac

# --- Surviving a reboot (optional, needs sudo — not done here) ---------------
# This script keeps the server alive across SSH/VS Code disconnects but NOT
# across a machine reboot. To auto-start on boot, install a user systemd unit
# and enable lingering (both need a one-time sudo):
#   ~/.config/systemd/user/geff.service  ->  ExecStart=/usr/bin/npm start
#   loginctl enable-linger stefan && systemctl --user enable --now geff
# Left as a follow-up so this stays sudo-free.
