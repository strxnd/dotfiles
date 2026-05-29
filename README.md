# Dotfiles managed with chezmoi

Clone this repository and run the bootstrap script:

```bash
git clone https://github.com/strxnd/dotfiles.git ~/.local/share/chezmoi
cd ~/.local/share/chezmoi
./install.sh
```

The installer ensures `chezmoi` is available, then runs:

```bash
chezmoi --source "$PWD" apply
```

Package installation is handled by chezmoi during apply:

- Arch Linux: pacman packages plus AUR packages via `yay`
- macOS: Homebrew formulae and casks
