return {
  "nvimtools/none-ls.nvim",
  config = function()
    local null_ls = require("null-ls")

    null_ls.setup({
      sources = {
        null_ls.builtins.formatting.stylua,
        null_ls.builtins.formatting.prettier,
        -- require("none-ls.diagnostics.eslint"),
      },
    })
  end,
  dependencies = { "nvim-lua/plenary.nvim", "nvimtools/none-ls-extras.nvim" }
}
