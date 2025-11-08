#!/usr/bin/env bash

set -e  # Exit on error

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="$HOME/.config_backup_$(date +%Y%m%d_%H%M%S)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Flags
PACKAGES_ONLY=false
LINKS_ONLY=false
NO_BACKUP=false
MINIMAL=false
AUTO_YES=false

# Print functions
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_info() { echo -e "${YELLOW}➜${NC} $1"; }
print_header() { echo -e "\n${BLUE}╔═══════════════════════════════════════════╗${NC}"; echo -e "${BLUE}║${NC} ${BOLD}$1${NC}"; echo -e "${BLUE}╚═══════════════════════════════════════════╝${NC}\n"; }
print_command() { echo -e "${CYAN}${BOLD}Command:${NC} ${MAGENTA}$1${NC}"; }

# Ask for confirmation
confirm() {
  if [[ "$AUTO_YES" == true ]]; then
    return 0
  fi
  
  local prompt="$1"
  local default="${2:-y}"
  
  if [[ "$default" == "y" ]]; then
    prompt="$prompt [Y/n]: "
  else
    prompt="$prompt [y/N]: "
  fi
  
  while true; do
    read -p "$(echo -e "${YELLOW}?${NC} $prompt")" -r response
    response=${response:-$default}
    
    case "$response" in
      [Yy]|[Yy][Ee][Ss])
        return 0
        ;;
      [Nn]|[Nn][Oo])
        return 1
        ;;
      *)
        echo "Please answer yes or no."
        ;;
    esac
  done
}

# Install a single package with confirmation
install_package() {
  local package="$1"
  local description="$2"
  local aur_helper="${3:-paru}"
  
  # Check if package is already installed
  if pacman -Qi "$package" &> /dev/null || paru -Qi "$package" &> /dev/null; then
    print_success "$package is already installed"
    return 0
  fi
  
  echo ""
  echo -e "${BOLD}Package:${NC} ${GREEN}$package${NC}"
  if [[ -n "$description" ]]; then
    echo -e "${BOLD}Description:${NC} $description"
  fi
  
  local cmd="$aur_helper -S --needed $package"
  print_command "$cmd"
  echo ""
  
  if confirm "Install this package?"; then
    eval "$cmd"
    print_success "$package installed successfully"
  else
    print_info "Skipped $package"
  fi
}

# Install multiple packages from a list
install_package_group() {
  local group_name="$1"
  shift
  local packages=("$@")
  
  print_header "$group_name"
  
  for package in "${packages[@]}"; do
    # Parse package info (format: "package|description")
    IFS='|' read -r pkg desc <<< "$package"
    install_package "$pkg" "$desc"
  done
}

# Usage information
usage() {
  cat << EOF
Usage: ./install.sh [OPTIONS]

Options:
  --packages-only    Only install packages, skip symlinking
  --links-only       Only create symlinks, skip packages
  --no-backup        Don't backup existing configs (dangerous!)
  --minimal          Skip optional packages (oh-my-posh, fastfetch, etc.)
  --auto-yes         Skip all confirmation prompts (auto-yes)
  --help             Show this help message

EOF
  exit 0
}

# Parse command line arguments
parse_args() {
  while [[ $# -gt 0 ]]; do
    case $1 in
      --packages-only)
        PACKAGES_ONLY=true
        shift
        ;;
      --links-only)
        LINKS_ONLY=true
        shift
        ;;
      --no-backup)
        NO_BACKUP=true
        shift
        ;;
      --minimal)
        MINIMAL=true
        shift
        ;;
      --auto-yes)
        AUTO_YES=true
        shift
        ;;
      --help)
        usage
        ;;
      *)
        echo "Unknown option: $1"
        usage
        ;;
    esac
  done
}

