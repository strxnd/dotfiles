#!/bin/sh
set -eu

case "${1:-}" in
  '') dry_run=false; spicetify_only=false ;;
  -n|--dry-run) dry_run=true; spicetify_only=false ;;
  --spicetify) dry_run=false; spicetify_only=true ;;
  -h|--help)
    printf '%s\n' 'Usage: ./install.sh [--dry-run|--spicetify]' 'Interactive Arch Linux setup. --spicetify applies the theme after you sign in to Spotify.'
    exit 0
    ;;
  *) printf 'Unknown option: %s\n' "$1" >&2; exit 2 ;;
esac
[ "$#" -le 1 ] || { printf '%s\n' 'Usage: ./install.sh [--dry-run|--spicetify]' >&2; exit 2; }

if [ "$(uname -s)" != Linux ] || [ ! -f /etc/arch-release ] || ! command -v pacman >/dev/null 2>&1; then
  printf '%s\n' 'This installer supports Arch Linux only. On macOS, Stow the packages you want manually.' >&2
  exit 1
fi
[ "$(id -u)" -ne 0 ] || { printf '%s\n' 'Run this as your user, not with sudo.' >&2; exit 1; }
CDPATH= cd -- "$(dirname -- "$0")"
set -- zsh mise nvim oh-my-posh kitty mango quickshell kvantum qt-theme gtk qt5ct qt6ct xsettingsd

if [ "$dry_run" = true ]; then
  printf '%s\n' \
    '1. CachyOS repositories if missing; full system upgrade.' \
    '2. CachyOS kernel and headers; optional NVIDIA open DKMS driver.' \
    '3. Optional networking, Bluetooth, and PipeWire audio.' \
    '4. Build tools, yay-bin AUR helper, appearance, Spotify, and Spicetify.' \
    '5. MangoWC, Quickshell, Kitty, and desktop tools.' \
    '6. Neovim, then Zsh and its prompt/tools.' \
    '7. Preview and optionally link the Arch Linux dotfile packages.' \
    'No packages, services, repositories, or links change in a dry run.'
  if command -v stow >/dev/null 2>&1; then stow --no --verbose --restow "$@"; fi
  exit 0
fi

confirm() {
  while :; do
    printf '%s [y/N] ' "$1"
    IFS= read -r answer || exit 1
    case "$answer" in
      y|Y|yes|YES) return 0 ;;
      ''|n|N|no|NO) return 1 ;;
      *) printf '%s\n' 'Enter y or n.' ;;
    esac
  done
}

install_repo() {
  label=$1
  shift
  printf '\n%s: %s\n' "$label" "$*"
  if ! confirm 'Install this package group?'; then return 1; fi
  if ! sudo pacman -S --needed --noconfirm "$@"; then
    printf 'Failed to install %s. Stopping.\n' "$label" >&2
    exit 1
  fi
}

ensure_yay() {
  if command -v yay >/dev/null 2>&1; then return; fi
  printf '%s\n' 'AUR packages need an AUR helper. yay-bin comes from https://aur.archlinux.org/yay-bin.git.'
  if ! confirm 'Download and review the yay-bin build recipe?'; then exit 1; fi
  aur_tmp=$(mktemp -d)
  trap 'rm -rf -- "$aur_tmp"' 0
  git clone https://aur.archlinux.org/yay-bin.git "$aur_tmp/yay-bin"
  printf 'Build recipe: %s\n' "$aur_tmp/yay-bin/PKGBUILD"
  if confirm 'View the yay-bin PKGBUILD?'; then more "$aur_tmp/yay-bin/PKGBUILD"; fi
  if ! confirm 'Build and install yay-bin from this recipe?'; then exit 1; fi
  (cd "$aur_tmp/yay-bin" && makepkg -si --noconfirm)
  rm -rf -- "$aur_tmp"
  trap - 0
}

install_aur() {
  label=$1
  shift
  printf '\n%s (AUR): %s\n' "$label" "$*"
  if ! command -v yay >/dev/null 2>&1; then
    printf '%s\n' 'yay is not installed. AUR packages cannot be installed.' >&2
    return 1
  fi
  if ! confirm 'Build and install these community packages?'; then return 1; fi
  if ! yay -S --needed --noconfirm "$@"; then
    printf 'Failed to install %s. Stopping.\n' "$label" >&2
    exit 1
  fi
}

