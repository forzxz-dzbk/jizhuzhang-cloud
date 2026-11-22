#!/bin/sh
set -eu
if [ "$#" -ne 1 ]; then echo "usage: ROLLBACK.sh TARGET_COPY" >&2; exit 2; fi
node - "$1" <<'NODE'
const fs=require('node:fs');
fs.unlinkSync(process.argv[2]);
NODE