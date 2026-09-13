#!/bin/sh
set -eu
mkdir -p /tmp/codex /tmp/claude
exec "$@"
