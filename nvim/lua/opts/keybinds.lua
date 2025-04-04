vim.keymap.set("n", "<leader>ca", vim.lsp.buf.code_action, { desc = "View code actions" })
vim.keymap.set("n", "<leader>cf", vim.lsp.buf.format, { desc = "Format current buffer" })
vim.keymap.set("n", "<Esc>", ":noh<CR>", { desc = "Remove search highlight" })
vim.keymap.set("n", "<leader>du", require("dapui").toggle, { desc = "Toggle DAP UI" })
