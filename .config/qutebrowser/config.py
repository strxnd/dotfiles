import catppuccin

# load your autoconfig, use this, if the rest of your config is empty!
config.load_autoconfig()

# set the flavor you'd like to use
# valid options are 'mocha', 'macchiato', 'frappe', and 'latte'
# last argument (optional, default is False): enable the plain look for the menu rows
catppuccin.setup(c, 'mocha', True)

# Font configuration
c.fonts.default_family = 'JetBrains Mono Nerd Font'
c.fonts.default_size = '14pt'

# Dark mode for web content
c.colors.webpage.darkmode.enabled = True
c.colors.webpage.darkmode.policy.page = 'smart'
c.colors.webpage.darkmode.policy.images = 'smart'
