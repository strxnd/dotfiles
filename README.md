# Dotfiles

Personal macOS and Arch Linux dotfiles managed with [GNU Stow](https://www.gnu.org/software/stow/).

The repo tracks portable user overrides only. Machine-specific files such as
`~/.config/mango/local.conf` stay on the machine.

## Layout

Each tool has its own Stow package. Shared packages are `zsh`, `mise`, `nvim`,
and `oh-my-posh`. Arch Linux packages are `kitty`, `mango`, `quickshell`,
`kvantum`, `qt-theme`, `gtk`, `qt5ct`, `qt6ct`, and `xsettingsd`.
Each package mirrors paths under `$HOME`: `zsh/.zshrc` links to `~/.zshrc`,
for example. Kitty defaults to 14 pt. To change its font size on one machine,
create `~/.config/kitty/local.conf` with `font_size 12` (or your preferred size).
Kitty loads this optional file after the shared config; it stays untracked.

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
before retrying. Unlink with `stow --delete <packages>`. If you stowed the old layout, preview the new packages first. Stow can replace
old links pointing into this repo during restow. Review any reported conflicts
before changing local files.

On macOS, install Stow with `brew install stow`, then run
`stow --restow zsh mise nvim oh-my-posh` for the shared configs.
MangoWC starts `qs` and
`swaybg`. The Quickshell bar uses MangoWC tags via `mmsg`, Iosevka Nerd Font icons, and PipeWire audio.
Wi-Fi controls require NetworkManager; Bluetooth controls require BlueZ.
Ethernet status also works with `dhcpcd`. The network panel reads link details
with `ip` and measures latency with `ping` from `iputils`. Wi-Fi band controls
require an active NetworkManager connection.

Install the Kanagawa Dragon GTK and Kvantum theme assets separately; the
installer handles the Papirus icons, Bibata cursor, and Iosevka font. The GTK,
Qt, and xsettingsd settings select these installed themes. Do not Stow over
existing local settings files; review and move them aside before restowing the affected package.

After installing `spotify-launcher` and `spicetify-cli`, sign in to Spotify once,
close it, and run `~/dotfiles/install.sh --spicetify`. The installer downloads
pinned versions of the Spicetify text theme and visualizer, sets the Kanagawa
Dragon colors and Iosevka font, and applies them. Spicetify's generated config and
Spotify account data stay outside the repo.
