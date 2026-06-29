import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import claudeStyleTools from "./vendor/pi-claude-style-tools/extensions/index.ts";
import claudeStyleSpinner from "./vendor/pi-claude-style-tools/extensions/spinner.ts";

import piDashboard from "./local/pi-dashboard.ts";
import piTui from "./local/pi-tui.ts";
import piBar from "./local/pi-bar/index.ts";

import permissions from "./local/pi-permissions.ts";
import effort from "./local/pi-effort.ts";
import paster from "./vendor/pi-paster/src/index.ts";
import escapeRestorePrompt from "./local/escape-restore-prompt.ts";
import piUserMessage from "./local/pi-user-message.ts";

import args from "./vendor/juicesharp/rpiv-args/index.ts";
import askUserQuestion from "./vendor/juicesharp/rpiv-ask-user-question/index.ts";
import webTools from "./vendor/juicesharp/rpiv-web-tools/index.ts";
import btw from "./vendor/juicesharp/rpiv-btw/index.ts";
import mcpAdapter from "./vendor/pi-mcp-adapter/index.ts";

import codexFastMode from "./local/codex-fast-mode.ts";
import subagents from "./local/subagents/index.ts";

type HarnessModule = (pi: ExtensionAPI) => void | Promise<void>;

const modules: Array<[name: string, register: HarnessModule]> = [
	["claude-style-tools", claudeStyleTools],
	["claude-style-spinner", claudeStyleSpinner],
	["pi-dashboard", piDashboard],
	["pi-tui", piTui],
	["pi-bar", piBar],
	["pi-permissions", permissions],
	["pi-effort", effort],
	["pi-paster", paster],
	["escape-restore-prompt", escapeRestorePrompt],
	["pi-user-message", piUserMessage],
	["rpiv-args", args],
	["rpiv-ask-user-question", askUserQuestion],
	["rpiv-web-tools", webTools],
	["rpiv-btw", btw],
	["pi-mcp-adapter", mcpAdapter],
	["codex-fast-mode", codexFastMode],
	["subagents", subagents],
];

export default async function lazyPi(pi: ExtensionAPI) {
	for (const [name, register] of modules) {
		try {
			await register(pi);
		} catch (error) {
			const message = error instanceof Error ? error.stack || error.message : String(error);
			console.error(`[lazypi] failed to load ${name}: ${message}`);
			throw error;
		}
	}
}
