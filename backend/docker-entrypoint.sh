#!/bin/sh
set -e

# The app runs as the unprivileged "node" user. Volumes created by older
# versions (which ran as root) may hold root-owned files, so hand them over
# first. Only files with another owner are touched, so restarts stay fast.
if [ "$(id -u)" = "0" ]; then
  for dir in /app/data /app/uploads; do
    # Only real files/dirs on this volume, never following symlinks
    find "$dir" -xdev \( -type f -o -type d \) ! -user node -exec chown -h node:node {} + 2>/dev/null || true
  done
  exec su-exec node "$@"
fi

exec "$@"
