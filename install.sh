#!/usr/bin/env bash
set -euo pipefail

PACMAN_PACKAGES=(
  base-devel
  git
  chezmoi
  zsh
  fzf
  zoxide
  lsd
  fastfetch
  mise
  btop
  lazygit
  github-cli
  networkmanager
  libnotify
  neovim
  tree-sitter-cli
  bun
  docker
  flatpak
  hyprland
  hyprlock
  hyprpaper
  waybar
  swaync
  fuzzel
  yazi
  thunar
  grim
  slurp
  brightnessctl
  playerctl
  pavucontrol
  pulsemixer
  bluez
  bluez-utils
  pipewire-alsa
  pipewire-pulse
  pacman-contrib
  noto-fonts
  otf-commit-mono-nerd
  ttf-dejavu
  ttf-jetbrains-mono-nerd
  ttf-liberation
  papirus-icon-theme
  obsidian
  steam
  prismlauncher
)

AUR_PACKAGES=(
  1password
  helium-browser-bin
  oh-my-posh-bin
  spotify
  ttf-apple-emoji
  wezterm-git
)

confirm() {
  local prompt=${1:-Continue?}
  read -r -p "$prompt [y/N] " answer
  [[ $answer == [Yy] || $answer == [Yy][Ee][Ss] ]]
}

section() {
  printf '\n==> %s\n' "$1"
}

require_arch() {
  if [[ ! -f /etc/arch-release ]]; then
    printf 'This installer is Arch-only for now.\n' >&2
    exit 1
  fi
}

ensure_yay() {
  if command -v yay >/dev/null 2>&1; then
    return
  fi

  section "Installing yay-bin"
  local tmpdir
  tmpdir=$(mktemp -d)
  trap 'rm -rf "$tmpdir"' RETURN
  git clone https://aur.archlinux.org/yay-bin.git "$tmpdir/yay-bin"
  (cd "$tmpdir/yay-bin" && makepkg -si --noconfirm)
}

install_pacman_packages() {
  section "Installing pacman packages"
  sudo pacman -S --needed --noconfirm "${PACMAN_PACKAGES[@]}"
}

install_aur_packages() {
  section "Installing AUR packages"
  yay -S --needed --noconfirm "${AUR_PACKAGES[@]}"
}

enable_service() {
  local service=$1
  if confirm "Enable and start $service?"; then
    sudo systemctl enable --now "$service"
  fi
}

main() {
  require_arch

  section "Arch installer"

  if confirm "Update the system first?"; then
    sudo pacman -Syu
  fi

  install_pacman_packages
  ensure_yay
  install_aur_packages

  section "Optional services"
  enable_service bluetooth.service
  enable_service docker.service

  if confirm "Apply chezmoi dotfiles now?"; then
    chezmoi apply
  fi

  section "Done"
}

main "$@"