# Check prerequisites
check_prerequisites() {
  print_header "Checking Prerequisites"
  
  # Check if running on Arch Linux
  if [[ ! -f /etc/arch-release ]]; then
    print_error "This script is designed for Arch Linux"
    exit 1
  fi
  print_success "Running on Arch Linux"
  
  # Check if running as root
  if [[ $EUID -eq 0 ]]; then
    print_error "Do not run this script as root"
    exit 1
  fi
  print_success "Not running as root"
  
  # Check for sudo access
  if ! sudo -v; then
    print_error "This script requires sudo access"
    exit 1
  fi
  print_success "Sudo access confirmed"
  
  # Check internet connection
  if ! ping -c 1 archlinux.org &> /dev/null; then
    print_error "No internet connection detected"
    exit 1
  fi
  print_success "Internet connection detected"
  
  # Warn if not on Wayland
  if [[ "$XDG_SESSION_TYPE" != "wayland" ]] && [[ -n "$XDG_SESSION_TYPE" ]]; then
    print_info "Currently not on Wayland (detected: $XDG_SESSION_TYPE)"
    print_info "This rice is designed for Wayland"
  fi
}

# Install paru AUR helper
install_paru() {
  if command -v paru &> /dev/null; then
    print_success "paru is already installed"
    return 0
  fi

  print_header "Installing paru AUR Helper"
  
  echo -e "${BOLD}paru${NC} is an AUR helper that will be used to install packages"
  print_command "Install base-devel and git, then build paru from AUR"
  echo ""
  
  if ! confirm "Install paru?"; then
    print_error "paru is required for this installation"
    exit 1
  fi
  
  # Ensure base-devel and git are installed
  sudo pacman -S --needed base-devel git
  
  # Clone and build paru
  local tmp_dir=$(mktemp -d)
  cd "$tmp_dir"
  git clone https://aur.archlinux.org/paru.git
  cd paru
  makepkg -si
  cd ~
  rm -rf "$tmp_dir"
  
  if command -v paru &> /dev/null; then
    print_success "paru installed successfully"
  else
    print_error "Failed to install paru"
    exit 1
  fi
}

# Update system
update_system() {
  print_header "System Update"
  
  print_command "sudo pacman -Syu"
  echo ""
  
  if confirm "Update system packages?"; then
    sudo pacman -Syu
    print_success "System updated"
  else
    print_info "Skipped system update"
  fi
}

# Install all packages
install_packages() {
  # Fonts
  local font_packages=(
    "ttf-jetbrains-mono-nerd|JetBrains Mono Nerd Font (main terminal font)"
    "ttf-nerd-fonts-symbols|Nerd Font symbols (icons for waybar/fuzzel)"
    "ttf-0xproto-nerd|0xProto Nerd Font"
  )
  install_package_group "Fonts" "${font_packages[@]}"
  
  # Shell and Editor
  local shell_packages=(
    "zsh|Z Shell (modern shell)"
    "neovim|Neovim text editor"
    "gcc|GNU Compiler Collection (required for treesitter)"
    "nodejs|Node.js runtime (LSP servers)"
    "npm|Node package manager"
    "python-pip|Python package manager"
    "ripgrep|Fast grep alternative (telescope finder)"
    "fd|Fast find alternative (telescope finder)"
    "lazygit|Git TUI (optional for neovim)"
    "stylua|Lua formatter"
    "lsd|Modern ls with icons"
    "zoxide|Smart cd command"
    "fzf|Fuzzy finder (for fzf-tab plugin)"
  )
  
  if [[ "$MINIMAL" == false ]]; then
    shell_packages+=(
      "oh-my-posh|Modern shell prompt"
      "fastfetch|System info display"
    )
  fi
  
  install_package_group "Shell & Editor" "${shell_packages[@]}"
  
  # Wayland/Hyprland
  local hyprland_packages=(
    "hyprland|Dynamic tiling Wayland compositor"
    "hyprpaper|Wallpaper manager for Hyprland"
    "hypridle|Idle management daemon for Hyprland"
    "hyprlock|Screen locker for Hyprland"
    "waybar|Highly customizable Wayland status bar"
    "xorg-xwayland|X11 compatibility layer for Wayland"
  )
  install_package_group "Wayland/Hyprland Stack" "${hyprland_packages[@]}"
  
  # Utilities
  local util_packages=(
    "fuzzel|Fast application launcher for Wayland"
    "swaync|Notification daemon with control center for Wayland"
    "grim|Screenshot utility for Wayland"
    "slurp|Region selector for Wayland screenshots"
    "wl-clipboard|Command-line clipboard utilities for Wayland"
    "cliphist|Clipboard history manager for Wayland"
    "yazi|Modern terminal file manager (Rust)"
    "qutebrowser|Keyboard-focused Vim-like browser"
    "brightnessctl|Brightness control utility"
  )
  install_package_group "Utilities" "${util_packages[@]}"
  
  # WezTerm (special handling)
  install_wezterm_interactive

  # Audio/Network
  local audio_network_packages=(
    "pipewire|Modern audio/video server"
    "pipewire-pulse|PulseAudio replacement for Pipewire"
    "wireplumber|Pipewire session manager"
    "pamixer|CLI audio mixer"
    "pulsemixer|TUI audio mixer"
    "networkmanager|Network connection manager (nmcli)"
    "bluez|Bluetooth protocol stack"
    "bluez-utils|Bluetooth utilities (bluetoothctl)"
  )
  install_package_group "Audio & Network" "${audio_network_packages[@]}"
  
  # System Integration
  local system_packages=(
    "xdg-desktop-portal-hyprland|Screen sharing support for Hyprland"
    "polkit-gnome|Authentication agent for GUI apps"
    "qt5-wayland|Qt5 Wayland support"
    "qt6-wayland|Qt6 Wayland support"
    "stow|GNU Stow - symlink farm manager for dotfiles"
    "pacman-contrib|Contributed scripts for pacman (checkupdates)"
  )
  install_package_group "System Integration" "${system_packages[@]}"
  
  print_success "All packages processed"
}

