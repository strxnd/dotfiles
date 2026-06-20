# Agent Notes

## Repository Purpose and Shape
- This is a personal dotfiles repository managed by chezmoi with Linux/Arch and macOS support.
- Edit chezmoi source files in this repo, not rendered live files under `~`.
  - `dot_config/...` renders to `~/.config/...`
  - `dot_zshrc` renders to `~/.zshrc`
  - `dot_pi/...` renders to `~/.pi/...`
  - `dot_themes/...` renders to `~/.themes/...`
- `install.sh` is a thin bootstrapper: it ensures `chezmoi` exists, then runs `chezmoi --source "$SCRIPT_DIR" apply`.
- Package installation is handled by chezmoi run scripts, not directly by `install.sh`:
  - `run_onchange_before_10-install-packages-linux.sh.tmpl` installs Arch pacman/AUR packages.
  - `run_onchange_before_10-install-packages-darwin.sh.tmpl` installs Homebrew formulae/casks.
- `.chezmoiignore.tmpl` excludes repo/operator files and skips Linux desktop configs on non-Linux systems.
- There is no CI or repo-wide test runner. Validate the specific tool/config you changed.

## Important Directories and Files
- `dot_config/nvim/`: NvChad-based Neovim config using lazy.nvim.
- `dot_config/hypr/`: Hyprland, hyprlock, hyprpaper, monitor, workspace, and override configs.
- `dot_config/waybar/`: Waybar config, modules, scripts, styles, themes, and assets.
- `dot_config/swaync/`: SwayNC notification center config.
- `dot_config/wezterm/`: WezTerm config.
- `dot_config/oh-my-posh/`: prompt theme/config.
- `dot_pi/`: pi settings, agent settings, extensions, themes, and extension package manifests.
- `dot_themes/`: Linux desktop theme assets; ignored on non-Linux via `.chezmoiignore.tmpl`.
- `dot_zshrc`: zsh setup, aliases, expected shell integrations, and startup commands.
- `install.sh`: bootstrap only; keep package lists in the OS-specific `run_onchange_before_*` scripts.

## Common Workflow
- Check current work before editing: `git status --short`.
- Preview rendered changes: `chezmoi diff`.
- Be careful with `chezmoi apply`: it can run `run_onchange_before_*` package installer scripts when those rendered scripts change.
- Apply targeted changes when possible, e.g. `chezmoi apply ~/.config/nvim` or `chezmoi apply ~/.zshrc`.
- Use `chezmoi apply --force <target>` only when intentionally overwriting a live file that chezmoi reports as locally changed.
- After applying, verify the changed tool directly; do not assume a successful apply means the application config is valid.
- Preserve unrelated user changes shown by `git status` and avoid broad formatting outside touched files.
- Use commit message prefixes matching the user's style: `chore:`, `fix:`, or `feat:`.

## Chezmoi and OS-Specific Bootstrap
- Keep `.chezmoiignore.tmpl` rendered output valid for Linux and macOS. Test with:
  ```sh
  chezmoi execute-template -f .chezmoiignore.tmpl
  ```
- Keep run script shebangs as the first bytes of the rendered scripts. Do not put template guards before `#!/usr/bin/env bash`; otherwise chezmoi can fail with `exec format error`.
- Validate package scripts without applying packages:
  ```sh
  chezmoi execute-template -f run_onchange_before_10-install-packages-linux.sh.tmpl > /tmp/install-packages-linux.sh
  bash -n /tmp/install-packages-linux.sh
  chezmoi execute-template -f run_onchange_before_10-install-packages-darwin.sh.tmpl > /tmp/install-packages-darwin.sh
  bash -n /tmp/install-packages-darwin.sh
  ```
- Linux package support currently assumes Arch. Official repo packages go in `PACMAN_PACKAGES`; AUR packages go in `AUR_PACKAGES` and are installed with `yay`.
- macOS package support uses Homebrew. Formulae go in `BREW_FORMULAE`; GUI apps/fonts go in `BREW_CASKS`.
- Do not run package installation, full `chezmoi apply`, or Homebrew/bootstrap commands without user approval when they may mutate the system.

## Neovim / NvChad
- NvChad is loaded as a lazy.nvim plugin from `dot_config/nvim/init.lua`; local plugin specs live in `dot_config/nvim/lua/plugins/`.
- Test the chezmoi source config with:
  ```sh
  XDG_CONFIG_HOME="/home/kumaraarav/.local/share/chezmoi/dot_config" nvim --headless +qa
  ```
  Plain `nvim` loads the applied `~/.config/nvim` instead.
- For LSP changes, also run:
  ```sh
  XDG_CONFIG_HOME="/home/kumaraarav/.local/share/chezmoi/dot_config" nvim --headless "+checkhealth vim.lsp" +qa
  ```
