#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

common=(fastfetch ghostty nvim oh-my-posh zsh)

case "$(uname -s)" in
  Darwin) stow "${common[@]}" ghostty-macos skhd ;;
  Linux) stow "${common[@]}" ghostty-linux fuzzel hypr swaync waybar ;;
  *) echo "Unsupported operating system" >&2; exit 1 ;;
esac