# Install wezterm with special handling
install_wezterm_interactive() {
  print_header "WezTerm Terminal"

  if command -v wezterm &> /dev/null; then
    print_success "wezterm is already installed"
    return 0
  fi

  echo -e "${BOLD}wezterm${NC} is a GPU-accelerated cross-platform terminal emulator"
  echo -e "${BOLD}Note:${NC} Available in AUR as 'wezterm'"
  print_command "paru -S --needed wezterm"
  echo ""

  if ! confirm "Attempt to install wezterm?"; then
    print_info "Skipped wezterm (you can install it manually later)"
    return 0
  fi

  if paru -Ss wezterm &> /dev/null; then
    paru -S --needed wezterm || {
      print_info "wezterm installation failed, continuing anyway"
      return 0
    }
    print_success "wezterm installed successfully"
  else
    print_info "wezterm not found in AUR, skipping"
  fi
}

# Backup existing configs
backup_configs() {
  if [[ "$NO_BACKUP" == true ]]; then
    print_info "Skipping backup (--no-backup flag set)"
    return 0
  fi
  
  print_header "Backing Up Existing Configs"
  
  local files_to_backup=(
    "$HOME/.zshrc"
    "$HOME/.config/nvim"
    "$HOME/.config/wezterm"
    "$HOME/.config/hypr"
    "$HOME/.config/waybar"
    "$HOME/.config/fuzzel"
    "$HOME/.config/swaync"
    "$HOME/.config/qutebrowser"
  )
  
  local backup_needed=false
  for file in "${files_to_backup[@]}"; do
    if [[ -e "$file" ]] && [[ ! -L "$file" ]]; then
      backup_needed=true
      break
    fi
  done
  
  if [[ "$backup_needed" == false ]]; then
    print_info "No existing configs to backup"
    return 0
  fi
  
  echo "The following existing configs will be backed up to:"
  echo -e "${CYAN}$BACKUP_DIR${NC}"
  echo ""
  
  if ! confirm "Create backup?"; then
    print_info "Skipped backup"
    return 0
  fi
  
  mkdir -p "$BACKUP_DIR"
  
  for file in "${files_to_backup[@]}"; do
    if [[ -e "$file" ]] && [[ ! -L "$file" ]]; then
      local backup_path="$BACKUP_DIR/$(basename "$file")"
      cp -r "$file" "$backup_path"
      print_success "Backed up: $(basename "$file")"
    fi
  done
  
  print_success "Backup saved to: $BACKUP_DIR"
}

