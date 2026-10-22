#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$ROOT/runtime/logs"
chmod 700 "$ROOT/runtime/logs"
screen_name() { if [[ "$1" == qq-client ]]; then echo qq-client; else echo "qq-$1"; fi; }
running() { screen -ls 2>/dev/null | awk -v name="$(screen_name "$1")" '$1 ~ ("[.]" name "$") { found=1 } END { exit !found }'; }
start_one() {
  if running "$1"; then echo "$1 already running"; return; fi
  screen -L -Logfile "$ROOT/runtime/logs/$1.log" -dmS "$(screen_name "$1")" /usr/local/bin/node "$ROOT/ops/run-service.mjs" "$1"
  sleep 1
  running "$1" || { echo "$1 failed; inspect runtime/logs/$1.log" >&2; return 1; }
}
stop_one() { if running "$1"; then screen -S "$(screen_name "$1")" -X quit; fi; }
case "${1:-status}" in
  start) for service in snowluma qq-client dsh bridge; do start_one "$service"; done ;;
  stop) for service in bridge dsh qq-client snowluma; do stop_one "$service"; done ;;
  restart) "$0" stop; sleep 2; "$0" start ;;
  status) for service in snowluma qq-client dsh bridge; do if running "$service"; then echo "$service running"; else echo "$service stopped"; fi; done ;;
  *) echo "Usage: $0 {start|stop|restart|status}" >&2; exit 2 ;;
esac
