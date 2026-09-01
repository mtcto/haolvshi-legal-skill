#!/bin/sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
node_bin="$("$script_dir/bootstrap.sh" --print-node)"
exec "$node_bin" "$script_dir/legal-skill.mjs" "$@"
