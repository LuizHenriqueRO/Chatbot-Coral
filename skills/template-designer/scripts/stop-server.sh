#!/usr/bin/env bash
# Stop the template designer server
# Usage: stop-server.sh <session-dir>

SESSION_DIR="$1"
if [[ -z "$SESSION_DIR" ]]; then
  echo "Usage: stop-server.sh <session-dir>"
  exit 1
fi

PID_FILE="${SESSION_DIR}/state/server.pid"
STATE_DIR="${SESSION_DIR}/state"

if [[ -f "$PID_FILE" ]]; then
  pid=$(cat "$PID_FILE")
  kill "$pid" 2>/dev/null
  rm -f "$PID_FILE"
  echo "" > "${STATE_DIR}/server-stopped"
  echo "Server stopped (pid $pid)"
else
  echo "No server running (no PID file found)"
fi
