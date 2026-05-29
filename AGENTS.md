# Agent Notes

## Repository Purpose and Shape
- This is a personal dotfiles repository managed by chezmoi.
- Edit chezmoi source files in this repo, not the rendered live files under `~`.
  - `dot_config/...` renders to `~/.config/...`
  - `dot_zshrc` renders to `~/.zshrc`
  - `dot_pi/...` renders to `~/.pi/...`
- `AGENTS.md` and `install.sh` are ignored by chezmoi via `.chezmoiignore`; they are repo/operator files, not files to apply to `$HOME`.
- There is no CI, package manifest, or repo-wide test runner. Validate the specific tool/config you changed.

## Important Directories
- `dot_config/nvim/`: NvChad-based Neovim config using lazy.nvim.
- `dot_config/hypr/`: Hyprland, hyprlock, hyprpaper, monitor, workspace, and override configs.
- `dot_config/waybar/`: Waybar config, modules, scripts, styles, themes, and assets.
- `dot_config/wezterm/`: WezTerm config.
- `dot_config/oh-my-posh/`: prompt theme/config.
- `dot_pi/agent/`: pi global agent settings, custom agents, prompt templates, theme, and extension package lock.
- `dot_themes/`: desktop theme assets.
- `dot_zshrc`: zsh setup, aliases, expected shell integrations, and startup commands.

## Common Workflow
- Check current work before editing: `git status --short`.
- Preview rendered changes: `chezmoi diff`.
- Apply changes to the live home directory: `chezmoi apply` or targeted paths such as `chezmoi apply ~/.config/nvim`.
- Use `chezmoi apply --force <target>` only when intentionally overwriting a live file that chezmoi reports as locally changed.
- After applying, verify the changed tool directly; do not assume a successful apply means the application config is valid.
- Preserve unrelated user changes shown by `git status` and avoid broad formatting outside touched files.

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
- Current intended language tooling is Lua/NvChad defaults plus C. Mason packages in `lua/chadrc.lua` currently include `clangd`, `clang-format`, `codelldb`, `lua-language-server`, and `stylua`.
- Format Lua with:
  ```sh
  "/home/kumaraarav/.local/share/nvim/mason/bin/stylua" --config-path "dot_config/nvim/dot_stylua.toml" "dot_config/nvim/lua"
  ```
- `lazy-lock.json` is tracked; update it deliberately when adding/removing Neovim plugins. Avoid accidental broad plugin upgrades from `Lazy sync` unless requested.

## Desktop Dotfiles
- Hyprland uses an end-4-style split config: `dot_config/hypr/hyprland.conf` sources category files under `dot_config/hypr/hyprland/`, empty override files under `dot_config/hypr/custom/`, plus `monitors.conf` and `workspaces.conf`.
- Hyprland monitor assumptions are hard-coded in `dot_config/hypr/monitors.conf` for monitor `DP-1` at `3840x2160@240` with scale `1.5`; check before changing display assumptions.
- `hyprlock.conf` references `~/.config/hypr/colors.conf` and `~/.config/hypr/bin/{location.sh,weather.sh,playerctlock.sh,infonlock.sh}`; verify whether referenced support files are tracked before editing related behavior.
- Waybar `config.jsonc` includes tracked module files under `dot_config/waybar/modules/`; keep module, script, style, and asset changes consistent.
- `dot_zshrc` bootstraps zinit and sources mise, oh-my-posh, and zoxide. Do not add `command -v` guards around these shell integrations; they are expected dependencies. Avoid launching an interactive shell just to validate syntax unless dependencies are expected to exist.

## pi Configuration
- Global pi config is tracked under `dot_pi/agent/`.
- Do not track or print runtime/sensitive pi files such as `auth.json`, `run-history.jsonl`, `sessions/`, or `node_modules/`.
- Custom agents live in `dot_pi/agent/agents/`; prompt templates live in `dot_pi/agent/prompts/`; themes live in `dot_pi/agent/themes/`.
- If changing pi extension dependencies, update both `dot_pi/agent/npm/package.json` and `dot_pi/agent/npm/package-lock.json` deliberately.

## Safety and Secrets
- Do not reveal, decrypt, print, or modify secrets.
- Treat `*.sops.yaml`, `age.key`, kubeconfigs, Talos secrets, cluster credentials, API keys, tokens, and auth/session files as sensitive.
- Prefer local validation before any command that touches a cluster, live infrastructure, or external service.
- Avoid destructive commands and broad deletes unless explicitly requested and scoped.
- If a command may contact Kubernetes/Talos/cloud services or mutate external state, explain the risk and ask first.

## GitOps / Infrastructure Workflow
- This repo is not itself an infrastructure GitOps repo, but some dotfiles may contain tooling for infrastructure access.
- For any infrastructure-related config change, validate locally first and do not apply cluster/cloud changes from this repo unless explicitly authorized.
- Never commit generated secrets, decrypted files, kubeconfigs, Talos secrets, or local auth/session state.

## Editing Conventions
- Use exact, minimal edits. Keep existing style and formatting.
- Prefer editing source files (`dot_*`, `dot_config/*`, `dot_pi/*`) and then applying with chezmoi.
- When removing a chezmoi-managed source file, remember `chezmoi apply` may not delete an already-rendered live file automatically; verify and remove stale live files when the user asks to apply removals.
- Show changed paths and validation commands in the final response.
- Remind the user to run `/reload` after changing this `AGENTS.md` so pi reloads repository context.
