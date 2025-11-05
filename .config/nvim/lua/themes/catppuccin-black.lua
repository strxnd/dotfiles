local M = {}

M.base_30 = {
  white = "#cdd6f4",
  darker_black = "#000000",
  black = "#000000", --  nvim bg
  black2 = "#000000",
  one_bg = "#313244", -- real bg of onedark
  one_bg2 = "#45475a",
  one_bg3 = "#585b70",
  grey = "#6c7086",
  grey_fg = "#7f849c",
  grey_fg2 = "#9399b2",
  light_grey = "#a6adc8",
  red = "#f38ba8",
  baby_pink = "#eba0ac",
  pink = "#f5c2e7",
  line = "#313244", -- for lines like vertsplit
  green = "#a6e3a1",
  vibrant_green = "#94e2d5",
  nord_blue = "#74c7ec",
  blue = "#89b4fa",
  yellow = "#f9e2af",
  sun = "#fab387",
  purple = "#cba6f7",
  dark_purple = "#b4befe",
  teal = "#89dceb",
  orange = "#fab387",
  cyan = "#89dceb",
  statusline_bg = "#181825",
  lightbg = "#313244",
  pmenu_bg = "#a6e3a1",
  folder_bg = "#89b4fa",
  lavender = "#b4befe",
}

M.base_16 = {
  base00 = "#000000",
  base01 = "#181825",
  base02 = "#313244",
  base03 = "#45475a",
  base04 = "#585b70",
  base05 = "#bfc6d4",
  base06 = "#ccd3e1",
  base07 = "#cdd6f4",
  base08 = "#f38ba8",
  base09 = "#fab387",
  base0A = "#f9e2af",
  base0B = "#a6e3a1",
  base0C = "#89dceb",
  base0D = "#89b4fa",
  base0E = "#cba6f7",
  base0F = "#f5e0dc",
}

M.polish_hl = {
  treesitter = {
    ["@variable"] = { fg = M.base_30.lavender },
    ["@property"] = { fg = M.base_30.teal },
    ["@variable.builtin"] = { fg = M.base_30.red },
  },
}

M.type = "dark"

M = require("base46").override_theme(M, "catppuccin")

return M
