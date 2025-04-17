-- This file needs to have same structure as nvconfig.lua
-- https://github.com/NvChad/ui/blob/v3.0/lua/nvconfig.lua
-- Please read that file to know all available options :(

---@type ChadrcConfig
local M = {}

M.base46 = {
  theme = "catppuccin",

  hl_override = {
    Comment = { italic = true },
    ["@comment"] = { italic = true },
  },
}

M.nvdash = { load_on_startup = true }
M.ui = {
  tabufline = {
    enabled = false,
  },
  cmp = {
    style = "atom_colored",
  },
  statusline = {
    theme = "vscode_colored",
  },
}

M.mason = {
  pkgs = {
    "clangd",
    "codelldb",
    "clang-format",
    "typescript-language-server",
    "js-debug-adapter",
    "prettier",
    "lua-language-server",
    "stylua",
  },
}

return M
