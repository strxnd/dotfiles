if status is-interactive
  # Run if shell is interactive 
  neofetch
end

# Aliases
alias c="clear"
alias ls="exa --icons --group-directories-first"
alias cat="bat --style=numbers"
alias cd="z"

# Remove welcome message
set fish_greeting

zoxide init fish | source
