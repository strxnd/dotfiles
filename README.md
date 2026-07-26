# Dotfiles

Personal macOS and Arch Linux dotfiles managed with [GNU Stow](https://www.gnu.org/software/stow/).

## Setup

Clone the repository into your home directory:

```sh
git clone https://github.com/strxnd/dotfiles.git ~/dotfiles
cd ~/dotfiles
```

Install Stow if needed:

```sh
brew install stow          # macOS
sudo pacman -S stow        # Arch Linux
```

Stow the packages for the current platform.

### macOS

```sh
stow fastfetch ghostty ghostty-macos nvim oh-my-posh skhd zsh
```

### Arch Linux

```sh
stow fastfetch fuzzel ghostty ghostty-linux hypr nvim oh-my-posh swaync waybar zsh
```

Stow links each package into `$HOME`. Preview changes with `stow --no --verbose <packages>` and remove links with `stow --delete <packages>`.

Package installation and system configuration are intentionally separate from Stow.
