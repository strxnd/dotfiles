# Dotfiles

Personal macOS and Omarchy/Arch Linux dotfiles managed with [GNU Stow](https://www.gnu.org/software/stow/).

The repo tracks portable user overrides only. Omarchy still owns stock Hyprland
files, themes, first-boot hooks, and generated theme state. Machine-specific
files such as `~/.config/hypr/monitors.lua` stay on the machine.

## Packages

Shared: `git`, `mise`, `nvim`, `oh-my-posh`, `zsh`.

Omarchy/Linux: `ghostty-linux`, `hypr` (vim-style binds), `omarchy` (shell bar,
font size, default agent).

macOS: `ghostty`, `ghostty-macos`, `skhd`.

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

Link the packages for this OS:

```sh
./setup.sh
```

`setup.sh` backs up any regular file that would collide, then restows. Preview
with `stow --no --verbose <packages>` and unlink with `stow --delete <packages>`.

Install packages yourself. On a new Omarchy box, also set the look this machine
uses:

```sh
omarchy theme set tokyo-night
omarchy font set "JetBrainsMono Nerd Font"
```
