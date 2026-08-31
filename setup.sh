#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

common=(git mise nvim oh-my-posh zsh)
linux=(ghostty-linux hypr omarchy)
darwin=(ghostty ghostty-macos skhd)

backup_conflicts() {
  local pkg="$1"
  local repo dest rel file real
  repo="$(pwd -P)"
  while IFS= read -r file; do
    rel="${file#"${pkg}/"}"
    dest="${HOME}/${rel}"
    if [[ -L "$dest" || ! -f "$dest" ]]; then
      continue
    fi
    real="$(realpath "$dest")"
    # Directory symlinks into this repo make package files look like
    # regular files under $HOME. Never rename those.
    if [[ "$real" == "$repo/"* ]]; then
      continue
    fi
    mv "$dest" "${dest}.bak.$(date +%s)"
    printf 'backed up %s\n' "$dest"
  done < <(find "$pkg" -type f)
}

stow_packages() {
  local pkg
  for pkg in "$@"; do
    backup_conflicts "$pkg"
  done
  stow --restow "$@"
}

case "$(uname -s)" in
  Darwin) stow_packages "${common[@]}" "${darwin[@]}" ;;
  Linux) stow_packages "${common[@]}" "${linux[@]}" ;;
  *) printf 'Unsupported operating system\n' >&2; exit 1 ;;
esac
