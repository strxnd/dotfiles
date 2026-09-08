local options = {
  formatters_by_ft = {
    lua = { "stylua" },
    c = { "clang-format" },
    css = { "biome" },
    javascript = { "biome" },
    javascriptreact = { "biome" },
    json = { "biome" },
    jsonc = { "biome" },
    typescript = { "biome" },
    typescriptreact = { "biome" },
  },

  format_on_save = {
    -- These options will be passed to conform.format()
    timeout_ms = 1000,
    lsp_format = "fallback",
  },
}

return options
