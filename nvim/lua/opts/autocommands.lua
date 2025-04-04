-- format on save
vim.api.nvim_create_autocmd("BufWritePre", {
	callback = function(args)
		vim.lsp.buf.format({ async = false, bufnr = args.buf })
	end,
})
