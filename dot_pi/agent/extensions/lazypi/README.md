# lazypi

`lazypi` is a bundled Pi extension harness. It loads one Pi extension entrypoint
and then registers the local workflow extensions plus vendored upstream Pi
packages in a deterministic order.

## Layout

- `index.ts` is the only Pi extension entrypoint.
- `local/` contains personal extensions owned by this dotfiles repo.
- `local/subagents/` contains the native local subagent tools, `/agents`
  command, and status panel.
- `vendor/` contains copied upstream Pi packages used by the harness.
- `vendor-manifest.json` records the bundled upstream package versions and local
  patch notes.
- `package.json` is the runtime dependency manifest for this package.
- `node_modules/` is generated runtime state and should not be tracked.

## Local Development

For the chezmoi-managed local install, this directory renders to:

```text
~/.pi/agent/extensions/lazypi
```

Install runtime dependencies in the rendered package root when testing local
changes:

```sh
npm --prefix ~/.pi/agent/extensions/lazypi install --omit=dev
```

Until `lazypi` is published, `~/.pi/agent/settings.json` should keep
`packages: []` and Pi should load this local extension directory directly.
After publishing, switch settings to a single package entry:

```json
"packages": [
  "npm:lazypi@0.1.0"
]
```

## Publishing Notes

Before publishing, run:

```sh
npm --prefix dot_pi/agent/extensions/lazypi install --package-lock-only
npm --prefix dot_pi/agent/extensions/lazypi pack --dry-run
```

Review the pack output carefully. The package should include the harness source,
local modules, vendored source, README, and vendor manifest, but not generated
`node_modules/` state.
