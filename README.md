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

Stow the packages for the current platform:

```sh
./setup.sh
```

The script detects macOS or Linux and links the matching packages into `$HOME`. Preview individual packages with `stow --no --verbose <packages>` and remove links with `stow --delete <packages>`.

Package installation and system configuration are intentionally separate from Stow.
