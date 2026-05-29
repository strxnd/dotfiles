return {
  "epwalsh/obsidian.nvim",
  version = "*",
  ft = "markdown",
  dependencies = {
    "nvim-lua/plenary.nvim",
    "nvim-telescope/telescope.nvim",
    "hrsh7th/nvim-cmp",
  },
  init = function()
    vim.api.nvim_create_autocmd("FileType", {
      pattern = "markdown",
      callback = function()
        vim.opt_local.conceallevel = 2
      end,
    })
  end,
  keys = {
    { "<leader>on", "<cmd>ObsidianNew<CR>", desc = "obsidian new note" },
    { "<leader>oq", "<cmd>ObsidianQuickSwitch<CR>", desc = "obsidian quick switch" },
    { "<leader>os", "<cmd>ObsidianSearch<CR>", desc = "obsidian search" },
    { "<leader>ob", "<cmd>ObsidianBacklinks<CR>", desc = "obsidian backlinks" },
    { "<leader>ol", "<cmd>ObsidianLinks<CR>", desc = "obsidian links" },
    { "<leader>ot", "<cmd>ObsidianTemplate<CR>", desc = "obsidian template" },
    { "<leader>oo", "<cmd>ObsidianOpen<CR>", desc = "obsidian open app" },
    { "<leader>op", "<cmd>ObsidianPasteImg<CR>", desc = "obsidian paste image" },
    { "<leader>or", "<cmd>ObsidianRename<CR>", desc = "obsidian rename note" },
  },
  opts = {
    workspaces = {
      {
        name = "second-brain",
        path = "~/dev/second-brain",
      },
    },

    notes_subdir = "3. Resources",
    new_notes_location = "current_dir",

    completion = {
      nvim_cmp = true,
      min_chars = 2,
    },

    picker = {
      name = "telescope.nvim",
    },

    templates = {
      folder = "Templates",
      date_format = "%Y-%m-%d",
      time_format = "%H:%M",
    },

    note_id_func = function(title)
      return title
    end,

    note_frontmatter_func = function(note)
      return {
        title = note.title,
        type = "resource",
        tags = { "resource" },
        created = os.date "%Y-%m-%d",
      }
    end,
  },
}