- Follow current NvChad LSP style: plugin spec for `neovim/nvim-lspconfig` calls `require "configs.lspconfig"`; `configs/lspconfig.lua` calls `require("nvchad.configs.lspconfig").defaults()` and enables extra servers with `vim.lsp.enable(...)`.
- Do not add new deprecated `require("lspconfig").SERVER.setup(...)` calls.
- Current intended language tooling is Lua/NvChad defaults plus C. Mason packages in `lua/chadrc.lua` include `clangd`, `clang-format`, `codelldb`, `lua-language-server`, and `stylua`.
- Format Lua with:
  ```sh
  "/home/kumaraarav/.local/share/nvim/mason/bin/stylua" --config-path "dot_config/nvim/dot_stylua.toml" "dot_config/nvim/lua"
  ```
- `lazy-lock.json` is tracked; update it deliberately when adding/removing Neovim plugins. Avoid accidental broad plugin upgrades unless requested.

## Obsidian / Neovim
- Obsidian.nvim config lives at `dot_config/nvim/lua/plugins/obsidian.lua`.
- The configured vault workspace is `~/dev/second-brain` with minimal PARA folders. Do not edit the vault itself from this repo.
- Do not add Inbox, Maps, Attachments, or daily-note workflows unless explicitly requested.
- Templates are expected under the vault's `Templates/` folder.

## Desktop Dotfiles
- Hyprland uses an end-4-style split config: `dot_config/hypr/hyprland.conf` sources category files under `dot_config/hypr/hyprland/`, empty override files under `dot_config/hypr/custom/`, plus `monitors.conf` and `workspaces.conf`.
- Hyprland monitor assumptions are hard-coded in `dot_config/hypr/monitors.conf` for monitor `DP-1` at `3840x2160@240` with scale `1.5`; check before changing display assumptions.
- `hyprlock.conf` references `~/.config/hypr/colors.conf` and `~/.config/hypr/bin/{location.sh,weather.sh,playerctlock.sh,infonlock.sh}`; verify whether support files are tracked before editing related behavior.
- Waybar `config.jsonc` includes tracked module files under `dot_config/waybar/modules/`; keep module, script, style, and asset changes consistent.
- `dot_config/hypr/scripts/executable_screenshot_llm` renders to `~/.config/hypr/scripts/screenshot_llm`; executable source files should keep executable mode when practical.
- Linux desktop configs are ignored on macOS via `.chezmoiignore.tmpl`; avoid macOS-specific changes in Linux-only directories unless guarded.

## Shell Configuration
- `dot_zshrc` bootstraps zinit and sources mise, oh-my-posh, and zoxide.
- Do not add `command -v` guards around these shell integrations; they are expected dependencies.
- Avoid launching an interactive shell just to validate syntax unless dependencies are expected to exist. Use `zsh -n dot_zshrc` for syntax checks.

## pi Configuration
- Global pi config is tracked under `dot_pi/settings.json` and `dot_pi/agent/`.
- Do not track or print runtime/sensitive pi files such as `auth.json`, `run-history.jsonl`, `sessions/`, or `node_modules/`.
- Pi extensions live in `dot_pi/agent/extensions/`; themes live in `dot_pi/agent/themes/`.
- If changing pi extension dependencies, update both `dot_pi/agent/npm/package.json` and `dot_pi/agent/npm/package-lock.json` deliberately.
- After changing `AGENTS.md` or pi config files, remind the user to run `/reload` in pi.

## Safety and Secrets
- Do not reveal, decrypt, print, or modify secrets.
- Treat `*.sops.yaml`, `age.key`, kubeconfigs, Talos secrets, cluster credentials, API keys, tokens, and auth/session files as sensitive.
- Prefer local validation before any command that touches a cluster, live infrastructure, package manager, or external service.
- Avoid destructive commands and broad deletes unless explicitly requested and scoped.
- If a command may contact Kubernetes/Talos/cloud services or mutate external state, explain the risk and ask first.

## GitOps / Infrastructure Workflow
- This repo is not itself an infrastructure GitOps repo, but some dotfiles may contain tooling for infrastructure access.
- For any infrastructure-related config change, validate locally first and do not apply cluster/cloud changes from this repo unless explicitly authorized.
- Never commit generated secrets, decrypted files, kubeconfigs, Talos secrets, or local auth/session state.

## Editing Conventions
- Use exact, minimal edits. Keep existing style and formatting.
- Prefer editing source files (`dot_*`, `dot_config/*`, `dot_pi/*`, templates, and run scripts) and then applying with chezmoi when approved.
- When removing a chezmoi-managed source file, remember `chezmoi apply` may not delete an already-rendered live file automatically; verify and remove stale live files only when the user asks to apply removals.
- Show changed paths and validation commands in the final response.
- Remind the user to run `/reload` after changing `AGENTS.md` so pi reloads repository context.
