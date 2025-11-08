# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a dotfiles repository for a minimal, performant **Wayland rice** (Hyprland + Waybar) built for Arch Linux. The setup prioritizes performance (~120-150 MB RAM usage), minimalism, and clean aesthetics.

## Installation & Setup

### Initial Installation
```bash
# Interactive installation (recommended)
./install.sh

# Auto-install without prompts
./install.sh --auto-yes

# Install only packages (skip symlinking)
./install.sh --packages-only

# Install only configs (skip package installation)
./install.sh --links-only

# Minimal install (skip oh-my-posh, fastfetch)
./install.sh --minimal
```

### How Dotfiles Are Managed

**This repository uses GNU Stow for symlink management**, not manual symlinks or copy operations. The structure is:
- `dotfiles/.zshrc` → symlinked to `~/.zshrc`
- `dotfiles/.config/*` → symlinked to `~/.config/*`

When modifying or adding dotfiles:
1. Edit files in this repository directory
2. Run `stow -v .` from the dotfiles directory to update symlinks
3. Changes are immediately reflected in `$HOME` via symlinks

## Core Stack

### Window Manager & Wayland
- **Hyprland**: Dynamic tiling Wayland compositor (config: `.config/hypr/hyprland.conf`)
- **Waybar**: Status bar with modular configuration (config: `.config/waybar/config.jsonc`)
- **Fuzzel**: Application launcher
- **SwayNC**: Notification daemon with control center
- **Hyprpaper**: Wallpaper manager
- **Hypridle**: Idle management daemon
- **Hyprlock**: Screen locker

### Terminal & Shell
- **WezTerm**: GPU-accelerated cross-platform terminal emulator
- **Zsh**: Shell with Zinit plugin manager
- **Oh-my-posh**: Shell prompt (config: `~/.config/oh-my-posh/config.toml`)
- **Fastfetch**: System info display on shell startup

### Editor & Browser
- **Neovim** (NvChad-based configuration)
  - Entry point: `.config/nvim/init.lua`
  - Uses NvChad v2.5 as a plugin via lazy.nvim
  - Custom plugins in `.config/nvim/lua/plugins/`
  - LSP config: `.config/nvim/lua/configs/lspconfig.lua`
  - Formatters: `.config/nvim/lua/configs/conform.lua`
  - Theme: Custom Catppuccin Black variant
- **Qutebrowser**: Keyboard-driven browser (config: `.config/qutebrowser/config.py`)

## Configuration Architecture

### Zsh Configuration (.zshrc)
- **Zinit**: Plugin manager (auto-installs on first launch)
- **Plugins**: zsh-completions, zsh-autosuggestions, fzf-tab, fast-syntax-highlighting
- **OMZ snippets**: git, sudo, archlinux, command-not-found
- **Integrations**: zoxide (smart cd), oh-my-posh (prompt)
- **Aliases**: `ls` → `lsd`, `c` → `clear`

### Neovim Architecture (NvChad-based)
The config follows NvChad v2.5 structure:
- **Main config**: Import NvChad base, then layer custom configs
- **Plugin management**: lazy.nvim (bootstrapped in init.lua)
- **Module structure**:
  - `lua/options.lua`: Editor options
  - `lua/mappings.lua`: Keybindings
  - `lua/plugins/*.lua`: Custom plugin configurations
  - `lua/configs/*.lua`: Plugin setup modules
  - `lua/chadrc.lua`: NvChad-specific configuration

When modifying Neovim config:
1. Custom plugins go in `lua/plugins/` as separate files
2. Plugin configurations go in `lua/configs/`
3. Import them in init.lua if needed
4. Run `:Lazy sync` to update plugins

### Hyprland Configuration
Main config: `.config/hypr/hyprland.conf`

Key settings:
- **Layout**: dwindle (dynamic tiling)
- **Main modifier**: SUPER (Windows key)
- **Autostart**: waybar, hyprpaper, swaync (line 46-48)
- **Default programs**:
  - Terminal: wezterm
  - File manager: yazi
  - Launcher: fuzzel
- **Keybindings**:
  - `SUPER + Return`: Terminal
  - `SUPER + Q`: Kill active window
  - `SUPER + M`: Exit Hyprland
  - `SUPER + E`: File manager
  - `SUPER + Space`: Launcher
  - `SUPER + h/j/k/l`: Vim-style focus movement
  - `SUPER + [1-9,0]`: Switch workspace
  - `SUPER + SHIFT + [1-9,0]`: Move window to workspace
  - Media keys for volume/brightness control

### Waybar Configuration
**Modular architecture** with separate JSON files for each module:
- **Main config**: `.config/waybar/config.jsonc`
- **Modules directory**: `.config/waybar/modules/` - each module defined in its own `.jsonc` file
- **Scripts**: `.config/waybar/scripts/` - bash scripts for custom modules (network, power-menu, bluetooth, volume, backlight, system-update)
- **Styling**: `.config/waybar/styles/` and `.config/waybar/themes/` - CSS for theming

Module structure:
- **Left**: user, workspaces, window
- **Center**: window count, temperature, memory, cpu, distro, idle inhibitor, clock, network, bluetooth, system updates
- **Right**: mpris, pulseaudio, backlight, battery, power menu

