# Dotfiles

Personal macOS and Omarchy/Arch Linux dotfiles managed with [GNU Stow](https://www.gnu.org/software/stow/).

The repo tracks portable user overrides only. Omarchy still owns stock Hyprland
files, themes, first-boot hooks, and generated theme state. Machine-specific
files such as `~/.config/hypr/monitors.lua` stay on the machine.

## Layout

- `common`: shared Git, mise, Neovim, Oh My Posh, tmux, and Zsh config.
- `darwin`: macOS Ghostty config.
- `linux`: Omarchy/Linux Ghostty, Hyprland, and Omarchy config.

Each folder is a Stow package whose contents mirror paths under `$HOME`.

## Setup

Clone into your home directory:

```sh
git clone https://github.com/strxnd/dotfiles.git ~/dotfiles
cd ~/dotfiles
```

Install Stow if needed:

```sh
brew install stow          # macOS
sudo pacman -S stow        # Arch Linux
```

Link the packages for your OS:

```sh
# Omarchy/Linux
stow --restow common linux

# macOS
stow --restow common darwin
```

Preview with `stow --no --verbose common linux` (or `common darwin`) and unlink
with `stow --delete <packages>`. Stow will stop if an existing regular file
would be overwritten.

Install packages yourself. On a new Omarchy box, also set the look this machine
uses:

```sh
omarchy theme set tokyo-night
omarchy font set "JetBrainsMono Nerd Font"
```
