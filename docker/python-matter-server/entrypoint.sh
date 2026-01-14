#!/bin/bash
set -e

case "${MATTER_SERVER_TYPE}" in
  javascript|js)
    echo "Starting JavaScript Matter Server..."
    exec node --enable-source-maps /app/node_modules/matter-server/dist/esm/MatterServer.js "$@"
    ;;
  python|py|*)
    echo "Starting Python Matter Server..."
    exec matter-server "$@"
    ;;
esac
