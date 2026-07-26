return {
  "hrsh7th/nvim-cmp",
  opts = function(_, opts)
    opts.experimental = opts.experimental or {}
    opts.experimental.ghost_text = true
  end,
}
