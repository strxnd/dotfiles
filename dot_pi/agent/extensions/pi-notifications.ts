import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CONFIG_PATH = join(getAgentDir(), "notifications.json");
const PERMISSION_PROMPT_OPEN_EVENT = "pi-permissions:prompt-open";
const FOCUS_IN = "\x1b[I";
const FOCUS_OUT = "\x1b[O";
const FOCUS_SEQUENCE_RE = /\x1b\[[IO]/g;
const MAX_TITLE_LENGTH = 80;
const MAX_BODY_LENGTH = 240;

const DEFAULT_CONFIG: NotificationConfig = {
	enabled: true,
	notifyWhen: "unfocused",
	cooldownMs: 1500,
	channels: {
		desktop: { enabled: true },
		command: { enabled: false, argv: [] },
	},
	triggers: {
		agentFinished: true,
		approvalNeeded: true,
		toolFailure: true,
	},
};

type NotificationConfig = {
	enabled?: boolean;
	notifyWhen?: "unfocused" | "always";
	cooldownMs?: number;
	channels?: {
		desktop?: { enabled?: boolean };
		command?: { enabled?: boolean; argv?: string[] };
	};
	triggers?: {
		agentFinished?: boolean;
		approvalNeeded?: boolean;
		toolFailure?: boolean;
	};
};

type PermissionPromptPayload = {
	source?: string;
	title?: string;
	body?: string;
	tool?: string;
	command?: string;
	path?: string;
	description?: string;
	reason?: string;
	changes?: {
		added?: number;
		removed?: number;
		noChanges?: boolean;
	};
};

type TextPart = { type?: string; text?: string };
type MessageLike = { role?: string; content?: string | TextPart[]; toolName?: string; isError?: boolean; details?: unknown };

type NotificationState = {
	focused: boolean;
	focusTrackingEnabled: boolean;
	lastSentAtByKey: Map<string, number>;
};

function asPermissionPromptPayload(payload: unknown): PermissionPromptPayload | undefined {
	return payload && typeof payload === "object" ? (payload as PermissionPromptPayload) : undefined;
}

function mergeConfig(base: NotificationConfig, override: NotificationConfig): NotificationConfig {
	return {
		...base,
		...override,
		channels: {
			...base.channels,
			...override.channels,
			desktop: { ...base.channels?.desktop, ...override.channels?.desktop },
			command: { ...base.channels?.command, ...override.channels?.command },
		},
		triggers: {
			...base.triggers,
			...override.triggers,
		},
	};
}

function loadConfig(): NotificationConfig {
	try {
		if (!existsSync(CONFIG_PATH)) return DEFAULT_CONFIG;
		const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as NotificationConfig;
		return mergeConfig(DEFAULT_CONFIG, parsed);
	} catch {
		return DEFAULT_CONFIG;
	}
}

function truncateText(text: string, maxLength: number): string {
	const normalized = text.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
	if (normalized.length <= maxLength) return normalized;
	return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function truncateBody(text: string, maxLength: number): string {
	const normalized = text
		.replace(/\r\n/g, "\n")
		.replace(/\r/g, "\n")
		.split("\n")
		.map((line) => line.replace(/\s+/g, " ").trim())
		.filter(Boolean)
		.join("\n");
	if (normalized.length <= maxLength) return normalized;
	return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function multilineBody(lines: Array<string | undefined>): string {
	return lines
		.map((line) => line?.trim())
		.filter((line): line is string => Boolean(line))
		.join("\n");
}

function messageText(message: MessageLike | undefined): string {
	if (!message) return "";
	if (typeof message.content === "string") return message.content;
	if (!Array.isArray(message.content)) return "";
	return message.content
		.filter((part) => (part.type === undefined || part.type === "text") && typeof part.text === "string")
		.map((part) => part.text)
		.join("\n");
}

function lastSentence(text: string): string {
	const cleaned = text
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/[\r\n]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	if (!cleaned) return "";

	const sentences = cleaned.match(/[^.!?]+[.!?](?=\s|$)|[^.!?]+$/g) ?? [cleaned];
	const sentence = sentences[sentences.length - 1]?.replace(/^[-*•\s]+/, "").trim() ?? "";
	return truncateText(sentence, MAX_BODY_LENGTH);
}

function getLastAssistantSentence(messages: MessageLike[] | undefined): string {
	const lastAssistant = [...(messages ?? [])].reverse().find((message) => message.role === "assistant");
	return lastSentence(messageText(lastAssistant));
}

function compactToolInput(toolName: string, input: unknown): string | undefined {
	if (!input || typeof input !== "object") return undefined;
	const data = input as Record<string, unknown>;
	if (toolName === "bash" && typeof data.command === "string") return truncateText(data.command, 180);
	if ((toolName === "edit" || toolName === "write" || toolName === "read") && typeof data.path === "string") return truncateText(data.path, 180);
	return undefined;
}

function formatPermissionBody(payload: PermissionPromptPayload): string {
	if (payload.body) return payload.body;
	if (payload.tool === "bash") {
		return multilineBody([
			payload.command ? `bash: ${truncateText(payload.command, 160)}` : undefined,
			payload.description ? `Description: ${truncateText(payload.description, 160)}` : undefined,
			`Reason: ${payload.reason ? truncateText(payload.reason, 120) : "approval required"}`,
		]);
	}
	if (payload.tool === "write" || payload.tool === "edit") {
		const changes = payload.changes?.noChanges ? "No textual changes detected" : `+${payload.changes?.added ?? 0} -${payload.changes?.removed ?? 0}`;
		return multilineBody([`${payload.tool}: ${payload.path ? truncateText(payload.path, 160) : "file change"}`, `Changes: ${changes}`]);
	}
	return "Pi is waiting for your approval.";
}

function shouldNotify(config: NotificationConfig, state: NotificationState): boolean {
	if (config.enabled === false) return false;
	if (config.notifyWhen === "always") return true;
	return !state.focused;
}

function shouldSendByCooldown(title: string, body: string, config: NotificationConfig, state: NotificationState): boolean {
	const cooldownMs = typeof config.cooldownMs === "number" ? Math.max(0, config.cooldownMs) : DEFAULT_CONFIG.cooldownMs!;
	const key = `${title}\n${body}`;
	const now = Date.now();
	const previous = state.lastSentAtByKey.get(key) ?? 0;
	if (now - previous < cooldownMs) return false;
	state.lastSentAtByKey.set(key, now);
	return true;
}

function execFileQuiet(command: string, args: string[]): void {
	try {
		const child = execFile(command, args, { timeout: 5000 }, () => {});
		child.unref?.();
	} catch {
		// Notification failures must never interrupt pi.
	}
}

function appleScriptString(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n")}"`;
}

function powershellSingleQuoted(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

function notifyDesktop(title: string, body: string): void {
	if (process.platform === "darwin") {
		execFileQuiet("osascript", ["-e", `display notification ${appleScriptString(body)} with title ${appleScriptString(title)}`]);
		return;
	}
	if (process.platform === "win32") {
		const script = [
			"[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null",
			"$template = [Windows.UI.Notifications.ToastTemplateType]::ToastText02",
			"$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent($template)",
			`$xml.GetElementsByTagName('text')[0].AppendChild($xml.CreateTextNode(${powershellSingleQuoted(title)})) > $null`,
			`$xml.GetElementsByTagName('text')[1].AppendChild($xml.CreateTextNode(${powershellSingleQuoted(body)})) > $null`,
			"$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)",
			"[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Pi').Show($toast)",
		].join("; ");
		execFileQuiet("powershell.exe", ["-NoProfile", "-Command", script]);
		return;
	}
	execFileQuiet("notify-send", [title, body]);
}

function renderCommandArg(arg: string, title: string, body: string): string {
	return arg.replaceAll("{title}", title).replaceAll("{body}", body);
}

function notifyCommand(config: NotificationConfig, title: string, body: string): void {
	const argv = config.channels?.command?.argv;
	if (!config.channels?.command?.enabled || !Array.isArray(argv) || argv.length === 0) return;
	const [command, ...args] = argv.map((arg) => renderCommandArg(String(arg), title, body));
	if (!command) return;
	execFileQuiet(command, args);
}

function sendSystemNotification(rawTitle: string, rawBody: string, state: NotificationState): void {
	const config = loadConfig();
	if (!shouldNotify(config, state)) return;

	const title = truncateText(rawTitle, MAX_TITLE_LENGTH) || "Pi";
	const body = truncateBody(rawBody, MAX_BODY_LENGTH) || "Waiting for input.";
	if (!shouldSendByCooldown(title, body, config, state)) return;

	if (config.channels?.desktop?.enabled !== false) notifyDesktop(title, body);
	notifyCommand(config, title, body);
}

function enableFocusReporting(): void {
	try {
		process.stdout.write("\x1b[?1004h");
	} catch {
		// Ignore terminals that do not support focus reporting.
	}
}

function disableFocusReporting(): void {
	try {
		process.stdout.write("\x1b[?1004l");
	} catch {
		// Ignore terminals that do not support focus reporting.
	}
}

function setupFocusTracking(ctx: ExtensionContext, state: NotificationState): () => void {
	state.focused = true;
	state.focusTrackingEnabled = true;
	enableFocusReporting();
	return ctx.ui.onTerminalInput((data) => {
		if (data.includes(FOCUS_IN)) state.focused = true;
		if (data.includes(FOCUS_OUT)) state.focused = false;
		const stripped = data.replace(FOCUS_SEQUENCE_RE, "");
		if (stripped !== data) return stripped ? { data: stripped } : { consume: true };
		return undefined;
	});
}

export default function piNotifications(pi: ExtensionAPI) {
	const state: NotificationState = {
		focused: true,
		focusTrackingEnabled: false,
		lastSentAtByKey: new Map(),
	};
	let unsubscribeFocus: (() => void) | undefined;

	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		unsubscribeFocus?.();
		unsubscribeFocus = setupFocusTracking(ctx, state);
	});

	pi.on("session_shutdown", async () => {
		unsubscribeFocus?.();
		unsubscribeFocus = undefined;
		if (state.focusTrackingEnabled) disableFocusReporting();
		state.focusTrackingEnabled = false;
		state.focused = true;
	});

	pi.events.on(PERMISSION_PROMPT_OPEN_EVENT, (payload: unknown) => {
		const config = loadConfig();
		if (config.triggers?.approvalNeeded === false) return;
		const approval = asPermissionPromptPayload(payload);
		const title = approval?.title || "Pi needs approval";
		const body = formatPermissionBody(approval ?? {});
		sendSystemNotification(title, body, state);
	});

	pi.on("tool_result", async (event) => {
		const config = loadConfig();
		if (config.triggers?.toolFailure === false || !event.isError) return;
		const target = compactToolInput(event.toolName, event.input);
		const body = target ? `${event.toolName}: ${target}` : `${event.toolName} failed.`;
		sendSystemNotification("Pi tool failed", body, state);
	});

	pi.on("agent_end", async (event) => {
		const config = loadConfig();
		if (config.triggers?.agentFinished === false) return;
		const sentence = getLastAssistantSentence((event as { messages?: MessageLike[] }).messages);
		sendSystemNotification("Pi is ready", sentence || "Waiting for input.", state);
	});
}
