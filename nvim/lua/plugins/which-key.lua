return {
	"folke/which-key.nvim",
	event = "VeryLazy",
	opts = {
		-- your configuration comes here
		-- or leave it empty to use the default settings
		-- refer to the configuration section below
	},
	keys = {
		{
			"<leader>?",
			function()
				require("which-key").show({ global = false })
			end,
			desc = "Buffer Local Keymaps (which-key)",
		},
	},
	config = function()
		local wk = require("which-key")
		wk.add({
			{ "<leader>a", group = "AI" },
			{ "<leader>b", group = "Buffers" },
			{ "<leader>c", group = "Code" },
			{ "<leader>f", group = "Files" },
			{ "<leader>g", group = "Git" },
			{ "<leader>u", group = "UI" },
			{ "<leader>s", group = "Search" },
			{ "<leader>d", group = "Debug" },
		})
	end,
}