When modifying Waybar:
1. Edit individual module files in `modules/` or `modules/custom/`
2. Add new modules to the `include` array in `config.jsonc`
3. Styling changes go in `styles/` or `themes/`
4. Restart Waybar: `killall waybar && waybar &`

### Directory Structure
```
dotfiles/
├── .zshrc                    # Shell configuration
├── .config/
│   ├── wezterm/              # Terminal configuration
│   ├── hypr/
│   │   ├── hyprland.conf     # Main Hyprland configuration
│   │   └── hyprpaper.conf    # Wallpaper configuration
│   ├── waybar/               # Status bar configuration
│   │   ├── config.jsonc      # Main Waybar config (includes modules)
│   │   ├── modules/          # Module definitions (.jsonc files)
│   │   ├── scripts/          # Bash scripts for custom modules
│   │   ├── styles/           # CSS styling
│   │   └── themes/           # Color themes
│   ├── swaync/               # Notification daemon
│   │   ├── config.json       # SwayNC configuration
│   │   └── style.css         # Notification styling
│   ├── fuzzel/               # Application launcher config
│   ├── qutebrowser/          # Browser configs
│   │   └── config.py
│   ├── oh-my-posh/
│   │   └── config.toml       # Shell prompt theme
│   └── nvim/                 # Neovim (NvChad-based)
│       ├── init.lua          # Entry point
│       └── lua/
│           ├── options.lua
│           ├── mappings.lua
│           ├── chadrc.lua
│           ├── plugins/      # Custom plugin specs
│           ├── configs/      # Plugin configurations
│           └── themes/       # Custom themes
└── install.sh                # Installation script
```

## Development Workflow

### Adding New Dotfiles
1. Add the file/directory to this repository in the correct location
2. Run `stow -v .` to create symlinks
3. Existing files must be removed or backed up before stowing

### Modifying Installation Script
The `install.sh` script is modular with functions for:
- `install_package()`: Install single package with confirmation
- `install_package_group()`: Install package groups
- `backup_configs()`: Backup existing configs before installation
- `create_symlinks()`: Use GNU Stow to create symlinks
- `enable_services()`: Enable systemd services (pipewire, NetworkManager)

### Package Installation Flow
1. Check prerequisites (Arch Linux, sudo, internet)
2. Install paru AUR helper (if needed)
3. Update system packages
4. Install package groups:
   - Fonts (JetBrains Mono Nerd, Nerd Font symbols)
   - Shell & Editor (zsh, neovim, gcc, nodejs, ripgrep, fd, lazygit, etc.)
   - Wayland/Hyprland stack
   - Utilities (fuzzel, swaync, grim, slurp, wl-clipboard, cliphist, yazi)
   - Audio/Network (pipewire, wireplumber, NetworkManager)
   - System integration (xdg-desktop-portal-hyprland, polkit-gnome, stow)
5. Backup existing configs to `~/.config_backup_YYYYMMDD_HHMMSS`
6. Stow dotfiles (create symlinks)
7. Enable services
8. Set zsh as default shell

## Important Notes

### Nvidia Users
Add to `.zshrc`:
```bash
export WLR_NO_HARDWARE_CURSORS=1
export GBM_BACKEND=nvidia-drm
export __GLX_VENDOR_LIBRARY_NAME=nvidia
```

### First Launch Behavior
- Zinit auto-downloads zsh plugins on first zsh launch
- Neovim plugins auto-install on first `nvim` launch
- LSP servers install via Mason when needed

### Expected Directories
The installer creates:
- `~/.local/share/wallpapers` (wallpaper storage)
- `~/.local/share/screenshots` (screenshot storage)

## System Integration

### Services (systemd)
- **User services**: pipewire, pipewire-pulse, wireplumber (audio)
- **System services**: NetworkManager

### Utilities
- **Screenshots**: grim + slurp
- **Clipboard**: wl-clipboard + cliphist (clipboard history)
- **File manager**: yazi (TUI)
- **Audio control**: pulsemixer (TUI)
- **Network management**: nmtui (TUI)

## Testing Configuration Changes

### Hyprland
After modifying `.config/hypr/hyprland.conf`:
```bash
# Reload configuration (SUPER + SHIFT + R usually, or manually)
hyprctl reload

# Check for configuration errors
hyprctl version

# View current configuration
hyprctl monitors
hyprctl workspaces
```

### Waybar
After modifying Waybar configs:
```bash
# Restart Waybar
killall waybar && waybar &

# Check for JSON syntax errors before restarting
jq . ~/.config/waybar/config.jsonc

# Run in debug mode to see errors
waybar --log-level debug
```

### Neovim
After modifying Neovim configs:
1. Restart Neovim
2. Run `:Lazy sync` to sync plugins
3. Run `:checkhealth` to verify setup

### Zsh
After modifying `.zshrc`:
```bash
# Reload configuration
source ~/.zshrc

# Or restart terminal
```

### Applying Stow Changes
After adding/modifying dotfiles:
```bash
cd /path/to/dotfiles
stow -v .          # Create/update symlinks
stow -D .          # Remove symlinks (unstow)
stow -R .          # Restow (remove then create)
```
