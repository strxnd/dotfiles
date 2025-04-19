local options = {
  formatters_by_ft = {
    lua = { "stylua" },
    typescript = { "biome" },
    javascript = { "biome" },
    c = { "clang-format" },
    rust = { "rustfmt" },
  },

  format_on_save = {
    -- These options will be passed to conform.format()
    timeout_ms = 500,
    lsp_fallback = true,
  },
}

return options
