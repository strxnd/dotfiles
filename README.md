# Dotfiles

Personal macOS and Arch Linux dotfiles managed with [GNU Stow](https://www.gnu.org/software/stow/).

The repo tracks portable user overrides only. Machine-specific files such as
`~/.config/mango/local.conf` stay on the machine.

## Layout

- `common`: shared Git, mise, Neovim, Oh My Posh, tmux, and Zsh config.
- `darwin`: macOS Ghostty config.
- `linux`: Arch Linux Kitty, MangoWC, and Quickshell.

Each folder is a Stow package whose contents mirror paths under `$HOME`.

## Setup

Clone into your home directory:

```sh
git clone https://github.com/strxnd/dotfiles.git ~/dotfiles
cd ~/dotfiles
```

On Arch Linux, preview the packages and links, then run the interactive installer:

```sh
./install.sh --dry-run
./install.sh
```

It can set up the [official CachyOS repositories](https://wiki.cachyos.org/features/optimized_repos/),
then offers the CachyOS kernel and matching headers before optional NVIDIA,
networking, Bluetooth, and PipeWire steps. Desktop, editor, and shell packages
follow. Every step asks before it acts; pacman and yay use `--noconfirm` after
your answer. If `yay` is missing, the script offers to build `yay-bin` after
you review its build recipe.
It also asks before enabling services, applying Spicetify, or linking dotfiles.
A new kernel or GPU driver needs a reboot and may require a bootloader update.
The installer never reboots the machine.
Stow refuses to overwrite existing regular files. Review and move them aside
before retrying. Unlink with `stow --delete <packages>`.

On macOS, install Stow with `brew install stow`, then run `stow --restow common darwin`.
MangoWC starts `qs` and
`swaybg`. The Quickshell bar uses MangoWC tags via `mmsg`, Iosevka Nerd Font icons, and PipeWire audio.
Wi-Fi controls require NetworkManager; Bluetooth controls require BlueZ.
Ethernet status also works with `dhcpcd`. The network panel reads link details
with `ip` and measures latency with `ping` from `iputils`. Wi-Fi band controls
require an active NetworkManager connection.

Install the Kanagawa Dragon GTK and Kvantum theme assets separately; the
installer handles the Papirus icons, Bibata cursor, and Iosevka font. The GTK,
Qt, and xsettingsd settings select these installed themes. Do not Stow over
existing local settings files; review and move them aside before restowing `linux`.

After installing `spotify-launcher` and `spicetify-cli`, sign in to Spotify once,
close it, and run `~/dotfiles/scripts/setup-spicetify`. The script downloads pinned
versions of the Spicetify text theme and visualizer, sets the Kanagawa Dragon
colors and Iosevka font, and applies them. Spicetify's generated config and
Spotify account data stay outside the repo.
