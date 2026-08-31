# Agent Notes

## Repository Purpose and Shape
- This is a personal macOS and Omarchy/Arch Linux dotfiles repository managed with GNU Stow.
- Each top-level application directory is a Stow package whose contents mirror paths under `$HOME`.
  - `nvim/.config/nvim/...` links to `~/.config/nvim/...`.
  - `zsh/.zshrc` links to `~/.zshrc`.
  - `skhd/.skhdrc` links to `~/.skhdrc`.
- `.stowrc` targets the repository parent, so the expected repository location is `~/dotfiles`.
- Track portable user overrides only. Do not add Omarchy stock files, `monitors.lua`, first-boot invitation hooks, generated theme state, browser profiles, or secrets.
- Package installation is separate from Stow. `setup.sh` only backs up colliding regular files and restows.
- There is no CI or repo-wide test runner. Validate the specific tool/config changed.

## Packages
- Common: `git`, `mise`, `nvim`, `oh-my-posh`, `zsh`.
- Omarchy/Linux: `ghostty-linux`, `hypr` (`bindings.lua` only), `omarchy` (`shell.json`, `shell.toml`, `defaults/agent`).
- macOS: `ghostty`, `ghostty-macos`, `skhd`.
- Legacy Waybar, SwayNC, Fuzzel, and Hyprland `.conf` packages are gone. Do not re-add them.

## Common Workflow
- Check current work before editing: `git status --short`.
- Preview links before applying: `stow --no --verbose <packages>`.
- Apply package changes from the repository root with `stow --restow <packages>`.
- Remove package links with `stow --delete <packages>`.
- Never use `stow --adopt` without reviewing the target files first because it can overwrite repository content.
- Preserve unrelated user changes and avoid broad formatting outside touched files.
- Use commit message prefixes matching the user's style: `chore:`, `fix:`, or `feat:`.

## Neovim / NvChad
- NvChad is loaded as a lazy.nvim plugin from `nvim/.config/nvim/init.lua`; local plugin specs live in `nvim/.config/nvim/lua/plugins/`.
- Test the source config directly with:
  ```sh
  XDG_CONFIG_HOME="$PWD/nvim/.config" nvim --headless +qa
  ```
- For LSP changes, also run:
  ```sh
  XDG_CONFIG_HOME="$PWD/nvim/.config" nvim --headless "+checkhealth vim.lsp" +qa
  ```
- Follow current NvChad LSP style: the `neovim/nvim-lspconfig` plugin spec calls `require "configs.lspconfig"`; `configs/lspconfig.lua` calls `require("nvchad.configs.lspconfig").defaults()` and enables extra servers with `vim.lsp.enable(...)`.
- Do not add deprecated `require("lspconfig").SERVER.setup(...)` calls.
- Current intended language tooling is Lua/NvChad defaults plus C. Mason packages include `clangd`, `clang-format`, `codelldb`, `lua-language-server`, and `stylua`.
- Format Lua with the installed `stylua`, using `nvim/.config/nvim/.stylua.toml`.
- `lazy-lock.json` is tracked; update it deliberately and avoid accidental broad plugin upgrades.

## Obsidian / Neovim
- Obsidian.nvim config lives at `nvim/.config/nvim/lua/plugins/obsidian.lua`.
- The configured vault workspace is `~/personal-os`; do not edit the vault from this repository.
- New notes default to `0. Inbox`; daily notes go under `0. Inbox/Daily Notes`.
- Templates are expected under the vault's `9. System/Templates` folder.

## Desktop Dotfiles
- Linux Hyprland overrides belong in `hypr/.config/hypr/`. Only ship files that differ from Omarchy's packaged defaults. `monitors.lua` is machine-local and must not be stowed.
- Omarchy shell, font size, and default agent belong in the `omarchy` package. Edit those files here, then restow `omarchy`. Do not copy `/usr/share/omarchy/` into the repo.
- Linux Ghostty is `ghostty-linux` (Omarchy theme include, font size 11). macOS Ghostty is `ghostty` plus `ghostty-macos`.
- `skhd` is macOS-only. Yabai config and `hypr-mac-*` helper scripts are not in this repository yet; add them from the Air when editing there.
- Executable scripts must retain executable mode.

## Shell Configuration
- `zsh/.zshrc` bootstraps zinit and sources mise, oh-my-posh, and zoxide.
- Do not add `command -v` guards around these expected shell integrations.
- Paths under `$HOME` must stay portable across Linux and macOS. Do not hardcode `/home/kumar`.
- Validate syntax with `zsh -n zsh/.zshrc`; do not launch an interactive shell solely for validation.

## Safety and Secrets
- Do not reveal, decrypt, print, or modify secrets.
- Treat `*.sops.yaml`, `age.key`, kubeconfigs, Talos secrets, cluster credentials, API keys, tokens, and auth/session files as sensitive.
- Prefer local validation before commands that touch clusters, live infrastructure, package managers, or external services.
- Avoid destructive commands and broad deletes unless explicitly requested and scoped.
- Never commit generated secrets, decrypted files, kubeconfigs, or local auth/session state.

## Editing Conventions
- Use exact, minimal edits and keep existing style.
- Edit files inside their Stow package, then restow only the affected package when approved.
- Show changed paths and validation commands in the final response.
