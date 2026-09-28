# Agent Notes

## Repository Purpose and Shape
- This is a personal macOS and Arch Linux dotfiles repository managed with GNU Stow.
- The `common`, `linux`, and `darwin` directories are Stow packages whose contents mirror paths under `$HOME`.
  - `common/.config/nvim/...` links to `~/.config/nvim/...`.
  - `common/.zshrc` links to `~/.zshrc`.
  - `linux/.config/mango/config.conf` links to `~/.config/mango/config.conf`.
- `.stowrc` targets the repository parent, so the expected repository location is `~/dotfiles`.
- Track portable user config only. Keep machine-specific monitor settings, generated state, browser profiles, and secrets out of the repo.
- Package installation is separate from Stow. Apply the appropriate packages manually with `stow --restow`.
- There is no CI or repo-wide test runner. Validate the specific tool/config changed.

## Packages
- `common`: Git, mise, Neovim, Oh My Posh, tmux, and Zsh.
- `linux`: Kitty, MangoWC, and Quickshell.
- `darwin`: Ghostty.

## Common Workflow
- Check current work before editing: `git status --short`.
- Preview links before applying: `stow --no --verbose <packages>`.
- Apply package changes from the repository root with `stow --restow <packages>`.
- Remove package links with `stow --delete <packages>`.
- Never use `stow --adopt` without reviewing the target files first because it can overwrite repository content.
- Preserve unrelated user changes and avoid broad formatting outside touched files.
- Use commit message prefixes matching the user's style: `chore:`, `fix:`, or `feat:`.

## Neovim / NvChad
- NvChad is loaded as a lazy.nvim plugin from `common/.config/nvim/init.lua`; local plugin specs live in `common/.config/nvim/lua/plugins/`.
- Test the source config directly with:
  ```sh
  XDG_CONFIG_HOME="$PWD/common/.config" nvim --headless +qa
  ```
- For LSP changes, also run:
  ```sh
  XDG_CONFIG_HOME="$PWD/common/.config" nvim --headless "+checkhealth vim.lsp" +qa
  ```
- Follow current NvChad LSP style: the `neovim/nvim-lspconfig` plugin spec calls `require "configs.lspconfig"`; `configs/lspconfig.lua` calls `require("nvchad.configs.lspconfig").defaults()` and enables extra servers with `vim.lsp.enable(...)`.
- Do not add deprecated `require("lspconfig").SERVER.setup(...)` calls.
- Current intended language tooling is Lua/NvChad defaults plus C. Mason packages include `clangd`, `clang-format`, `codelldb`, `lua-language-server`, and `stylua`.
- Format Lua with the installed `stylua`, using `common/.config/nvim/.stylua.toml`.
- `lazy-lock.json` is tracked; update it deliberately and avoid accidental broad plugin upgrades.

## Desktop Dotfiles
- MangoWC config belongs in `linux/.config/mango/`. Keep display-specific settings in `~/.config/mango/local.conf`.
- Quickshell config belongs in `linux/.config/quickshell/`; MangoWC starts it from `config.conf`.
- Kitty config lives in `linux/.config/kitty/` on Arch Linux; Ghostty remains in `darwin/.config/ghostty/` on macOS.
- Executable scripts must retain executable mode.

## Shell Configuration
- `common/.zshrc` bootstraps zinit and sources mise, oh-my-posh, and zoxide.
- Do not add `command -v` guards around these expected shell integrations.
- Paths under `$HOME` must stay portable across Linux and macOS. Do not hardcode `/home/kumar`.
- Validate syntax with `zsh -n common/.zshrc`; do not launch an interactive shell solely for validation.

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
