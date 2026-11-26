#!/bin/sh
set -eu
[ "$#" -eq 1 ] || { echo "usage: $0 TARGET_COPY" >&2; exit 2; }
unlink "$1"
