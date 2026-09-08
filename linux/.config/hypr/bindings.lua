-- Keep only your personal keybinding overrides here. Add new bindings or
-- unbind defaults before replacing them.

-- See current bindings and descriptions:
--   omarchy menu keybindings --print

-- To disable every Omarchy default binding, set this in
-- ~/.config/hypr/hyprland.lua before require("default.hypr.omarchy"), then add
-- only the bindings you want below:
--   omarchy_default_bindings = false

-- To disable all preinstalled app/webapp bindings, set:
--   omarchy_preinstalled_bindings = false

-- Add a new binding.
-- o.bind("SUPER + SHIFT + R", "SSH", "alacritty -e ssh your-server")

-- Change an existing binding by unbinding it first, then binding the key again.
-- This example changes SUPER+SPACE from the launcher to the Omarchy root menu.
-- hl.unbind("SUPER + SPACE")
-- o.bind("SUPER + SPACE", "Omarchy menu", "omarchy-menu toggle root")

-- Disable a default binding without replacing it.
-- hl.unbind("SUPER + SHIFT + B")

-- Logitech MX Keys examples:
-- o.bind("SUPER + SHIFT + S", nil, "omarchy-capture-screenshot")
-- o.bind("SUPER + H", nil, "voxtype record toggle")
-- o.bind("SUPER + PERIOD", nil, "omarchy-shell shell toggle omarchy.emojis")

-- ============================================================
-- Directional focus: SUPER + H/J/K/L (vim-style), replacing the
-- default arrow-key focus binds as the primary way to move focus.
-- The original SUPER+LEFT/RIGHT/UP/DOWN focus binds are kept as
-- secondary aliases.
-- ============================================================

-- SUPER + H was unused by Omarchy, so it needs no unbind.
o.bind("SUPER + H", "Focus on left window", hl.dsp.focus({ direction = "l" }))

-- SUPER + J was: Toggle window split (relocated below).
hl.unbind("SUPER + J")
o.bind("SUPER + J", "Focus on below window", hl.dsp.focus({ direction = "d" }))

-- SUPER + K was: Keybindings menu (relocated below).
hl.unbind("SUPER + K")
o.bind("SUPER + K", "Focus on above window", hl.dsp.focus({ direction = "u" }))

-- SUPER + L was: Toggle workspace layout (relocated below).
hl.unbind("SUPER + L")
o.bind("SUPER + L", "Focus on right window", hl.dsp.focus({ direction = "r" }))

-- ============================================================
-- Omarchy defaults preserved on SUPER + SHIFT + H/J/K/L
-- (these keys were free, so nothing else is affected).
-- ============================================================
o.bind("SUPER + SHIFT + J", "Toggle window split", hl.dsp.layout("togglesplit"))
o.bind("SUPER + SHIFT + K", "Keybindings", "omarchy-menu-keybindings")
o.bind("SUPER + SHIFT + L", "Toggle workspace layout", "omarchy-hyprland-workspace-layout-toggle")
