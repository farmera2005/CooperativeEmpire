#!/bin/sh
# Printed by the nginx entrypoint just before the server starts.
echo "=================================================================="
echo " Agricultural Cooperative Tycoon is running."
echo " The static site is at http://localhost:${HOST_PORT:-8081}."
echo " (Press d to detach, or run 'docker compose down' to stop.)"
echo " The app service (with Settings > sharing controls) is at http://localhost:8080."
echo "=================================================================="