has_nvidia_gpu() {
  for device in /sys/bus/pci/devices/*; do
    [ -f "$device/vendor" ] && [ -f "$device/class" ] || continue
    IFS= read -r vendor < "$device/vendor"
    IFS= read -r class < "$device/class"
    if [ "$vendor" = 0x10de ]; then
      case "$class" in 0x0300*|0x0302*) return 0 ;; esac
    fi
  done
  return 1
}

setup_spicetify() {
  command -v spicetify >/dev/null || { printf '%s\n' 'Install spicetify-cli first.' >&2; return 1; }
  command -v curl >/dev/null || { printf '%s\n' 'Install curl first.' >&2; return 1; }

  spotify="$HOME/.local/share/spotify-launcher/install/usr/share/spotify"
  prefs="$HOME/.config/spotify/prefs"
  [ -d "$spotify" ] && [ -f "$prefs" ] || {
    printf '%s\n' 'Install spotify-launcher, then start Spotify and sign in once.' >&2
    return 1
  }

  config="${XDG_CONFIG_HOME:-$HOME/.config}/spicetify"
  theme="$config/Themes/text"
  visualizer="$config/CustomApps/visualizer"
  mkdir -p "$theme" "$visualizer"

  theme_rev=33a08ea009687f5a42ff678015c28797fe142a7c
  visualizer_rev=0b638afc56bdb0ece843c9569ca658a81ade6d53

  curl -fLsS "https://raw.githubusercontent.com/spicetify/spicetify-themes/$theme_rev/text/user.css" -o "$theme/user.css"
  cat >> "$theme/user.css" <<'CSS'

:root {
    --font-family: "Iosevka Nerd Font", monospace;
    --font-family-header: "Iosevka Nerd Font";
}
CSS

  cat > "$theme/color.ini" <<'COLORS'
[KanagawaDragonCustom]
accent             = 87a987
accent-active      = 87a987
accent-inactive    = 181616
banner             = 87a987
border-active      = 87a987
border-inactive    = 393836
header             = 9e9b93
highlight          = 9e9b93
main               = 181616
notification       = 8ba4b0
notification-error = c4746e
subtext            = c0c3c0
text               = a6a69c
COLORS

  for file in index.js manifest.json style.css; do
    curl -fLsS "https://raw.githubusercontent.com/Konsl/spicetify-visualizer/$visualizer_rev/$file" -o "$visualizer/$file"
  done

  spicetify config spotify_path "$spotify" prefs_path "$prefs" current_theme text color_scheme KanagawaDragonCustom custom_apps visualizer
  spicetify backup apply
}

if [ "$spicetify_only" = true ]; then
  setup_spicetify
  exit 0
fi

[ -t 0 ] || { printf '%s\n' 'An interactive terminal is required for confirmations.' >&2; exit 1; }

setup_cachyos_repos() {
  if pacman-conf --repo-list | grep -qx cachyos; then
    printf '%s\n' 'CachyOS repositories are already configured.'
    return
  fi
  printf '%s\n' 'CachyOS provides an official repository installer. It changes pacman.conf, keys, mirrors, and pacman.'
  if ! confirm 'Download and run that installer as root?'; then return; fi
  if ! command -v curl >/dev/null 2>&1; then
    printf '%s\n' 'curl is needed to fetch the repository installer.'
    if ! confirm 'Install curl and update the system first?'; then return; fi
    sudo pacman -Syu --needed --noconfirm curl
  fi
  repo_tmp=$(mktemp -d)
  trap 'rm -rf -- "$repo_tmp"' 0
  curl -fLsS 'https://mirror.cachyos.org/cachyos-repo.tar.xz' -o "$repo_tmp/cachyos-repo.tar.xz"
  tar -tJf "$repo_tmp/cachyos-repo.tar.xz" | grep -qx 'cachyos-repo/cachyos-repo.sh'
  tar -xJf "$repo_tmp/cachyos-repo.tar.xz" -C "$repo_tmp"
  printf 'Upstream script: %s\n' "$repo_tmp/cachyos-repo/cachyos-repo.sh"
  if confirm 'View the upstream script before running it?'; then more "$repo_tmp/cachyos-repo/cachyos-repo.sh"; fi
  if confirm 'Run the reviewed CachyOS repository installer as root?'; then
    mkdir "$repo_tmp/bin"
    printf '#!/bin/sh\nexec /usr/bin/pacman --noconfirm "$@"\n' > "$repo_tmp/bin/pacman"
    chmod +x "$repo_tmp/bin/pacman"
    (cd "$repo_tmp/cachyos-repo" && sudo env PATH="$repo_tmp/bin:/usr/bin:/bin" ./cachyos-repo.sh)
  fi
  rm -rf -- "$repo_tmp"
  trap - 0
}

setup_cachyos_repos
if confirm 'Fully update Arch and CachyOS packages before continuing?'; then
  sudo pacman -Syu --noconfirm
  packages_allowed=true
else
  printf '%s\n' 'Package steps skipped to avoid a partial upgrade.'
  packages_allowed=false
fi

if [ "$packages_allowed" = true ]; then
  if pacman -Si linux-cachyos linux-cachyos-headers >/dev/null 2>&1; then
    install_repo 'CachyOS kernel and matching headers' linux-cachyos linux-cachyos-headers || true
  else
    printf '%s\n' 'CachyOS kernel packages unavailable. Check the repository setup above.' >&2
  fi

  if has_nvidia_gpu; then
    printf '%s\n' 'NVIDIA GPU found. nvidia-open-dkms is for Turing and newer GPUs; check your card before agreeing.'
    headers=''
    for kernel in linux linux-lts linux-zen linux-cachyos linux-cachyos-lts; do
      if pacman -Q "$kernel" >/dev/null 2>&1; then headers="$headers ${kernel}-headers"; fi
    done
    if [ -n "$headers" ]; then
      # The fixed list of kernel package names above is intentionally split here.
      # shellcheck disable=SC2086
      install_repo 'NVIDIA driver and installed kernel headers (optional)' nvidia-open-dkms nvidia-utils $headers || true
    else
      printf '%s\n' 'No known installed kernel found. Install matching headers before NVIDIA DKMS.'
    fi
  else
    printf '%s\n' 'No NVIDIA graphics device detected. Driver step skipped.'
  fi

  if install_repo 'Networking (optional)' networkmanager iproute2 iputils; then
    if confirm 'Enable and start NetworkManager now?'; then sudo systemctl enable --now NetworkManager; fi
  fi
  if install_repo 'Bluetooth (optional)' bluez bluez-utils; then
    if confirm 'Enable and start Bluetooth now?'; then sudo systemctl enable --now bluetooth; fi
  fi
  install_repo 'PipeWire audio stack (optional)' pipewire pipewire-audio pipewire-pulse pipewire-alsa wireplumber alsa-utils || true

  install_repo 'Build tools and GNU Stow' base-devel git curl stow || true
  if command -v yay >/dev/null 2>&1; then
    printf '%s\n' 'yay AUR helper is already installed.'
  elif confirm 'Install the yay-bin AUR helper now?'; then
    ensure_yay
  fi
  install_repo 'Fonts, icons, and Qt/GTK appearance' ttf-iosevka-nerd ttc-iosevka papirus-icon-theme qt5ct qt6ct kvantum kvantum-qt5 xsettingsd nwg-look || true
  install_aur 'Bibata cursor' bibata-cursor-theme-bin || true
  install_repo 'Spotify client (optional)' spotify-launcher || true
  install_aur 'Spicetify (optional)' spicetify-cli || true
  if command -v spicetify >/dev/null 2>&1 && [ -f "$HOME/.config/spotify/prefs" ]; then
    if confirm 'Apply the Spicetify theme now (close Spotify first)?'; then setup_spicetify; fi
  else
    printf '%s\n' 'Sign in to Spotify once, then run ./install.sh --spicetify to apply the theme.'
  fi

  install_repo 'Desktop apps and tools' kitty quickshell swaybg nnn polkit xdg-desktop-portal xdg-desktop-portal-gtk || true
  install_aur 'MangoWC window manager' mangowm-git || true
  install_repo 'Editor' neovim || true
  install_repo 'Shell tools' zsh tmux mise zoxide lsd fastfetch fzf || true
  install_aur 'Oh My Posh prompt' oh-my-posh-bin || true
fi

if ! command -v stow >/dev/null 2>&1; then
  printf '%s\n' 'Install GNU Stow to link dotfiles, then rerun this script.' >&2
  exit 1
fi
printf '\nPreviewing dotfile links...\n'
if ! stow --no --verbose --restow "$@"; then
  printf '%s\n' 'Stow found conflicts. Review and move existing files aside; nothing was overwritten.' >&2
  exit 1
fi
if confirm 'Link Arch Linux dotfiles now?'; then
  stow --restow "$@"
  printf '%s\n' 'Dotfiles linked.'
else
  printf '%s\n' 'Dotfile links left unchanged.'
fi
