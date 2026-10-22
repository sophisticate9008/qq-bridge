#!/usr/bin/env bash
# Compatibility entrypoint; boot and standalone CLI share one implementation.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if (( $# == 0 )); then set -- status; fi
exec "$ROOT/ops/qqbridge" "$@"
