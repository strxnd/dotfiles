local wk = require "which-key"

wk.add {
  { "<leader>c", group = "code" },
  { "<leader>d", group = "debug" },
  { "<leader>a", group = "ai" },
  { "<leader>f", group = "find" },
  { "<leader>w", group = "whichkey", icon = "󰌌" },
}

local map = vim.keymap.set

-- navigation

map("i", "<C-b>", "<ESC>^i", { desc = "move beginning of line" })
map("i", "<C-e>", "<End>", { desc = "move end of line" })
map("i", "<C-h>", "<Left>", { desc = "move left" })
map("i", "<C-l>", "<Right>", { desc = "move right" })
map("i", "<C-j>", "<Down>", { desc = "move down" })
map("i", "<C-k>", "<Up>", { desc = "move up" })

-- window management

map("n", "<C-h>", "<C-w>h", { desc = "switch window left" })
map("n", "<C-l>", "<C-w>l", { desc = "switch window right" })
map("n", "<C-j>", "<C-w>j", { desc = "switch window down" })
map("n", "<C-k>", "<C-w>k", { desc = "switch window up" })

-- misc

map("n", "<Esc>", "<cmd>noh<CR>", { desc = "general clear highlights" })

map({ "n", "v", "i" }, "<C-s>", "<cmd>w<CR>", { desc = "general save file" })
map("n", "<C-c>", "<cmd>%y+<CR>", { desc = "general copy whole file" })

map("n", "<leader>n", "<cmd>set nu!<CR>", { desc = "toggle line number" })
map("n", "<leader>s", "<cmd>NvCheatsheet<CR>", { desc = "toggle nvcheatsheet" })

-- code

map("n", "<leader>ca", vim.lsp.buf.code_action, { desc = "view code actions under cursor" })
map("n", "<leader>cf", function()
  require("conform").format { lsp_fallback = true }
end, { desc = "general format file" })
map("n", "<leader>cr", function()
  require "nvchad.lsp.renamer"()
end, { desc = "LSP NvRenamer" })

-- debug

map("n", "<leader>dB", function()
  require("dap").set_breakpoint(vim.fn.input "Breakpoint condition: ")
end, { desc = "Breakpoint Condition" })
map("n", "<leader>db", function()
  require("dap").toggle_breakpoint()
end, { desc = "Toggle Breakpoint" })
map("n", "<leader>dc", function()
  require("dap").continue()
end, { desc = "Run/Continue" })
map("n", "<leader>da", function()
  require("dap").continue { before = get_args }
end, { desc = "Run with Args" })
map("n", "<leader>dC", function()
  require("dap").run_to_cursor()
end, { desc = "Run to Cursor" })
map("n", "<leader>dg", function()
  require("dap").goto_()
end, { desc = "Go to Line (No Execute)" })
map("n", "<leader>di", function()
  require("dap").step_into()
end, { desc = "Step Into" })
map("n", "<leader>dj", function()
  require("dap").down()
end, { desc = "Down" })
map("n", "<leader>dk", function()
  require("dap").up()
end, { desc = "Up" })
map("n", "<leader>dl", function()
  require("dap").run_last()
end, { desc = "Run Last" })
map("n", "<leader>do", function()
  require("dap").step_out()
end, { desc = "Step Out" })
map("n", "<leader>dO", function()
  require("dap").step_over()
end, { desc = "Step Over" })
map("n", "<leader>dP", function()
  require("dap").pause()
end, { desc = "Pause" })
map("n", "<leader>dr", function()
  require("dap").repl.toggle()
end, { desc = "Toggle REPL" })
map("n", "<leader>ds", function()
  require("dap").session()
end, { desc = "Session" })
map("n", "<leader>dt", function()
  require("dap").terminate()
end, { desc = "Terminate" })
map("n", "<leader>dw", function()
  require("dap.ui.widgets").hover()
end, { desc = "Widgets" })

-- Comment
map("n", "<leader>/", "gcc", { desc = "toggle comment", remap = true })
map("v", "<leader>/", "gc", { desc = "toggle comment", remap = true })

-- nvimtree
map("n", "<C-n>", "<cmd>NvimTreeToggle<CR>", { desc = "nvimtree toggle window" })
map("n", "<leader>e", "<cmd>NvimTreeFocus<CR>", { desc = "nvimtree focus window" })

-- find
map("n", "<leader>fw", "<cmd>Telescope live_grep<CR>", { desc = "telescope live grep" })
map("n", "<leader>fb", "<cmd>Telescope buffers<CR>", { desc = "telescope find buffers" })
map("n", "<leader>fh", "<cmd>Telescope help_tags<CR>", { desc = "telescope help page" })
map("n", "<leader>fm", "<cmd>Telescope marks<CR>", { desc = "telescope find marks" })
map("n", "<leader>fo", "<cmd>Telescope oldfiles<CR>", { desc = "telescope find oldfiles" })
map("n", "<leader>fz", "<cmd>Telescope current_buffer_fuzzy_find<CR>", { desc = "telescope find in current buffer" })
map("n", "<leader>fc", "<cmd>Telescope git_commits<CR>", { desc = "telescope git commits" })
map("n", "<leader>fs", "<cmd>Telescope git_status<CR>", { desc = "telescope git status" })

map("n", "<leader>ft", function()
  require("nvchad.themes").open()
end, { desc = "telescope nvchad themes" })

map("n", "<leader>ff", "<cmd>Telescope find_files<cr>", { desc = "telescope find files" })
map(
  "n",
  "<leader>fa",
  "<cmd>Telescope find_files follow=true no_ignore=true hidden=true<CR>",
  { desc = "telescope find all files" }
)

-- terminal
map("t", "<C-x>", "<C-\\><C-N>", { desc = "terminal escape terminal mode" })

-- new terminals
map("n", "<leader>h", function()
  require("nvchad.term").new { pos = "sp" }
end, { desc = "terminal new horizontal term" })

map("n", "<leader>v", function()
  require("nvchad.term").new { pos = "vsp" }
end, { desc = "terminal new vertical term" })

-- toggleable
map({ "n", "t" }, "<A-v>", function()
  require("nvchad.term").toggle { pos = "vsp", id = "vtoggleTerm" }
end, { desc = "terminal toggleable vertical term" })

map({ "n", "t" }, "<A-h>", function()
  require("nvchad.term").toggle { pos = "sp", id = "htoggleTerm" }
end, { desc = "terminal toggleable horizontal term" })

map({ "n", "t" }, "<A-i>", function()
  require("nvchad.term").toggle { pos = "float", id = "floatTerm" }
end, { desc = "terminal toggle floating term" })

-- whichkey
map("n", "<leader>wK", "<cmd>WhichKey <CR>", { desc = "whichkey all keymaps" })

map("n", "<leader>wk", function()
  vim.cmd("WhichKey " .. vim.fn.input "WhichKey: ")
end, { desc = "whichkey query lookup" })
