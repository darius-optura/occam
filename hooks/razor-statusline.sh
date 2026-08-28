#!/bin/bash
# razor — statusline badge fragment. Prints [RAZOR] when razor is on.
# Designed to be appended to an existing statusline.

FLAG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.razor-active"

[ -L "$FLAG" ] && exit 0
[ -f "$FLAG" ] || exit 0
[ "$(head -c 8 "$FLAG" 2>/dev/null | tr -d '\n\r')" = "on" ] || exit 0

printf '\033[38;5;172m[RAZOR]\033[0m'
