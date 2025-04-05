if status is-interactive
  # Run if shell is interactive 
  fastfetch
end

# Aliases
alias c="clear"
alias ls="lsd"
alias cd="z"

# Remove welcome message
set fish_greeting

zoxide init fish | source
