#!/bin/sh
# Printed by the nginx entrypoint just before the server starts.
echo "=================================================================="
echo " Agricultural Cooperative Tycoon is running."
echo " Open http://localhost:${HOST_PORT:-8080} in your browser."
echo " (Press d to detach, or run 'docker compose down' to stop.)"
echo "=================================================================="
