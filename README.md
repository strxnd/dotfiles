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

Install Stow if needed:

```sh
brew install stow          # macOS
sudo pacman -S stow        # Arch Linux
```

Link the packages for your OS:

```sh
# Arch Linux
stow --restow common linux

# macOS
stow --restow common darwin
```

Preview with `stow --no --verbose common linux` (or `common darwin`) and unlink
with `stow --delete <packages>`. Stow will stop if an existing regular file
would be overwritten.

Install Kitty and the other desktop packages separately. MangoWC starts `qs` and
`swaybg`. The Quickshell bar uses MangoWC tags via `mmsg`, Iosevka Nerd Font icons, and PipeWire audio.
Wi-Fi controls require NetworkManager; Bluetooth controls require BlueZ.
Ethernet status also works with `dhcpcd`. The network panel reads link details
with `ip` and measures latency with `ping` from `iputils`. Wi-Fi band controls
require an active NetworkManager connection.

On Linux, install the Kanagawa Dragon GTK and Kvantum themes, Papirus icons,
Bibata cursor, and Iosevka font separately. The GTK, Qt, and xsettingsd settings
select these installed themes. Do not Stow over existing local settings files;
review and move them aside before restowing `linux`.

After installing `spotify-launcher` and `spicetify-cli`, sign in to Spotify once,
close it, and run `~/dotfiles/scripts/setup-spicetify`. The script downloads pinned
versions of the Spicetify text theme and visualizer, sets the Kanagawa Dragon
colors and Iosevka font, and applies them. Spicetify's generated config and
Spotify account data stay outside the repo.
