---
description: Create or refresh this repo's AGENTS.md for pi
argument-hint: "[focus area or goal]"
---
Create or update a project `AGENTS.md` context file for pi in the repository root.

Focus/goal: $ARGUMENTS

Pi uses `AGENTS.md` as a context file. It loads matching `AGENTS.md` files at startup from parent directories and the current directory. This repo-level file should teach future pi sessions how to work safely and effectively in this repository.

Do the following:

1. Inspect the project safely:
   - Check `git status --short`
   - Read the root `README.md` if present
   - Read obvious task/config files such as `Taskfile.yaml`, `Makefile`, `package.json`, `.mise.toml`, `.github/`, and repo-specific docs
   - Identify the main directories and their purpose
   - If `AGENTS.md` already exists, read it and preserve useful existing guidance

2. Create or update root `AGENTS.md` with concise project instructions, including:
   - Repository purpose and architecture
   - Important directories
   - Common commands and validation workflow
   - GitOps / infrastructure change workflow
   - Safety rules for secrets, SOPS, age keys, kubeconfigs, Talos secrets, and cluster access
   - Editing conventions for this repo
   - Any focus-specific guidance from `$ARGUMENTS`

3. Safety requirements:
   - Do not reveal, decrypt, print, or modify secrets
   - Treat `*.sops.yaml`, `age.key`, `kubeconfig`, Talos secrets, and cluster credentials as sensitive
   - Prefer local validation before any command that touches a cluster or external service
   - Keep `AGENTS.md` helpful but not overly long

4. After writing `AGENTS.md`:
   - Show the path created/updated
   - Summarize the main sections
   - Remind me to run `/reload` so pi loads the new context file
