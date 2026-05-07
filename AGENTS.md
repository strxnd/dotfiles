# Agent Notes

## Repository Shape
- This is a chezmoi source repo; edit `dot_config/...` and `dot_zshrc`, not the live files under `~/.config` or `~/.zshrc`.
- Use `chezmoi diff` to preview rendered live changes and `chezmoi apply` to update the real home-directory files.
- There is no CI, package manifest, or repo-wide test runner; verify the specific dotfile/tool you changed.

## Neovim / NvChad
- Neovim is an NvChad starter-style config: `NvChad/NvChad` is loaded as a lazy.nvim plugin from `dot_config/nvim/init.lua`, and local plugin specs live in `dot_config/nvim/lua/plugins/`.
- Test the chezmoi source Neovim config with `XDG_CONFIG_HOME="/home/kumaraarav/.local/share/chezmoi/dot_config" nvim --headless +qa`; plain `nvim` loads the applied `~/.config/nvim` instead.
- For LSP changes, also run `XDG_CONFIG_HOME="/home/kumaraarav/.local/share/chezmoi/dot_config" nvim --headless "+checkhealth vim.lsp" +qa`.
- Follow current NvChad LSP style: plugin spec for `neovim/nvim-lspconfig` calls `require "configs.lspconfig"`; `configs/lspconfig.lua` calls `require("nvchad.configs.lspconfig").defaults()` and enables extra servers with `vim.lsp.enable(...)`.
- Do not use deprecated `require("lspconfig").SERVER.setup(...)` for new LSP config.
- Current intended language tooling is Lua/NvChad defaults plus C: Mason packages in `lua/chadrc.lua` are `clangd`, `clang-format`, `codelldb`, `lua-language-server`, and `stylua`.
- Format Lua with the repo config: `"/home/kumaraarav/.local/share/nvim/mason/bin/stylua" --config-path "dot_config/nvim/dot_stylua.toml" "dot_config/nvim/lua"`.
- `lazy-lock.json` is tracked; update it deliberately when adding/removing Neovim plugins.

## Desktop Dotfiles
- Hyprland uses an end-4-style split config: `dot_config/hypr/hyprland.conf` sources category files under `dot_config/hypr/hyprland/`, empty override files under `dot_config/hypr/custom/`, plus `monitors.conf` and `workspaces.conf`.
- Hyprland is hard-coded in `dot_config/hypr/monitors.conf` for monitor `DP-1` at `3480x2160@240` with scale `1.5`; check before changing display assumptions.
- `hyprlock.conf` references `~/.config/hypr/colors.conf` and `~/.config/hypr/bin/{location.sh,weather.sh,playerctlock.sh,infonlock.sh}`, but those files are not tracked here.
- Waybar `config.jsonc` includes tracked module files under `dot_config/waybar/modules/`; keep those support files with the top-level config and style.
- `dot_zshrc` bootstraps zinit and sources mise, oh-my-posh, and zoxide; avoid running an interactive shell just to validate syntax unless those dependencies are expected to exist.
