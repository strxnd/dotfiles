local wezterm = require("wezterm")
return {
	adjust_window_size_when_changing_font_size = false,
	enable_kitty_graphics = true,
	color_scheme = "Catppuccin Mocha",
	colors = {
		background = "black",
	},
	enable_tab_bar = false,
	font_size = 16.0,
	font = wezterm.font("JetBrains Mono Nerd Font"),

	-- Cursor settings
	default_cursor_style = "BlinkingBlock",
	cursor_blink_rate = 800,
	cursor_blink_ease_in = "Linear",
	cursor_blink_ease_out = "Linear",

	window_background_opacity = 1.0,
	mouse_bindings = {
		-- Ctrl-click will open the link under the mouse cursor
		{
			event = { Up = { streak = 1, button = "Left" } },
			mods = "CTRL",
			action = wezterm.action.OpenLinkAtMouseCursor,
		},
	},
	keys = {
		{ key = "Enter", mods = "SHIFT", action = wezterm.action({ SendString = "\x1b\r" }) },
	},
}
