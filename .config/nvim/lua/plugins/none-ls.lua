return {
	{
		"jay-babu/mason-null-ls.nvim",
		opts = {
			ensure_installed = { "clang-format", "stylua", "prettier", "eslint" },
		},
	},
	{
		"nvimtools/none-ls.nvim",
		config = function()
			local null_ls = require("null-ls")

			local augroup = vim.api.nvim_create_augroup("LspFormatting", {})

			null_ls.setup({
				sources = {
					null_ls.builtins.formatting.clang_format,
					null_ls.builtins.formatting.stylua,
					null_ls.builtins.formatting.prettier,
					require("none-ls.diagnostics.eslint"),
				},
				on_attach = function(client, bufnr)
					if client.supports_method("textDocument/formatting") then
						vim.api.nvim_clear_autocmds({ group = augroup, buffer = bufnr })
						vim.api.nvim_create_autocmd("BufWritePre", {
							group = augroup,
							buffer = bufnr,
							callback = function()
								-- on 0.8, you should use vim.lsp.buf.format({ bufnr = bufnr }) instead
								-- on later neovim version, you should use vim.lsp.buf.format({ async = false }) instead
								vim.lsp.buf.format({ async = false })
							end,
						})
					end
				end,
			})
		end,
		dependencies = { "nvim-lua/plenary.nvim", "nvimtools/none-ls-extras.nvim" },
	},
}
