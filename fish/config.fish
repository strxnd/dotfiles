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

function starship_transient_prompt_func
  starship module character
end
starship init fish | source
enable_transience
