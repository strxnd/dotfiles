import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

const STATE_FILE = join(getAgentDir(), "codex-fast-mode.json");
const COMMAND_USAGE = "Usage: /fast on|off|status";

type FastModeState = {
	enabled?: boolean;
};

function loadEnabled(): boolean {
	try {
		if (!existsSync(STATE_FILE)) return false;
		const parsed = JSON.parse(readFileSync(STATE_FILE, "utf8")) as FastModeState;
		return parsed.enabled === true;
	} catch {
		return false;
	}
}

function saveEnabled(enabled: boolean): void {
	mkdirSync(dirname(STATE_FILE), { recursive: true });
	writeFileSync(STATE_FILE, `${JSON.stringify({ enabled }, null, 2)}\n`, "utf8");
}

function isCodexModel(ctx: ExtensionContext): boolean {
	return ctx.model?.provider === "openai-codex" || ctx.model?.api === "openai-codex-responses";
}

function formatStatus(enabled: boolean, ctx: ExtensionContext): string {
	const modelStatus = isCodexModel(ctx)
		? enabled
			? "active for current model"
			: "current model is openai-codex"
		: "current model is not openai-codex";
	return `Codex fast mode: ${enabled ? "on" : "off"} (${modelStatus})`;
}

function setServiceTier(payload: unknown): unknown {
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
		return payload;
	}
	return { ...(payload as Record<string, unknown>), service_tier: "priority" };
}

export default function codexFastModeExtension(pi: ExtensionAPI) {
	let enabled = loadEnabled();

	pi.registerCommand("fast", {
		description: "Toggle OpenAI Codex fast mode",
		getArgumentCompletions: (prefix: string) => {
			const options = ["on", "off", "status"];
			const matches = options
				.filter((option) => option.startsWith(prefix.toLowerCase()))
				.map((option) => ({ value: option, label: option }));
			return matches.length > 0 ? matches : null;
		},
		handler: async (args, ctx) => {
			const arg = args.trim().toLowerCase() || "status";
			if (arg !== "on" && arg !== "off" && arg !== "status") {
				ctx.ui.notify(COMMAND_USAGE, "error");
				return;
			}

			if (arg === "on" || arg === "off") {
				enabled = arg === "on";
				saveEnabled(enabled);
			}

			ctx.ui.notify(formatStatus(enabled, ctx), "info");
		},
	});

	pi.on("before_provider_request", (event, ctx) => {
		if (!enabled || !isCodexModel(ctx)) return;
		return setServiceTier(event.payload);
	});
}
