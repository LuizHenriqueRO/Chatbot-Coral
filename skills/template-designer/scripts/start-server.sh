#!/usr/bin/env bash
# Start the template designer server
# Usage: start-server.sh --session-dir <path> [--host <bind-host>] [--url-host <display-host>] [--foreground]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

SESSION_DIR=""
FOREGROUND="false"
BIND_HOST="127.0.0.1"
URL_HOST=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --session-dir)
      SESSION_DIR="$2"
      shift 2
      ;;
    --host)
      BIND_HOST="$2"
      shift 2
      ;;
    --url-host)
      URL_HOST="$2"
      shift 2
      ;;
    --foreground|--no-daemon)
      FOREGROUND="true"
      shift
      ;;
    *)
      echo "{\"error\": \"Unknown argument: $1\"}"
      exit 1
      ;;
  esac
done

if [[ -z "$SESSION_DIR" ]]; then
  echo '{"error": "--session-dir is required"}'
  exit 1
fi

if [[ -z "$URL_HOST" ]]; then
  if [[ "$BIND_HOST" == "127.0.0.1" || "$BIND_HOST" == "localhost" ]]; then
    URL_HOST="localhost"
  else
    URL_HOST="$BIND_HOST"
  fi
fi

# Windows/Git Bash auto-foreground
case "${OSTYPE:-}" in
  msys*|cygwin*|mingw*) FOREGROUND="true" ;;
esac
if [[ -n "${MSYSTEM:-}" ]]; then
  FOREGROUND="true"
fi

CONTENT_DIR="${SESSION_DIR}/content"
STATE_DIR="${SESSION_DIR}/state"
PID_FILE="${STATE_DIR}/server.pid"
LOG_FILE="${STATE_DIR}/server.log"

mkdir -p "$CONTENT_DIR" "$STATE_DIR"

# Kill existing server if any
if [[ -f "$PID_FILE" ]]; then
  old_pid=$(cat "$PID_FILE")
  kill "$old_pid" 2>/dev/null
  rm -f "$PID_FILE"
fi

# Resolve owner PID
OWNER_PID="$(ps -o ppid= -p "$PPID" 2>/dev/null | tr -d ' ')"
if [[ -z "$OWNER_PID" || "$OWNER_PID" == "1" ]]; then
  OWNER_PID="$PPID"
fi

if [[ "$FOREGROUND" == "true" ]]; then
  echo "$$" > "$PID_FILE"
  env TEMPLATE_DIR="$CONTENT_DIR" TEMPLATE_STATE_DIR="$STATE_DIR" TEMPLATE_HOST="$BIND_HOST" TEMPLATE_URL_HOST="$URL_HOST" TEMPLATE_OWNER_PID="$OWNER_PID" node "$SCRIPT_DIR/server.js"
  exit $?
fi

# Background mode
nohup env TEMPLATE_DIR="$CONTENT_DIR" TEMPLATE_STATE_DIR="$STATE_DIR" TEMPLATE_HOST="$BIND_HOST" TEMPLATE_URL_HOST="$URL_HOST" TEMPLATE_OWNER_PID="$OWNER_PID" node "$SCRIPT_DIR/server.js" > "$LOG_FILE" 2>&1 &
SERVER_PID=$!
disown "$SERVER_PID" 2>/dev/null
echo "$SERVER_PID" > "$PID_FILE"

# Wait for startup
for i in {1..50}; do
  if [[ -f "$STATE_DIR/server-info.json" ]]; then
    cat "$STATE_DIR/server-info.json"
    exit 0
  fi
  sleep 0.1
done

echo '{"error": "Server failed to start within 5 seconds"}'
exit 1