# Create symlinks using GNU Stow
create_symlinks() {
  print_header "Creating Symlinks with GNU Stow"

  # Check if stow is installed
  if ! command -v stow &> /dev/null; then
    print_error "GNU Stow is not installed. Please install it first."
    return 1
  fi

  echo ""
  echo -e "${BOLD}Using GNU Stow to manage dotfiles${NC}"
  echo -e "Stow will create symlinks from ${CYAN}$DOTFILES_DIR${NC} to ${CYAN}$HOME${NC}"
  echo ""
  echo -e "${YELLOW}Note:${NC} Stow expects the following directory structure:"
  echo "  dotfiles/.zshrc        → ~/.zshrc"
  echo "  dotfiles/.config/...   → ~/.config/..."
  echo ""

  # Show what will be stowed
  echo -e "${BOLD}Files/directories that will be symlinked:${NC}"
  if [[ -f "$DOTFILES_DIR/.zshrc" ]]; then
    echo "  ✓ .zshrc"
  fi
  if [[ -d "$DOTFILES_DIR/.config" ]]; then
    for dir in "$DOTFILES_DIR/.config"/*; do
      if [[ -d "$dir" ]]; then
        echo "  ✓ .config/$(basename "$dir")"
      fi
    done
  fi
  echo ""

  print_command "cd $DOTFILES_DIR && stow -v --ignore='README.md' --ignore='CLAUDE.md' --ignore='install.sh' ."
  echo ""

  if ! confirm "Use Stow to create all symlinks?"; then
    print_info "Skipped stow symlinking"
    return 0
  fi

  # Remove conflicting files/directories first
  echo ""
  print_info "Removing existing configs (already backed up)..."

  # Remove .zshrc if it exists and is not a symlink
  if [[ -f "$HOME/.zshrc" ]] && [[ ! -L "$HOME/.zshrc" ]]; then
    rm -f "$HOME/.zshrc"
    print_success "Removed existing .zshrc"
  fi

  # Remove .config directories if they exist and are not symlinks
  if [[ -d "$DOTFILES_DIR/.config" ]]; then
    for dir in "$DOTFILES_DIR/.config"/*; do
      if [[ -d "$dir" ]]; then
        local config_name=$(basename "$dir")
        local target="$HOME/.config/$config_name"

        if [[ -e "$target" ]] && [[ ! -L "$target" ]]; then
          rm -rf "$target"
          print_success "Removed existing .config/$config_name"
        fi
      fi
    done
  fi

  # Run stow
  echo ""
  print_info "Running stow..."
  cd "$DOTFILES_DIR"

  if stow -v --ignore='README.md' --ignore='CLAUDE.md' --ignore='install.sh' . 2>&1; then
    print_success "Stow completed successfully"
    print_success "All dotfiles are now symlinked to $HOME"
  else
    print_error "Stow encountered errors"
    print_info "You may need to manually resolve conflicts"
    return 1
  fi

  cd "$HOME"
  print_success "Symlink creation complete"
}

# Enable systemd services
enable_services() {
  print_header "Enabling Services"
  
  # Enable user services
  echo ""
  echo -e "${BOLD}Audio Services:${NC} pipewire, pipewire-pulse, wireplumber"
  print_command "systemctl --user enable --now pipewire pipewire-pulse wireplumber"
  echo ""
  
  if confirm "Enable audio services?"; then
    systemctl --user enable --now pipewire pipewire-pulse wireplumber 2>/dev/null || true
    print_success "Audio services enabled"
  else
    print_info "Skipped audio services"
  fi
  
  # Enable system services
  echo ""
  echo -e "${BOLD}Network Service:${NC} NetworkManager"
  print_command "sudo systemctl enable --now NetworkManager"
  echo ""
  
  if confirm "Enable NetworkManager?"; then
    sudo systemctl enable --now NetworkManager
    print_success "NetworkManager enabled"
  else
    print_info "Skipped NetworkManager"
  fi
}

# Setup zsh as default shell
setup_zsh() {
  print_header "Setting Up Zsh"
  
  local current_shell=$(basename "$SHELL")
  if [[ "$current_shell" == "zsh" ]]; then
    print_success "Zsh is already the default shell"
    return 0
  fi
  
  echo ""
  echo -e "${BOLD}Current shell:${NC} $current_shell"
  echo -e "${BOLD}New shell:${NC} zsh"
  print_command "chsh -s $(which zsh)"
  echo ""
  
  if confirm "Set zsh as default shell?"; then
    chsh -s "$(which zsh)"
    print_success "Zsh set as default shell (requires logout to take effect)"
  else
    print_info "Skipped zsh setup"
  fi
}

# Create required directories
create_directories() {
  print_header "Creating Required Directories"
  
  local dirs=(
    "$HOME/.local/share/wallpapers|Wallpaper storage"
    "$HOME/.local/share/screenshots|Screenshot storage"
  )
  
  for dir_info in "${dirs[@]}"; do
    IFS='|' read -r dir desc <<< "$dir_info"
    echo ""
    echo -e "${BOLD}Directory:${NC} $dir"
    echo -e "${BOLD}Purpose:${NC} $desc"
    
    if [[ -d "$dir" ]]; then
      print_success "Already exists: $dir"
    else
      mkdir -p "$dir"
      print_success "Created: $dir"
    fi
  done
}

# Post-install instructions
print_post_install() {
  print_header "Installation Complete!"
  
  echo -e "${GREEN}${BOLD}Next Steps:${NC}"
  echo "  1. Log out and log back in"
  echo "  2. Select 'Hyprland' from your display manager"
  echo "  3. Run: source ~/.zshrc"
  echo ""
  echo -e "${YELLOW}${BOLD}First Launch Notes:${NC}"
  echo "  - Zinit will auto-download zsh plugins on first zsh launch"
  echo "  - Neovim plugins will auto-install on first 'nvim' launch"
  echo "  - LSP servers will install via Mason when needed"
  echo ""
  echo -e "${CYAN}${BOLD}Hyprland Configuration:${NC}"
  echo "  - Main config: ~/.config/hypr/hyprland.conf"
  echo "  - Idle daemon: ~/.config/hypr/hypridle.conf"
  echo "  - Wallpaper: ~/.config/hypr/hyprpaper.conf"
  echo "  - Waybar: ~/.config/waybar/config & style.css"
  echo "  - Launcher: ~/.config/fuzzel/fuzzel.ini"
  echo "  - Notifications: ~/.config/swaync/config.json & style.css"
  echo ""
  if [[ "$NO_BACKUP" == false ]] && [[ -d "$BACKUP_DIR" ]]; then
    echo -e "${BLUE}${BOLD}Backup Location:${NC} $BACKUP_DIR"
    echo ""
  fi
  echo -e "${GREEN}${BOLD}Enjoy your minimal Wayland rice!${NC}"
}

# Main installation function
main() {
  parse_args "$@"
  
  clear
  echo -e "${CYAN}${BOLD}"
  echo "╔═════════════════════════════════════════════════════╗"
  echo "║                                                     ║"
  echo "║            Dotfiles Installation Script             ║"
  echo "║                                                     ║"
  echo "║      Hyprland + Waybar Rice Setup (Stow-based)      ║"
  echo "║                                                     ║"
  echo "╚═════════════════════════════════════════════════════╝"
  echo -e "${NC}"
  echo ""
  echo -e "Installation location: ${CYAN}$DOTFILES_DIR${NC}"
  echo ""
  
  if [[ "$LINKS_ONLY" == false ]]; then
    check_prerequisites
    install_paru
    update_system
    install_packages
  fi
  
  if [[ "$PACKAGES_ONLY" == false ]]; then
    backup_configs
    create_symlinks
    enable_services
    setup_zsh
    create_directories
  fi
  
  print_post_install
}

main "$@"
