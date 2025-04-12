-- Basic settings
vim.opt.number = true
vim.opt.relativenumber = true
vim.opt.expandtab = true
vim.opt.tabstop = 2
vim.opt.shiftwidth = 2
vim.opt.smartindent = true
vim.opt.laststatus = 3 -- views can only be fully collapsed with the global statusline
vim.opt.cursorline = true
vim.opt.scrolloff = 4
vim.diagnostic.config({
	virtual_text = true,
	update_in_insert = true,
}) -- make errors and warnings always visible in buffers
vim.lsp.inlay_hint.enable() -- enable inlay hints by default
