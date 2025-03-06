vim.keymap.set({ "n", "i" }, "<C-s>", function()
  vim.cmd("w")         -- Save file
  vim.lsp.buf.format() -- Format file
end, { noremap = true, silent = true })
vim.keymap.set("n", "<leader>ca", vim.lsp.buf.code_action, { desc = "View code actions" })
vim.keymap.set("n", "<leader>cf", vim.lsp.buf.format, { desc = "Format current buffer" })
vim.keymap.set("n", "<leader>ac", ":CopilotChatToggle<CR>", { desc = "Toggle copilot chat" })
