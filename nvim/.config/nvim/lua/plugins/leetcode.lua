return {
  "kawre/leetcode.nvim",
  build = ":TSUpdate html",
  cmd = "Leet",
  keys = {
    { "<leader>lc", "<cmd>Leet<CR>", desc = "Open LeetCode" },
  },
  dependencies = {
    "nvim-lua/plenary.nvim",
    "MunifTanjim/nui.nvim",
    "nvim-telescope/telescope.nvim",
    "nvim-tree/nvim-web-devicons",
  },
  opts = {
    lang = "c",
    picker = {
      provider = "telescope",
    },
    plugins = {
      non_standalone = true,
    },
  },
}
