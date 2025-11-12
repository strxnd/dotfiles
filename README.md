# dotfiles

> A minimal, performant Wayland rice built for speed and aesthetics

## Showcase

<!-- Add your screenshots here -->

### Desktop
![Desktop]()

### Terminal
![Terminal]()

### Launcher
![Launcher]()

---

## Overview

A carefully curated Wayland setup prioritizing **performance**, **minimalism**, and **clean aesthetics**. Every component is chosen to be lightweight while maintaining a polished look.

### Core Components

| Component | Tool | Why |
|-----------|------|-----|
| **Display Server** | Wayland | Modern, secure, smooth |
| **Window Manager** | [Hyprland](https://github.com/hyprwm/Hyprland) | Dynamic tiling Wayland compositor |
| **Status Bar** | [Waybar](https://github.com/Alexays/Waybar) | Highly customizable, CSS theming |
| **Launcher** | [Fuzzel](https://codeberg.org/dnkl/fuzzel) | Blazingly fast, minimal |
| **Terminal** | [WezTerm](https://wezfurlong.org/wezterm/) | GPU-accelerated, cross-platform, Rust-based |
| **Notifications** | [SwayNC](https://github.com/ErikReider/SwayNotificationCenter) | Feature-rich notification daemon with control center |
| **Editor** | [Neovim](https://neovim.io/) | NvChad-based configuration |

### Utilities

| Tool | Purpose |
|------|---------|
| **Hyprlock** | Screen locking |
| **Hypridle** | Idle management |
| **Hyprpaper** | Wallpaper manager |
| **Grim + Slurp** | Screenshots |
| **Cliphist** | Clipboard history |
| **yazi** | Modern TUI file manager |
| **pulsemixer** | TUI audio control |
| **nmtui** | TUI network manager |

### System

- **Audio:** Pipewire + Wireplumber
- **Network:** NetworkManager
- **Clipboard:** wl-clipboard

---

## Installation

Clone the repository:

```bash
git clone https://github.com/yourusername/dotfiles.git ~/.dotfiles
cd ~/.dotfiles
chmod +x install.sh
```

Run the interactive installer:

```bash
./install.sh
```

### Installation Options

```bash
# Interactive installation (recommended)
./install.sh

# Auto-install without prompts
./install.sh --auto-yes

# Install only packages
./install.sh --packages-only

# Install only configs (skip packages)
./install.sh --links-only

# Minimal install (skip oh-my-posh, fastfetch)
./install.sh --minimal
```

### Nvidia Users

If using Nvidia drivers (`nvidia` or `nvidia-open`), add these to your `.zshrc`:

```bash
# Nvidia Wayland support
export WLR_NO_HARDWARE_CURSORS=1
export GBM_BACKEND=nvidia-drm
export __GLX_VENDOR_LIBRARY_NAME=nvidia
```

---

## Performance

Estimated RAM usage (all utilities running): **~120-150 MB**

This setup is designed to be resource-efficient without compromising on functionality or aesthetics.

---

## Credits

Inspired by the Linux ricing community and built with ❤️ for Wayland.

---

## License

MIT
