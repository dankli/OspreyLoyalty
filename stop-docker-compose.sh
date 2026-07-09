#!/usr/bin/env bash
# Stop the Osprey Loyalty stack.
#
#   ./stop-docker-compose.sh            stop and remove containers (keeps volumes)
#   ./stop-docker-compose.sh --volumes  also remove named volumes (wipes seeded Mongo data)
set -euo pipefail

# Run from the repo root regardless of where the script is invoked from.
cd "$(dirname "$0")"

COMPOSE="docker compose -f infra/docker-compose.yml"

DOWN_ARGS=()
for arg in "$@"; do
  case "$arg" in
    --volumes|-v) DOWN_ARGS+=("--volumes") ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

echo "=== Stopping the stack ($COMPOSE down ${DOWN_ARGS[*]:-}) ==="
$COMPOSE down "${DOWN_ARGS[@]}"
echo "Stopped."
