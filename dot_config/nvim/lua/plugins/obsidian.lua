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
    { "<leader>oT", "<cmd>ObsidianNewFromTemplate<CR>", desc = "obsidian new from template" },
    { "<leader>od", "<cmd>ObsidianToday<CR>", desc = "obsidian today" },
    { "<leader>oD", "<cmd>ObsidianDailies<CR>", desc = "obsidian daily notes" },
    { "<leader>ow", "<cmd>ObsidianWorkspace<CR>", desc = "obsidian workspace" },
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
        name = "personal-os",
        path = "~/personal-os",
      },
    },

    notes_subdir = "0. Inbox",
    new_notes_location = "notes_subdir",

    daily_notes = {
      folder = "0. Inbox/Daily Notes",
      date_format = "%Y-%m-%d",
      default_tags = { "daily" },
      template = "Daily Note",
    },

    completion = {
      nvim_cmp = true,
      min_chars = 2,
    },

    picker = {
      name = "telescope.nvim",
    },

    templates = {
      folder = "9. System/Templates",
      date_format = "%Y-%m-%d",
      time_format = "%H:%M",
    },

    note_id_func = function(title)
      return title
    end,

    note_frontmatter_func = function(note)
      return {
        title = note.title,
        type = "inbox",
        status = "active",
        created = os.date "%Y-%m-%d",
        updated = os.date "%Y-%m-%d",
        tags = {},
        area = "",
        project = "",
      }
    end,
  },
}
