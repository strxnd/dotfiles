#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

confirm() {
  local prompt=${1:-Continue?}
  read -r -p "$prompt [y/N] " answer
  [[ $answer == [Yy] || $answer == [Yy][Ee][Ss] ]]
}

section() {
  printf '\n==> %s\n' "$1"
}

install_chezmoi_arch() {
  if ! command -v sudo >/dev/null 2>&1; then
    printf 'Missing required command: sudo\n' >&2
    exit 1
  fi
  sudo pacman -S --needed chezmoi
}

install_chezmoi_darwin() {
  if ! command -v brew >/dev/null 2>&1; then
    if ! confirm "Homebrew is not installed. Install Homebrew now?"; then
      printf 'Install Homebrew or chezmoi, then rerun this script.\n' >&2
      exit 1
    fi
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    if [[ -x /opt/homebrew/bin/brew ]]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [[ -x /usr/local/bin/brew ]]; then
      eval "$(/usr/local/bin/brew shellenv)"
    fi
  fi
  brew install chezmoi
}

ensure_chezmoi() {
  if command -v chezmoi >/dev/null 2>&1; then
    return
  fi

  section "Installing chezmoi"
  case "$(uname -s)" in
    Linux)
      if [[ -f /etc/arch-release ]]; then
        install_chezmoi_arch
      else
        printf 'Install chezmoi for this Linux distribution, then rerun this script.\n' >&2
        exit 1
      fi
      ;;
    Darwin)
      install_chezmoi_darwin
      ;;
    *)
      printf 'Unsupported OS: %s\n' "$(uname -s)" >&2
      exit 1
      ;;
  esac
}

main() {
  ensure_chezmoi

  section "Applying chezmoi dotfiles"
  chezmoi --source "$SCRIPT_DIR" apply

  section "Done"
}

main "$@"
