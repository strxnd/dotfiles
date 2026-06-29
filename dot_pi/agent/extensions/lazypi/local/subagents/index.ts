import {
	DefaultResourceLoader,
	SessionManager,
	SettingsManager,
	createAgentSession,
	getAgentDir,
	type AgentSession,
	type AgentSessionEvent,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
	type ToolInfo,
} from "@earendil-works/pi-coding-agent";
import { Key, Text, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { execFileSync } from "node:child_process";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Type } from "typebox";
import permissionsExtension from "../pi-permissions.ts";

type AgentSource = "built-in" | "project" | "user";
type AgentState = "starting" | "running" | "blocked" | "completed" | "stopped" | "failed";
type AgentScope = "all" | "built-in" | "project" | "user";
type SendMode = "auto" | "steer" | "followUp" | "prompt";
type IsolationMode = "none" | "worktree";
type Effort = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

type Frontmatter = Record<string, unknown>;

type AgentDefinition = {
	name: string;
	description: string;
	prompt: string;
	source: AgentSource;
	filePath?: string;
	tools?: string[];
	disallowedTools?: string[];
	model?: string;
	permissionMode?: string;
	maxTurns?: number;
	skills?: string[];
	mcpServers?: string[];
	hooks?: unknown;
	memory?: boolean | string;
	background?: boolean;
	effort?: Effort;
	isolation?: IsolationMode;
	color?: string;
	initialPrompt?: string;
	enabled: boolean;
	validationErrors: string[];
};

type DefinitionCatalog = {
	definitions: AgentDefinition[];
	diagnostics: string[];
};

type WorktreeHandle = {
	repoRoot: string;
	originalCwd: string;
	cwd: string;
	path: string;
	branch: string;
};

type UsageStats = {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	total: number;
	cost: number;
	turns: number;
};

type AgentRecord = {
	id: string;
	name: string;
	task: string;
	summary: string;
	state: AgentState;
	source: AgentSource;
	startedAt: number;
	updatedAt: number;
	completedAt?: number;
	parentSessionId: string;
	parentAgentId?: string;
	depth: number;
	resumable: boolean;
	background: boolean;
	pinned?: boolean;
	maxTurns?: number;
	session?: AgentSession;
	unsubscribe?: () => void;
	transcriptPath: string;
	sessionFile?: string;
	finalOutput?: string;
	lastActivity?: string;
	waitingFor?: string;
	error?: string;
	usage: UsageStats;
	descendants: number;
	worktree?: WorktreeHandle;
	worktreeResult?: string;
	run?: Promise<void>;
};

type PanelSelection = {
	tab: "running" | "library";
	index: number;
};

const MAX_NESTING_DEPTH = 5;
const TRANSCRIPT_RETENTION_DAYS = 30;
const SUBAGENTS_CHANGED_EVENT = "lazypi:subagents-changed";
const BAR_SEGMENT_ID = "lazypi:subagents";
const PANEL_WIDGET_KEY = "lazypi:subagents-panel";
const AGENT_VIEW_OPEN_EVENT = "lazypi:agent-view-open";
const AGENT_VIEW_CLOSE_EVENT = "lazypi:agent-view-close";
const DEFAULT_RECENT_LIMIT = 5;

const SUPPORTED_FRONTMATTER = new Set([
	"name",
	"description",
	"tools",
	"disallowedTools",
	"model",
	"permissionMode",
	"maxTurns",
	"skills",
	"mcpServers",
	"hooks",
	"memory",
	"background",
	"effort",
	"isolation",
	"color",
	"initialPrompt",
	"enabled",
]);

const READ_ONLY_TOOLS = ["read", "grep", "find", "ls", "web_search", "web_fetch", "ask_user_question", "question"];

const BUILT_INS: AgentDefinition[] = [
	{
		name: "Explore",
		description: "Read-only code search and analysis.",
		source: "built-in",
		enabled: true,
		tools: READ_ONLY_TOOLS,
		disallowedTools: ["Agent", "SendMessage", "get_subagent_result", "write", "edit", "bash"],
		effort: "low",
		isolation: "none",
		validationErrors: [],
		prompt: [
			"You are a read-only exploration agent.",
			"Search the workspace, inspect relevant files, and return concise findings with file paths.",
			"Do not edit files, run mutating commands, or launch additional agents.",
		].join("\n\n"),
	},
	{
		name: "Plan",
		description: "Read-only research for implementation planning.",
		source: "built-in",
		enabled: true,
		tools: READ_ONLY_TOOLS,
		disallowedTools: ["Agent", "SendMessage", "get_subagent_result", "write", "edit", "bash"],
		effort: "medium",
		isolation: "none",
		validationErrors: [],
		prompt: [
			"You are a read-only planning agent.",
			"Gather implementation context, identify risks, and produce an actionable plan.",
			"Do not edit files, run mutating commands, or launch additional agents.",
		].join("\n\n"),
	},
	{
		name: "general-purpose",
		description: "Full-capability delegated worker.",
		source: "built-in",
		enabled: true,
		effort: "medium",
		isolation: "none",
		validationErrors: [],
		prompt: [
			"You are a delegated Pi subagent with a fresh context.",
			"Complete the assigned task end to end, verify what you change, and report the result clearly.",
			"Use tools conservatively and keep the parent agent informed through your final answer.",
		].join("\n\n"),
	},
];

const AgentParams = Type.Object({
	agent: Type.Optional(Type.String({ description: "Agent name. Defaults to general-purpose." })),
	task: Type.String({ description: "Task to delegate." }),
	background: Type.Optional(Type.Boolean({ description: "Run in the background and return immediately." })),
	fork: Type.Optional(Type.Boolean({ description: "Start from the parent conversation when available." })),
	cwd: Type.Optional(Type.String({ description: "Working directory for the agent." })),
	isolation: Type.Optional(Type.String({ description: "Isolation mode: none or worktree." })),
});

const SendMessageParams = Type.Object({
	to: Type.Optional(Type.String({ description: "Subagent id or name." })),
	agentId: Type.Optional(Type.String({ description: "Subagent id." })),
	agentName: Type.Optional(Type.String({ description: "Subagent name. Uses the most recent match." })),
	message: Type.Optional(Type.String({ description: "Message to send." })),
	mode: Type.Optional(Type.String({ description: "auto, steer, followUp, prompt, stop, or dismiss." })),
});

const ResultParams = Type.Object({
	to: Type.Optional(Type.String({ description: "Subagent id or name." })),
	agentId: Type.Optional(Type.String({ description: "Subagent id." })),
	agentName: Type.Optional(Type.String({ description: "Subagent name. Uses the most recent match." })),
});

const records = new Map<string, AgentRecord>();
let currentCtx: ExtensionContext | undefined;
let currentPi: ExtensionAPI | undefined;
let terminalInputUnsubscribe: (() => void) | undefined;
let agentViewDepth = 0;
let activeAgentViewTui: { requestRender(): void } | undefined;
let panelSelection: PanelSelection = { tab: "running", index: 0 };
let cleanupStarted = false;
let internalSessionLoadCount = 0;
let attachedAgentId: string | undefined;

function now(): number {
	return Date.now();
}

function safeId(): string {
	return randomUUID().replace(/-/g, "").slice(0, 12);
}

function sanitizeName(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}

function asString(value: unknown): string | undefined {
	if (typeof value === "string") return value.trim();
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return undefined;
}

function asStringArray(value: unknown): string[] | undefined {
	if (Array.isArray(value)) {
		const items = value.map(asString).filter((item): item is string => Boolean(item));
		return items.length > 0 ? items : undefined;
	}
	if (typeof value === "string") {
		const items = value
			.split(",")
			.map((item) => item.trim())
			.filter(Boolean);
		return items.length > 0 ? items : undefined;
	}
	return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		if (["true", "yes", "on", "1"].includes(normalized)) return true;
		if (["false", "no", "off", "0"].includes(normalized)) return false;
	}
	return undefined;
}

function asNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim()) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

function parseScalar(raw: string): unknown {
	const value = raw.trim();
	if (!value) return "";
	if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
		return value.slice(1, -1);
	}
	if (value === "true") return true;
	if (value === "false") return false;
	if (value === "null") return null;
	if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
	if (value.startsWith("[") && value.endsWith("]")) {
		const inner = value.slice(1, -1).trim();
		if (!inner) return [];
		return inner.split(",").map((item) => parseScalar(item.trim()));
	}
	return value;
}

function parseFrontmatter(content: string): { frontmatter: Frontmatter; body: string } {
	if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) return { frontmatter: {}, body: content };
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!match) return { frontmatter: {}, body: content };

	const frontmatter: Frontmatter = {};
	let pendingListKey: string | undefined;
	for (const rawLine of match[1]!.split(/\r?\n/)) {
		if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;
		const listItem = rawLine.match(/^\s*-\s*(.*)$/);
		if (listItem && pendingListKey) {
			const current = Array.isArray(frontmatter[pendingListKey]) ? (frontmatter[pendingListKey] as unknown[]) : [];
			current.push(parseScalar(listItem[1] ?? ""));
			frontmatter[pendingListKey] = current;
			continue;
		}
		const pair = rawLine.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
		if (!pair) continue;
		const key = pair[1]!;
		const rawValue = pair[2] ?? "";
		if (rawValue.trim() === "") {
			frontmatter[key] = [];
			pendingListKey = key;
		} else {
			frontmatter[key] = parseScalar(rawValue);
			pendingListKey = undefined;
		}
	}

	return { frontmatter, body: content.slice(match[0].length) };
}

function serializeFrontmatter(definition: Pick<AgentDefinition, "name" | "description" | "tools" | "enabled">, body: string): string {
	const lines = ["---", `name: ${definition.name}`, `description: ${definition.description}`];
	if (definition.tools?.length) lines.push(`tools: [${definition.tools.join(", ")}]`);
	if (definition.enabled === false) lines.push("enabled: false");
	lines.push("---", "", body.trim(), "");
	return lines.join("\n");
}

function normalizeIsolation(value: unknown): IsolationMode | undefined {
	const raw = asString(value)?.toLowerCase();
	if (!raw) return undefined;
	if (["worktree", "git-worktree", "true"].includes(raw)) return "worktree";
	if (["none", "false", "off"].includes(raw)) return "none";
	return undefined;
}

function normalizeEffort(value: unknown): Effort | undefined {
	const raw = asString(value)?.toLowerCase();
	if (raw === "off" || raw === "minimal" || raw === "low" || raw === "medium" || raw === "high" || raw === "xhigh") {
		return raw;
	}
	return undefined;
}

function createDefinition(source: AgentSource, filePath: string | undefined, frontmatter: Frontmatter, body: string): AgentDefinition | undefined {
	const name = asString(frontmatter.name);
	const description = asString(frontmatter.description);
	if (!name || !description) return undefined;

	const errors: string[] = [];
	for (const key of Object.keys(frontmatter)) {
		if (!SUPPORTED_FRONTMATTER.has(key)) errors.push(`Unsupported frontmatter field: ${key}`);
	}
	if (frontmatter.hooks !== undefined) errors.push("hooks are parsed but not supported by lazypi subagents v1");

	const maxTurns = asNumber(frontmatter.maxTurns);
	const enabled = asBoolean(frontmatter.enabled);
	const isolation = normalizeIsolation(frontmatter.isolation);
	const effort = normalizeEffort(frontmatter.effort);
	if (frontmatter.isolation !== undefined && !isolation) errors.push("isolation must be none or worktree");
	if (frontmatter.effort !== undefined && !effort) errors.push("effort must be off, minimal, low, medium, high, or xhigh");

	return {
		name,
		description,
		source,
		filePath,
		prompt: body.trim(),
		tools: asStringArray(frontmatter.tools),
		disallowedTools: asStringArray(frontmatter.disallowedTools),
		model: asString(frontmatter.model),
		permissionMode: asString(frontmatter.permissionMode),
		maxTurns,
		skills: asStringArray(frontmatter.skills),
		mcpServers: asStringArray(frontmatter.mcpServers),
		hooks: frontmatter.hooks,
		memory: typeof frontmatter.memory === "boolean" ? frontmatter.memory : asString(frontmatter.memory),
		background: asBoolean(frontmatter.background),
		effort,
		isolation,
		color: asString(frontmatter.color),
		initialPrompt: asString(frontmatter.initialPrompt),
		enabled: enabled !== false,
		validationErrors: errors,
	};
}

function walkMarkdown(dir: string): string[] {
	if (!existsSync(dir)) return [];
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const filePath = join(dir, entry.name);
		if (entry.isDirectory()) files.push(...walkMarkdown(filePath));
		else if ((entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith(".md")) files.push(filePath);
	}
	return files;
}

function findNearestProjectAgentsDir(cwd: string): string | undefined {
	let current = resolve(cwd);
	while (true) {
		const candidate = join(current, ".pi", "agents");
		if (existsSync(candidate)) {
			try {
				if (statSync(candidate).isDirectory()) return candidate;
			} catch {
				return undefined;
			}
		}
		const parent = dirname(current);
		if (parent === current) return undefined;
		current = parent;
	}
}

function loadDefinitionsFromDir(dir: string | undefined, source: AgentSource): AgentDefinition[] {
	if (!dir) return [];
	const definitions: AgentDefinition[] = [];
	for (const filePath of walkMarkdown(dir)) {
		try {
			const parsed = parseFrontmatter(readFileSync(filePath, "utf8"));
			const definition = createDefinition(source, filePath, parsed.frontmatter, parsed.body);
			if (definition) definitions.push(definition);
		} catch {
			continue;
		}
	}
	return definitions;
}

function loadCatalog(cwd: string): DefinitionCatalog {
	const userDir = join(getAgentDir(), "agents");
	const projectDir = findNearestProjectAgentsDir(cwd);
	const definitions = [
		...BUILT_INS,
		...loadDefinitionsFromDir(userDir, "user"),
		...loadDefinitionsFromDir(projectDir, "project"),
	];
	const diagnostics = definitions.flatMap((definition) =>
		definition.validationErrors.map((error) => `${definition.name}: ${error}`),
	);
	return { definitions, diagnostics };
}

function findDefinition(cwd: string, name: string): AgentDefinition | undefined {
	const target = name.trim().toLowerCase();
	const enabled = loadCatalog(cwd).definitions.filter((definition) => definition.enabled && definition.validationErrors.length === 0);
	for (const source of ["project", "user", "built-in"] as const) {
		const match = enabled.find((definition) => definition.source === source && definition.name.toLowerCase() === target);
		if (match) return match;
	}
	return undefined;
}

function currentDepth(ctx: ExtensionContext): number {
	const sessionId = ctx.sessionManager.getSessionId();
	for (const record of records.values()) {
		if (record.session?.sessionId === sessionId) return record.depth;
	}
	return 0;
}

function projectKey(cwd: string): string {
	return `-${resolve(cwd).replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "")}-`;
}

function transcriptPath(ctx: ExtensionContext, id: string): string {
	const root = join(getAgentDir(), "projects", projectKey(ctx.cwd), ctx.sessionManager.getSessionId(), "subagents");
	mkdirSync(root, { recursive: true });
	return join(root, `agent-${id}.jsonl`);
}

function appendTranscript(record: AgentRecord, event: Record<string, unknown>): void {
	try {
		mkdirSync(dirname(record.transcriptPath), { recursive: true });
		appendFileSync(record.transcriptPath, `${JSON.stringify({ ts: new Date().toISOString(), ...event })}\n`, "utf8");
	} catch {
		// Transcript persistence is best effort and must not break agent execution.
	}
}

function cleanupOldTranscripts(): void {
	if (cleanupStarted) return;
	cleanupStarted = true;
	const cutoff = now() - TRANSCRIPT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
	const root = join(getAgentDir(), "projects");
	const visit = (dir: string) => {
		if (!existsSync(dir)) return;
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const filePath = join(dir, entry.name);
			if (entry.isDirectory()) visit(filePath);
			else if (entry.isFile() && entry.name.startsWith("agent-") && entry.name.endsWith(".jsonl")) {
				try {
					if (statSync(filePath).mtimeMs < cutoff) unlinkSync(filePath);
				} catch {
					// ignore cleanup races
				}
			}
		}
	};
	try {
		visit(root);
	} catch {
		// ignore cleanup failures
	}
}

function defaultUsage(): UsageStats {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, cost: 0, turns: 0 };
}

function updateUsageFromMessage(record: AgentRecord, message: unknown): void {
	const usage = (message as { usage?: any })?.usage;
	if (!usage) return;
	record.usage.input += Number(usage.input ?? usage.inputTokens ?? 0) || 0;
	record.usage.output += Number(usage.output ?? usage.outputTokens ?? 0) || 0;
	record.usage.cacheRead += Number(usage.cacheRead ?? usage.cacheReadTokens ?? 0) || 0;
	record.usage.cacheWrite += Number(usage.cacheWrite ?? usage.cacheWriteTokens ?? 0) || 0;
	record.usage.total += Number(usage.totalTokens ?? usage.total ?? 0) || 0;
	const cost = usage.cost;
	record.usage.cost += Number(typeof cost === "number" ? cost : cost?.total ?? 0) || 0;
	record.usage.turns++;
}

function messageText(message: unknown): string {
	const content = (message as { content?: unknown })?.content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((part) => {
			if (typeof part === "string") return part;
			if (part && typeof part === "object" && (part as { type?: unknown }).type === "text") {
				return asString((part as { text?: unknown }).text) ?? "";
			}
			return "";
		})
		.filter(Boolean)
		.join("\n");
}

function finalAssistantOutput(messages: readonly unknown[]): string {
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index] as { role?: unknown };
		if (message?.role === "assistant") {
			const text = messageText(message).trim();
			if (text) return text;
		}
	}
	return "";
}

function shortSummary(task: string): string {
	return task.replace(/\s+/g, " ").trim().slice(0, 120);
}

function elapsed(ms: number): string {
	const seconds = Math.max(0, Math.floor(ms / 1000));
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
	const hours = Math.floor(minutes / 60);
	return `${hours}h ${minutes % 60}m`;
}

function formatTokens(count: number): string {
	if (!count) return "0";
	if (count < 1000) return String(Math.round(count));
	if (count < 1_000_000) return `${(count / 1000).toFixed(count < 10_000 ? 1 : 0)}k`;
	return `${(count / 1_000_000).toFixed(1)}m`;
}

function stateIcon(state: AgentState): string {
	switch (state) {
		case "starting":
			return "✻";
		case "running":
			return "✻";
		case "blocked":
			return "✻";
		case "completed":
			return "∙";
		case "stopped":
			return "∙";
		case "failed":
			return "∙";
	}
}

function stateColorKey(state: AgentState): string {
	switch (state) {
		case "blocked":
			return "warning";
		case "completed":
			return "success";
		case "failed":
			return "error";
		case "stopped":
			return "muted";
		default:
			return "accent";
	}
}

function stateLabel(state: AgentState): string {
	switch (state) {
		case "starting":
		case "running":
			return "working";
		case "blocked":
			return "needs input";
		case "completed":
			return "completed";
		case "stopped":
			return "stopped";
		case "failed":
			return "failed";
	}
}

type AgentGroupLabel = "Pinned" | "Ready for review" | "Needs input" | "Working" | "Completed";

function groupLabelForRecord(record: AgentRecord): AgentGroupLabel {
	if (record.pinned) return "Pinned";
	if (reviewLabel(record)) return "Ready for review";
	return groupLabel(record.state);
}

function groupLabel(state: AgentState): Exclude<AgentGroupLabel, "Pinned" | "Ready for review"> {
	if (state === "blocked") return "Needs input";
	if (state === "starting" || state === "running") return "Working";
	return "Completed";
}

function groupRank(record: AgentRecord): number {
	const group = groupLabelForRecord(record);
	if (group === "Pinned") return 0;
	if (group === "Ready for review") return 1;
	if (group === "Needs input") return 2;
	if (group === "Working") return 3;
	return 4;
}

function humanizeName(name: string): string {
	return name
		.replace(/[_-]+/g, " ")
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.trim()
		.toLowerCase();
}

function compactText(value: string | undefined, limit = 120): string {
	return shortSummary(value ?? "").slice(0, limit);
}

function extractToolName(event: unknown): string | undefined {
	const raw = event as any;
	return asString(raw?.toolName ?? raw?.name ?? raw?.tool?.name ?? raw?.toolCall?.name ?? raw?.tool_call?.name);
}

function extractToolArgs(event: unknown): any {
	const raw = event as any;
	return raw?.args ?? raw?.toolInput ?? raw?.input ?? raw?.toolCall?.args ?? raw?.tool_call?.input;
}

function describeToolActivity(toolName: string | undefined, args: any): string {
	const name = (toolName ?? "").toLowerCase();
	const path = asString(args?.path ?? args?.file_path ?? args?.filePath);
	const query = asString(args?.query ?? args?.pattern ?? args?.search);
	const command = asString(args?.command ?? args?.cmd);
	if (!name) return "working";
	if (["read", "open"].includes(name)) return path ? `Read ${path}` : "Read files";
	if (["grep", "glob", "find", "ls", "web_search", "web_fetch"].includes(name)) {
		return compactText(query ? `Search ${query}` : humanizeName(toolName ?? "search"), 120);
	}
	if (["edit", "write", "apply_patch", "patch"].includes(name)) return path ? `Edit ${path}` : "Edit files";
	if (["bash", "shell", "exec", "exec_command"].includes(name)) return command ? `Run ${compactText(command, 90)}` : "Run command";
	if (["agent", "sendmessage"].includes(name)) return "Run subagent";
	if (name.includes("question") || name.includes("approval")) return "needs input";
	return humanizeName(toolName ?? "working");
}

function formatWaitingFor(payload: unknown): string {
	const raw = payload as any;
	const title = asString(raw?.title);
	const tool = asString(raw?.tool);
	const reason = asString(raw?.reason);
	if (title && tool) return `${title}: ${tool}`;
	if (title) return title;
	if (reason) return reason;
	if (tool) return `${tool} permission`;
	return "permission prompt";
}

function displaySummary(record: AgentRecord): string {
	if (record.state === "blocked") return `needs input: ${record.waitingFor ?? record.lastActivity ?? record.summary}`;
	if (record.state === "failed") return `failed: ${record.error ?? record.summary}`;
	if (record.state === "stopped") return `stopped: ${record.error ?? record.summary}`;
	if (record.state === "completed") {
		const output = compactText(record.finalOutput, 90);
		return output ? `result: ${output}` : `result: ${record.summary}`;
	}
	return record.lastActivity ?? record.summary;
}

function themeFg(theme: any, key: string, value: string): string {
	return typeof theme?.fg === "function" ? theme.fg(key, value) : value;
}

function themeBg(theme: any, key: string, value: string): string {
	return typeof theme?.bg === "function" ? theme.bg(key, value) : value;
}

function coloredStateIcon(record: AgentRecord, theme: any): string {
	return themeFg(theme, stateColorKey(record.state), stateIcon(record.state));
}

function reviewLabel(record: AgentRecord): string | undefined {
	if (record.state !== "completed") return undefined;
	const text = `${record.finalOutput ?? ""}\n${record.task}`;
	const url = text.match(/https?:\/\/[^\s)]+\/pull\/(\d+)/i);
	if (url?.[1]) return `PR #${url[1]}`;
	const pr = text.match(/\bPR\s*#?(\d+)\b/i);
	if (pr?.[1]) return `PR #${pr[1]}`;
	return undefined;
}

function rightPadVisible(value: string, width: number): string {
	const clipped = truncateToWidth(value, Math.max(0, width), "…");
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function leftPadVisible(value: string, width: number): string {
	const clipped = truncateToWidth(value, Math.max(0, width), "…");
	return " ".repeat(Math.max(0, width - visibleWidth(clipped))) + clipped;
}

function fillToWidth(value: string, width: number): string {
	const clipped = truncateToWidth(value, Math.max(0, width), "…");
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function packageVersion(): string {
	try {
		const settings = JSON.parse(readFileSync(join(getAgentDir(), "settings.json"), "utf8"));
		const version = asString(settings?.lastChangelogVersion);
		if (version) return version.startsWith("v") ? version.slice(1) : version;
	} catch {
		// Header version is decorative; keep rendering if settings are absent.
	}
	return "0.0.0";
}

function agentViewLogo(): string[] {
	const pink = (text: string) => `\x1b[38;2;222;124;125m${text}\x1b[0m`;
	return [
		pink("  ██████  "),
		pink(" ██ ██ ██ "),
		pink(" ████████ "),
		pink("  ██  ██  "),
	];
}

function isActive(record: AgentRecord): boolean {
	return record.state === "starting" || record.state === "running" || record.state === "blocked";
}

function sortedRecords(): AgentRecord[] {
	return [...records.values()].sort((a, b) => {
		const rank = groupRank(a) - groupRank(b);
		if (rank !== 0) return rank;
		if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
		return b.updatedAt - a.updatedAt;
	});
}

function findRecord(params: { to?: string; agentId?: string; agentName?: string }): AgentRecord | undefined {
	if (params.agentId) return records.get(params.agentId);
	if (params.to) {
		const byId = records.get(params.to);
		if (byId) return byId;
	}
	const target = (params.agentName ?? params.to)?.trim().toLowerCase();
	if (!target) return undefined;
	return sortedRecords().find((record) => record.name.toLowerCase() === target);
}

function emitChanged(pi: ExtensionAPI | undefined = currentPi): void {
	pi?.events.emit(SUBAGENTS_CHANGED_EVENT, { source: "lazypi-agent-runner" });
	pi?.events.emit("pi-bar:refresh", { source: "lazypi-agent-runner" });
	activeAgentViewTui?.requestRender();
	if (currentCtx) updatePanel(currentCtx);
}

function resolveModel(ctx: ExtensionContext, modelName: string | undefined): unknown {
	if (!modelName) return undefined;
	if (modelName === "current") return ctx.model;
	const registry = ctx.modelRegistry as any;
	if (modelName.includes(":")) {
		const [provider, id] = modelName.split(":", 2);
		const found = registry.find?.(provider, id);
		if (found) return found;
	}
	for (const model of registry.getAll?.() ?? []) {
		if (model.id === modelName || model.name === modelName || `${model.provider}:${model.id}` === modelName) return model;
	}
	return undefined;
}

function applyToolPolicy(session: AgentSession, definition: AgentDefinition, depth: number): void {
	const available = session.getAllTools().map((tool: ToolInfo) => tool.name);
	const availableSet = new Set(available);
	let active = definition.tools?.length
		? definition.tools.includes("*")
			? available
			: definition.tools.filter((tool) => availableSet.has(tool))
		: available;

	const denied = new Set(definition.disallowedTools ?? []);
	if (depth >= MAX_NESTING_DEPTH) denied.add("Agent");
	active = active.filter((tool) => !denied.has(tool));

	if (active.length > 0) session.setActiveToolsByName(active);
}

function buildSystemAppend(definition: AgentDefinition, task: string, depth: number): string {
	const parts = [
		`Subagent name: ${definition.name}`,
		`Subagent description: ${definition.description}`,
		`Nesting depth: ${depth}/${MAX_NESTING_DEPTH}`,
		"Start from a fresh context unless the task explicitly says fork mode is active.",
		"Return a direct final answer for the parent agent. Include changed paths and verification when you edit files.",
	];
	if (definition.permissionMode) parts.push(`Requested permission mode: ${definition.permissionMode}`);
	if (definition.skills?.length) parts.push(`Requested skills: ${definition.skills.join(", ")}`);
	if (definition.mcpServers?.length) parts.push(`Requested MCP servers: ${definition.mcpServers.join(", ")}`);
	if (definition.prompt.trim()) parts.push(definition.prompt.trim());
	if (definition.initialPrompt) parts.push(`Initial instruction: ${definition.initialPrompt}`);
	parts.push(`Delegated task:\n${task}`);
	return parts.join("\n\n");
}

function buildTaskPrompt(record: AgentRecord, definition: AgentDefinition, cwd: string): string {
	return [
		definition.initialPrompt,
		`Task: ${record.task}`,
		`Working directory: ${cwd}`,
		`Subagent id: ${record.id}`,
		`Parent session id: ${record.parentSessionId}`,
	].filter(Boolean).join("\n\n");
}

function runGit(cwd: string, args: string[], env?: NodeJS.ProcessEnv): string {
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		env: env ? { ...process.env, ...env } : process.env,
	}).trim();
}

function createWorktree(originalCwd: string, id: string): WorktreeHandle {
	let repoRoot: string;
	try {
		repoRoot = runGit(originalCwd, ["rev-parse", "--show-toplevel"]);
	} catch {
		throw new Error("worktree isolation requires a valid git repository");
	}
	const branch = `lazypi-agent-${id}`;
	const path = join(tmpdir(), `lazypi-agent-${id}`);
	rmSync(path, { recursive: true, force: true });
	runGit(repoRoot, ["worktree", "add", "-b", branch, path, "HEAD"]);
	const relativeCwd = relative(repoRoot, resolve(originalCwd));
	const cwd = relativeCwd && !relativeCwd.startsWith("..") ? join(path, relativeCwd) : path;
	return { repoRoot, originalCwd, cwd, path, branch };
}

function finalizeWorktree(record: AgentRecord): void {
	const worktree = record.worktree;
	if (!worktree) return;
	try {
		const status = runGit(worktree.path, ["status", "--porcelain"]);
		if (!status) {
			runGit(worktree.repoRoot, ["worktree", "remove", "--force", worktree.path]);
			record.worktreeResult = "no changes; worktree removed";
			return;
		}
		runGit(worktree.path, ["add", "-A"]);
		const staged = execFileSync("git", ["diff", "--cached", "--quiet"], { cwd: worktree.path, stdio: "ignore" });
		void staged;
		record.worktreeResult = `changes left in ${worktree.path} on branch ${worktree.branch}`;
	} catch {
		try {
			runGit(
				worktree.path,
				["commit", "-m", `chore: preserve subagent ${record.id} changes`],
				{
					GIT_AUTHOR_NAME: "lazypi",
					GIT_AUTHOR_EMAIL: "lazypi@localhost",
					GIT_COMMITTER_NAME: "lazypi",
					GIT_COMMITTER_EMAIL: "lazypi@localhost",
				},
			);
			runGit(worktree.repoRoot, ["worktree", "remove", "--force", worktree.path]);
			record.worktreeResult = `changes committed on branch ${worktree.branch}`;
		} catch {
			record.worktreeResult = `changes left in ${worktree.path} on branch ${worktree.branch}`;
		}
	}
}

function subagentStatusBridge(record: AgentRecord) {
	return (pi: ExtensionAPI) => {
		pi.events.on("pi-permissions:prompt-open", (payload: unknown) => {
			if (!isActive(record)) return;
			record.state = "blocked";
			record.waitingFor = formatWaitingFor(payload);
			record.updatedAt = now();
			appendTranscript(record, { type: "blocked", waitingFor: record.waitingFor });
			emitChanged();
		});
		pi.events.on("pi-permissions:prompt-close", () => {
			if (record.state !== "blocked") return;
			record.state = "running";
			record.waitingFor = undefined;
			record.updatedAt = now();
			emitChanged();
		});
	};
}

async function createNativeSession(
	ctx: ExtensionContext,
	definition: AgentDefinition,
	record: AgentRecord,
	cwd: string,
	fork: boolean,
): Promise<AgentSession> {
	internalSessionLoadCount++;
	try {
		const settingsManager = SettingsManager.create(cwd, getAgentDir());
		const resourceLoader = new DefaultResourceLoader({
			cwd,
			agentDir: getAgentDir(),
			settingsManager,
			noExtensions: true,
			extensionFactories: [permissionsExtension, subagentStatusBridge(record), subagentsExtension],
			appendSystemPromptOverride: (base) => [...base, buildSystemAppend(definition, record.task, record.depth)],
		});
		await resourceLoader.reload();

		const parentSessionFile = ctx.sessionManager.getSessionFile?.();
		const sessionManager =
			fork && parentSessionFile
				? SessionManager.forkFrom(parentSessionFile, cwd, dirname(record.transcriptPath))
				: SessionManager.inMemory(cwd);

		const model = resolveModel(ctx, definition.model);
		const { session } = await createAgentSession({
			cwd,
			agentDir: getAgentDir(),
			model: model as any,
			thinkingLevel: definition.effort,
			resourceLoader,
			sessionManager,
			settingsManager,
			sessionStartEvent: { type: "session_start", reason: fork ? "fork" : "new", previousSessionFile: parentSessionFile },
		});
		await session.bindExtensions({ uiContext: ctx.ui });
		applyToolPolicy(session, definition, record.depth);
		return session;
	} finally {
		internalSessionLoadCount = Math.max(0, internalSessionLoadCount - 1);
	}
}

function subscribeRecord(record: AgentRecord, session: AgentSession): () => void {
	return session.subscribe((event: AgentSessionEvent) => {
		record.updatedAt = now();
		appendTranscript(record, { event });
		if (event.type === "agent_start") {
			record.state = "running";
		} else if (event.type === "message_update") {
			const text = messageText((event as any).message).trim();
			if (text) record.finalOutput = text;
		} else if (event.type === "message_end") {
			updateUsageFromMessage(record, (event as any).message);
			const output = finalAssistantOutput(session.messages as unknown[]);
			if (output) record.finalOutput = output;
		} else if (event.type === "tool_execution_start") {
			record.state = "running";
			record.waitingFor = undefined;
			record.lastActivity = describeToolActivity(extractToolName(event), extractToolArgs(event));
		} else if (event.type === "turn_end" && record.maxTurns !== undefined && (event as any).turnIndex + 1 >= record.maxTurns) {
			void stopRecord(record, `maxTurns ${record.maxTurns} reached`);
		} else if (event.type === "agent_end") {
			record.finalOutput = finalAssistantOutput((event as any).messages ?? session.messages);
			if (record.state !== "stopped") {
				record.state = "completed";
				record.completedAt = now();
				record.lastActivity = "complete";
			}
		}
		emitChanged();
	});
}

async function runRecord(
	ctx: ExtensionContext,
	pi: ExtensionAPI,
	definition: AgentDefinition,
	record: AgentRecord,
	options: { cwd: string; fork: boolean; signal?: AbortSignal },
): Promise<void> {
	record.state = "starting";
	record.lastActivity = "starting";
	record.updatedAt = now();
	records.set(record.id, record);
	appendTranscript(record, { type: "start", definition, task: record.task });
	emitChanged(pi);

	const abort = () => {
		void stopRecord(record, "parent request");
	};
	if (options.signal) {
		if (options.signal.aborted) abort();
		else options.signal.addEventListener("abort", abort, { once: true });
	}

	try {
		let cwd = options.cwd;
		if (definition.isolation === "worktree") {
			record.worktree = createWorktree(cwd, record.id);
			cwd = record.worktree.cwd;
			record.resumable = false;
		}

		const session = await createNativeSession(ctx, definition, record, cwd, options.fork);
		record.session = session;
		record.sessionFile = session.sessionFile;
		record.unsubscribe = subscribeRecord(record, session);
		record.state = "running";
		record.lastActivity = "thinking";
		emitChanged(pi);
		await session.prompt(buildTaskPrompt(record, definition, cwd), { source: "extension" });
		if (record.state !== "stopped" && record.state !== "failed") {
			record.state = "completed";
			record.completedAt = now();
			record.finalOutput = finalAssistantOutput(session.messages as unknown[]) || record.finalOutput;
		}
		appendTranscript(record, { type: "complete", output: record.finalOutput, usage: record.usage });
	} catch (error) {
		if (record.state !== "stopped") {
			record.state = "failed";
			record.error = error instanceof Error ? error.message : String(error);
			record.completedAt = now();
			appendTranscript(record, { type: "failed", error: record.error });
		}
	} finally {
		options.signal?.removeEventListener("abort", abort);
		finalizeWorktree(record);
		record.updatedAt = now();
		emitChanged(pi);
	}
}

async function continueRecord(record: AgentRecord, message: string, mode: SendMode): Promise<void> {
	if (!record.session) throw new Error(`Subagent ${record.id} is not available in this runtime`);
	if (!record.resumable) throw new Error(`Subagent ${record.id} is not resumable`);
	record.state = "running";
	record.waitingFor = undefined;
	record.lastActivity = "reply sent";
	record.updatedAt = now();
	appendTranscript(record, { type: "message", mode, message });
	emitChanged();
	if (record.session.isStreaming) {
		const deliverAs = mode === "followUp" ? "followUp" : "steer";
		await record.session.sendUserMessage(message, { deliverAs });
	} else if (mode === "steer") {
		await record.session.steer(message);
	} else if (mode === "followUp") {
		await record.session.followUp(message);
	} else {
		await record.session.prompt(message, { source: "extension" });
	}
	if (record.state !== "stopped" && record.state !== "failed") {
		record.state = "completed";
		record.completedAt = now();
		record.finalOutput = finalAssistantOutput(record.session.messages as unknown[]) || record.finalOutput;
		record.lastActivity = "complete";
		appendTranscript(record, { type: "complete", output: record.finalOutput, usage: record.usage });
	}
	record.updatedAt = now();
	emitChanged();
}

async function stopRecord(record: AgentRecord, reason: string): Promise<void> {
	record.state = "stopped";
	record.completedAt = now();
	record.updatedAt = now();
	record.error = reason;
	record.lastActivity = "stopped";
	appendTranscript(record, { type: "stopped", reason });
	try {
		await record.session?.abort();
	} catch {
		// ignore abort races
	}
	finalizeWorktree(record);
	emitChanged();
}

function resultText(record: AgentRecord): string {
	const lines = [
		`${record.name} ${stateLabel(record.state)}${record.resumable ? `\nagentId: ${record.id}` : ""}`,
		`Task: ${record.summary}`,
		record.waitingFor ? `Needs input: ${record.waitingFor}` : undefined,
		record.lastActivity ? `Activity: ${record.lastActivity}` : undefined,
		`Transcript: ${record.transcriptPath}`,
		record.worktreeResult ? `Worktree: ${record.worktreeResult}` : undefined,
		record.error ? `Error: ${record.error}` : undefined,
		"",
		record.finalOutput || "(no output yet)",
	].filter((line): line is string => line !== undefined);
	return lines.join("\n");
}

function toolResult(record: AgentRecord, text?: string) {
	return {
		content: [{ type: "text" as const, text: text ?? resultText(record) }],
		details: {
			id: record.id,
			name: record.name,
			state: record.state,
			transcriptPath: record.transcriptPath,
			resumable: record.resumable,
			background: record.background,
			usage: record.usage,
			worktreeResult: record.worktreeResult,
		},
		isError: record.state === "failed",
	};
}

function renderAgentCall(title: string, lines: string[], theme: any): Text {
	const [agent, task, mode] = lines;
	const headline = `${title}(${compactText(task || agent || "agent", 72)})`;
	const detail = [agent, mode].filter(Boolean).join(" · ");
	const body = [
		` ${themeFg(theme, "accent", "✻")} ${typeof theme?.bold === "function" ? theme.bold(headline) : headline}`,
		detail ? `   ${themeFg(theme, "dim", detail)}` : "",
	].filter(Boolean).join("\n");
	return new Text(body, 0, 0);
}

function renderAgentResult(result: any, theme: any): Text {
	const details = result.details ?? {};
	const status = stateLabel(details.state ?? "completed");
	const name = details.name ?? "agent";
	const id = details.resumable && details.id ? ` agentId: ${details.id}` : "";
	const body = [
		` ${themeFg(theme, result.isError ? "error" : stateColorKey(details.state ?? "completed"), stateIcon(details.state ?? "completed"))} ${themeFg(theme, "accent", name)} ${themeFg(theme, "dim", status)}${id ? themeFg(theme, "dim", ` ·${id}`) : ""}`,
		details.transcriptPath ? themeFg(theme, "dim", `   transcript: ${details.transcriptPath}`) : "",
		"",
		result.content?.[0]?.text ?? "",
	].filter(Boolean).join("\n");
	return new Text(body, 0, 0);
}

function rowForRecord(record: AgentRecord, width: number, selected = false, theme?: any): string {
	const age = elapsed(now() - record.updatedAt);
	const tokenText = formatTokens(record.usage.total || record.usage.input + record.usage.output);
	const desc = record.descendants ? ` (+${record.descendants})` : "";
	const icon = theme ? coloredStateIcon(record, theme) : stateIcon(record.state);
	const review = reviewLabel(record);
	const right = review ?? (tokenText !== "0" ? `${tokenText} tok  ${age}` : age);
	const name = `${record.pinned ? "⌃ " : ""}${record.name}${desc}`;
	const nameWidth = Math.min(30, Math.max(18, Math.floor(width * 0.24)));
	const rightWidth = Math.min(Math.max(visibleWidth(right), 4), Math.max(4, Math.floor(width * 0.18)));
	const summaryWidth = Math.max(8, width - 2 - nameWidth - rightWidth);
	const line = [
		"  ",
		rightPadVisible(`${icon} ${name}`, nameWidth),
		rightPadVisible(displaySummary(record), summaryWidth),
		leftPadVisible(right, rightWidth),
	].join("");
	const clipped = fillToWidth(line, Math.max(1, width));
	if (!selected || !theme) return clipped;
	return themeBg(theme, "customMessageBg", clipped);
}

function libraryRows(cwd: string, scope: AgentScope = "all"): AgentDefinition[] {
	return loadCatalog(cwd).definitions
		.filter((definition) => scope === "all" || definition.source === scope)
		.sort((a, b) => `${a.source}:${a.name}`.localeCompare(`${b.source}:${b.name}`));
}

class AgentsPanel {
	private input = "";
	private peekOpen = false;
	private helpOpen = false;
	private deleteArmedId: string | undefined;
	private deleteArmedAt = 0;

	constructor(
		private readonly tui: { requestRender(): void },
		private readonly theme: any,
		private readonly ctx: ExtensionCommandContext,
		private readonly done: () => void,
	) {
		activeAgentViewTui = tui;
	}

	dispose(): void {
		if (activeAgentViewTui === this.tui) activeAgentViewTui = undefined;
	}

	invalidate(): void {}

	private inputIsFilter(): boolean {
		const value = this.input.trim().toLowerCase();
		return value.startsWith("a:") || value.startsWith("s:") || value.startsWith("#");
	}

	private records(): AgentRecord[] {
		const items = sortedRecords();
		const value = this.input.trim().toLowerCase();
		if (panelSelection.tab !== "running" || this.peekOpen || !this.inputIsFilter()) return items;
		if (value.startsWith("a:")) {
			const name = value.slice(2).trim();
			return name ? items.filter((record) => record.name.toLowerCase().includes(name)) : items;
		}
		if (value.startsWith("s:")) {
			const state = value.slice(2).trim();
			return state
				? items.filter((record) =>
					record.state.toLowerCase().includes(state)
					|| stateLabel(record.state).includes(state)
					|| groupLabel(record.state).toLowerCase().includes(state),
				)
				: items;
		}
		const id = value.slice(1).trim();
		return id ? items.filter((record) => record.id.includes(id)) : items;
	}

	private definitions(): AgentDefinition[] {
		return libraryRows(this.ctx.cwd);
	}

	private selectedRecord(): AgentRecord | undefined {
		return this.records()[panelSelection.index];
	}

	private selectedDefinition(): AgentDefinition | undefined {
		return this.definitions()[panelSelection.index];
	}

	private move(delta: number): void {
		const length = panelSelection.tab === "running" ? this.records().length : this.definitions().length;
		panelSelection.index = Math.max(0, Math.min(Math.max(0, length - 1), panelSelection.index + delta));
		this.tui.requestRender();
	}

	private switchTab(tab: "running" | "library"): void {
		panelSelection = { tab, index: 0 };
		this.peekOpen = false;
		this.input = "";
		this.tui.requestRender();
	}

	private async dispatchPrompt(attach = false): Promise<void> {
		const task = this.input.trim();
		if (task.length < 4) {
			this.ctx.ui.notify("Too short. Describe the task to dispatch.", "warning");
			return;
		}
		if (!currentPi) {
			this.ctx.ui.notify("Agent runner is not ready yet.", "error");
			return;
		}
		const definition = findDefinition(this.ctx.cwd, "general-purpose") ?? BUILT_INS.find((item) => item.name === "general-purpose");
		if (!definition) {
			this.ctx.ui.notify("general-purpose agent is unavailable.", "error");
			return;
		}
		const id = safeId();
		const parentRecord = [...records.values()].find((record) => record.session?.sessionId === this.ctx.sessionManager.getSessionId());
		const depth = currentDepth(this.ctx as ExtensionContext) + 1;
		if (depth > MAX_NESTING_DEPTH) {
			this.ctx.ui.notify(`Nested agents are limited to depth ${MAX_NESTING_DEPTH}.`, "warning");
			return;
		}
		const record: AgentRecord = {
			id,
			name: definition.name,
			task,
			summary: shortSummary(task),
			state: "starting",
			source: definition.source,
			startedAt: now(),
			updatedAt: now(),
			parentSessionId: this.ctx.sessionManager.getSessionId(),
			parentAgentId: parentRecord?.id,
			depth,
			resumable: true,
			background: true,
			maxTurns: definition.maxTurns,
			transcriptPath: transcriptPath(this.ctx as ExtensionContext, id),
			usage: defaultUsage(),
			descendants: 0,
			lastActivity: "queued",
		};
		if (parentRecord) parentRecord.descendants++;
		this.input = "";
		panelSelection = { tab: "running", index: 0 };
		if (attach) {
			attachedAgentId = record.id;
			this.peekOpen = true;
		}
		const runnableDefinition = { ...definition, isolation: definition.isolation ?? "none" };
		const run = runRecord(this.ctx as ExtensionContext, currentPi, runnableDefinition, record, { cwd: this.ctx.cwd, fork: false });
		record.run = run;
		void run;
		this.tui.requestRender();
	}

	private async replyTo(record: AgentRecord, message: string): Promise<void> {
		if (!record.resumable) {
			this.ctx.ui.notify(`${record.name} is one-shot and cannot be resumed.`, "warning");
			return;
		}
		try {
			this.input = "";
			const mode = record.session?.isStreaming ? "steer" : "prompt";
			const run = continueRecord(record, message, mode).catch((error) => {
				record.state = "failed";
				record.error = error instanceof Error ? error.message : String(error);
				record.completedAt = now();
				record.updatedAt = now();
				emitChanged();
				this.ctx.ui.notify(record.error, "error");
			});
			record.run = run;
			void run;
			this.tui.requestRender();
		} catch (error) {
			this.ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
		}
	}

	private openPeek(record: AgentRecord | undefined): void {
		if (!record) return;
		attachedAgentId = record.id;
		this.peekOpen = true;
		this.tui.requestRender();
	}

	private async renameRecord(record: AgentRecord): Promise<void> {
		const name = await this.ctx.ui.input("Rename session", record.name);
		if (!name?.trim()) return;
		record.name = shortSummary(name.trim());
		record.updatedAt = now();
		emitChanged();
		this.tui.requestRender();
	}

	private stopOrDelete(record: AgentRecord): void {
		const timestamp = now();
		if (isActive(record)) {
			void stopRecord(record, "stopped from /agents");
			this.deleteArmedId = record.id;
			this.deleteArmedAt = timestamp;
			this.tui.requestRender();
			return;
		}
		if (this.deleteArmedId === record.id && timestamp - this.deleteArmedAt < 2000) {
			records.delete(record.id);
			if (attachedAgentId === record.id) attachedAgentId = undefined;
			this.deleteArmedId = undefined;
			emitChanged();
			this.tui.requestRender();
			return;
		}
		this.deleteArmedId = record.id;
		this.deleteArmedAt = timestamp;
		this.ctx.ui.notify("Press Ctrl+X again to delete this session from the list.", "warning");
		this.tui.requestRender();
	}

	private async createDefinition(): Promise<void> {
		const name = await this.ctx.ui.input("New agent name", "agent-name");
		if (!name) return;
		const safe = sanitizeName(name);
		const dir = join(getAgentDir(), "agents");
		const filePath = join(dir, `${safe}.md`);
		if (existsSync(filePath)) {
			this.ctx.ui.notify(`Agent already exists: ${filePath}`, "warning");
			return;
		}
		const content = serializeFrontmatter(
			{ name, description: "Custom delegated agent.", tools: undefined, enabled: true },
			"Describe this agent's behavior here.",
		);
		const edited = await this.ctx.ui.editor(`Create agent: ${filePath}`, content);
		if (edited === undefined) return;
		mkdirSync(dir, { recursive: true });
		writeFileSync(filePath, edited, "utf8");
		this.ctx.ui.notify(`Created ${filePath}. Run /reload after editing agent definitions.`, "info");
		this.tui.requestRender();
	}

	private async editDefinition(definition: AgentDefinition): Promise<void> {
		if (!definition.filePath) {
			this.ctx.ui.notify("Built-in agents cannot be edited.", "warning");
			return;
		}
		const current = readFileSync(definition.filePath, "utf8");
		const edited = await this.ctx.ui.editor(`Edit agent: ${definition.filePath}`, current);
		if (edited === undefined) return;
		writeFileSync(definition.filePath, edited, "utf8");
		this.ctx.ui.notify("Agent definition saved. Run /reload to refresh Pi context.", "info");
		this.tui.requestRender();
	}

	private setEnabled(definition: AgentDefinition, enabled: boolean): void {
		if (!definition.filePath) {
			this.ctx.ui.notify("Built-in agents cannot be disabled.", "warning");
			return;
		}
		const content = readFileSync(definition.filePath, "utf8");
		const next = setFrontmatterEnabled(content, enabled);
		writeFileSync(definition.filePath, next, "utf8");
		this.ctx.ui.notify(`${enabled ? "Enabled" : "Disabled"} ${definition.name}. Run /reload to refresh Pi context.`, "info");
		this.tui.requestRender();
	}

	private deleteDefinition(definition: AgentDefinition): void {
		if (!definition.filePath) {
			this.ctx.ui.notify("Built-in agents cannot be deleted.", "warning");
			return;
		}
		unlinkSync(definition.filePath);
		this.ctx.ui.notify(`Deleted ${definition.filePath}. Run /reload to refresh Pi context.`, "info");
		this.tui.requestRender();
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.escape)) {
			if (this.helpOpen) {
				this.helpOpen = false;
				this.tui.requestRender();
				return;
			}
			if (this.peekOpen || this.input) {
				this.peekOpen = false;
				this.input = "";
				this.tui.requestRender();
				return;
			}
			this.done();
			return;
		}
		if (matchesKey(data, Key.ctrl("c"))) {
			if (this.input) {
				this.input = "";
				this.tui.requestRender();
				return;
			}
			this.done();
			return;
		}
		if (data === "?") {
			this.helpOpen = !this.helpOpen;
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, Key.tab)) {
			if (panelSelection.tab === "running" && this.input.trim()) return;
			return this.switchTab(panelSelection.tab === "running" ? "library" : "running");
		}
		if (panelSelection.tab === "library" && (matchesKey(data, Key.left) || data === "h")) return this.switchTab("running");
		if (panelSelection.tab === "running" && this.input) {
			if (matchesKey(data, Key.backspace)) {
				this.input = this.input.slice(0, -1);
				this.tui.requestRender();
				return;
			}
			if (matchesKey(data, Key.enter) || matchesKey(data, Key.return)) {
				const record = this.peekOpen ? this.selectedRecord() : undefined;
				if (record) void this.replyTo(record, this.input.trim());
				else if (!this.inputIsFilter()) void this.dispatchPrompt(false);
				return;
			}
			if (data.length === 1 && data.charCodeAt(0) >= 32) {
				this.input += data;
				this.tui.requestRender();
				return;
			}
		}
		if (panelSelection.tab === "running" && data.length === 1 && data.charCodeAt(0) >= 32 && data !== " " && data !== "?") {
			this.input += data;
			this.tui.requestRender();
			return;
		}
		if (panelSelection.tab === "running" && data === " " && !this.input) {
			this.peekOpen = !this.peekOpen;
			if (this.peekOpen) attachedAgentId = this.selectedRecord()?.id;
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, Key.left) || data === "h") {
			if (panelSelection.tab === "running" && this.peekOpen) {
				this.peekOpen = false;
				this.tui.requestRender();
				return;
			}
			return this.switchTab("running");
		}
		if (matchesKey(data, Key.right) || data === "l") {
			if (panelSelection.tab === "running") return this.openPeek(this.selectedRecord());
			return this.switchTab("library");
		}
		if (matchesKey(data, Key.up) || data === "k") return this.move(-1);
		if (matchesKey(data, Key.down) || data === "j") return this.move(1);
		if (matchesKey(data, Key.enter) || matchesKey(data, Key.return)) {
			const record = this.selectedRecord();
			const definition = this.selectedDefinition();
			if (panelSelection.tab === "running" && record) this.openPeek(record);
			else if (panelSelection.tab === "library" && definition) {
				this.ctx.ui.notify(`${definition.name} (${definition.source})\n${definition.description}`, "info");
			}
			return;
		}
		if (matchesKey(data, Key.ctrl("t")) && panelSelection.tab === "running") {
			const record = this.selectedRecord();
			if (!record) return;
			record.pinned = !record.pinned;
			record.updatedAt = now();
			emitChanged();
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, Key.ctrl("r")) && panelSelection.tab === "running") {
			const record = this.selectedRecord();
			if (record) void this.renameRecord(record);
			return;
		}
		if (matchesKey(data, Key.ctrl("x")) && panelSelection.tab === "running") {
			const record = this.selectedRecord();
			if (!record) return;
			this.stopOrDelete(record);
			return;
		}
		if (data === "c" && panelSelection.tab === "library") {
			void this.createDefinition();
			return;
		}
		if (data === "e" && panelSelection.tab === "library") {
			const definition = this.selectedDefinition();
			if (definition) void this.editDefinition(definition);
			return;
		}
		if (data === " " && panelSelection.tab === "library") {
			const definition = this.selectedDefinition();
			if (definition) this.setEnabled(definition, !definition.enabled);
			return;
		}
		if ((matchesKey(data, Key.delete) || matchesKey(data, Key.backspace)) && panelSelection.tab === "library") {
			const definition = this.selectedDefinition();
			if (definition) this.deleteDefinition(definition);
		}
	}

	private renderHeader(w: number): string[] {
		const active = sortedRecords().filter(isActive);
		const blocked = active.filter((record) => record.state === "blocked").length;
		const working = active.length - blocked;
		const completed = sortedRecords().filter((record) => !isActive(record)).length;
		const cwd = truncateToWidth(this.ctx.cwd, Math.max(12, Math.floor(w / 3)), "…");
		const model = asString((this.ctx.model as any)?.name ?? (this.ctx.model as any)?.id) ?? "model";
		const count = `${blocked} awaiting input · ${working} working · ${completed} completed`;
		const title = `${this.theme.bold("Claude Code")} ${this.theme.fg("dim", `v${packageVersion()}`)}`;
		const logo = agentViewLogo();
		if (w < 72) {
			return [
				truncateToWidth(` ${title}`, w, ""),
				truncateToWidth(` ${this.theme.fg("dim", `${model} · ${cwd}`)}`, w, ""),
				truncateToWidth(` ${this.theme.fg(blocked ? "warning" : "muted", count)}`, w, ""),
			];
		}
		const logoWidth = 12;
		const textLines = [
			title,
			this.theme.fg("dim", `${model} · ${cwd}`),
			this.theme.fg(blocked ? "warning" : "muted", count),
			"",
		];
		return logo.map((logoLine, index) => truncateToWidth(`${rightPadVisible(logoLine, logoWidth)}${textLines[index] ?? ""}`, w, ""));
	}

	private renderAgentRows(w: number): string[] {
		const lines: string[] = [];
		const items = this.records();
		const groups: AgentGroupLabel[] = ["Pinned", "Ready for review", "Needs input", "Working", "Completed"];
		for (const group of groups) {
			const groupItems = items.filter((record) => groupLabelForRecord(record) === group);
			if (!groupItems.length) continue;
			lines.push(truncateToWidth(this.theme.fg("muted", group), w, ""));
			for (const record of groupItems) {
				const selected = items[panelSelection.index]?.id === record.id;
				lines.push(rowForRecord(record, w, selected, this.theme));
			}
			lines.push("");
		}
		if (!items.length) {
			lines.push(this.theme.fg("dim", "  No background subagents yet."));
			lines.push(this.theme.fg("dim", "  Type a task below and press Enter to dispatch one."));
			lines.push("");
		}
		return lines;
	}

	private renderPeek(w: number): string[] {
		if (!this.peekOpen) return [];
		const record = this.selectedRecord();
		if (!record) return [];
		const output = (record.finalOutput || record.error || record.waitingFor || "No output yet.").split(/\r?\n/).slice(0, 8);
		const lines = [
			truncateToWidth(this.theme.fg("borderMuted", "─".repeat(w)), w, ""),
			truncateToWidth(` ${this.theme.bold("Peek")}  ${coloredStateIcon(record, this.theme)} ${record.name} ${this.theme.fg("dim", stateLabel(record.state))}`, w, ""),
			truncateToWidth(` ${this.theme.fg("dim", record.summary)}`, w, ""),
			...output.map((line) => truncateToWidth(`   ${line || " "}`, w, "…")),
			truncateToWidth(` ${this.theme.fg("dim", `transcript: ${record.transcriptPath}`)}`, w, ""),
			"",
		];
		return lines;
	}

	private renderInputLines(w: number): string[] {
		const selected = this.selectedRecord();
		const placeholder = this.peekOpen && selected ? `reply to ${selected.name}` : "describe a task for a new session";
		const value = this.input || this.theme.fg("dim", placeholder);
		const inputLine = fillToWidth(`${this.theme.fg("accent", "›")} ${value}`, w);
		return [
			this.theme.fg("borderMuted", "─".repeat(w)),
			truncateToWidth(inputLine, w, ""),
			this.theme.fg("borderMuted", "─".repeat(w)),
		];
	}

	private renderHelp(w: number): string[] {
		if (!this.helpOpen) return [];
		const hints = [
			"↑/↓ select",
			"Space peek",
			"Enter/→ attach",
			"Tab agents",
			"Ctrl+T pin",
			"Ctrl+R rename",
			"Ctrl+X stop/delete",
			"Esc close",
		];
		return [
			truncateToWidth(this.theme.fg("borderMuted", "─".repeat(w)), w, ""),
			truncateToWidth(` ${this.theme.bold("Shortcuts")}  ${this.theme.fg("dim", hints.join("  "))}`, w, ""),
		];
	}

	private renderLibrary(w: number): string[] {
		const items = this.definitions();
		const lines = [
			...this.renderHeader(w),
			truncateToWidth(` ${this.theme.fg("dim", "Library")}  ${this.theme.fg("accent", `${items.length} agents`)}`, w, ""),
			"",
		];
		for (let index = 0; index < items.length; index++) {
			const definition = items[index]!;
			const prefix = index === panelSelection.index ? "› " : "  ";
			const state = definition.enabled ? "" : " disabled";
			const errors = definition.validationErrors.length ? " invalid" : "";
			const text = `${prefix}${definition.name} (${definition.source}${state}${errors}) ${definition.description}`;
			lines.push(truncateToWidth(index === panelSelection.index ? this.theme.fg("accent", text) : text, w, "…"));
		}
		lines.push("", truncateToWidth(this.theme.fg("dim", " ↑/↓ select  Enter details  c create  e edit  Space enable  Del delete  Tab agents  Esc close"), w, ""));
		return lines;
	}

	render(width: number): string[] {
		const w = Math.max(20, width);
		if (panelSelection.tab === "library") return this.renderLibrary(w);
		panelSelection.index = Math.max(0, Math.min(Math.max(0, this.records().length - 1), panelSelection.index));
		return [
			...this.renderHeader(w),
			"",
			...this.renderAgentRows(w),
			...this.renderPeek(w),
			...this.renderInputLines(w),
			"",
			truncateToWidth(`  ${this.theme.fg("dim", "enter to open · space to reply · ctrl+x to delete · ? for shortcuts")}`, w, ""),
			...this.renderHelp(w),
		];
	}
}

function setFrontmatterEnabled(content: string, enabled: boolean): string {
	if (!content.startsWith("---")) {
		return serializeFrontmatter({ name: basename("agent"), description: "Custom delegated agent.", enabled }, content);
	}
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) return content;
	const block = match[1]!;
	const replacement = block.match(/^enabled\s*:/m)
		? block.replace(/^enabled\s*:.*$/m, `enabled: ${enabled}`)
		: `${block.trimEnd()}\nenabled: ${enabled}`;
	return content.replace(block, replacement);
}

function panelLines(ctx: ExtensionContext, width: number): string[] {
	const items = sortedRecords().slice(0, DEFAULT_RECENT_LIMIT);
	if (!items.length) return [];
	const active = items.filter(isActive).length;
	const blocked = items.filter((record) => record.state === "blocked").length;
	const working = active - blocked;
	const prefix = blocked ? `${blocked} awaiting input · ${working} working` : working ? `${working} working` : "completed agents";
	const lines = [truncateToWidth(prefix, width, "")];
	for (let index = 0; index < items.length; index++) {
		lines.push(rowForRecord(items[index]!, width, index === panelSelection.index && panelSelection.tab === "running", ctx.ui.theme));
	}
	return lines;
}

function updatePanel(ctx: ExtensionContext): void {
	if (!ctx.hasUI) return;
	if (agentViewDepth > 0) {
		ctx.ui.setWidget(PANEL_WIDGET_KEY, undefined, { placement: "belowEditor" });
		ctx.ui.setStatus("subagents", undefined);
		return;
	}
	const width = process.stdout.columns ?? 100;
	const lines = panelLines(ctx, Math.max(20, width));
	ctx.ui.setWidget(PANEL_WIDGET_KEY, lines.length ? lines : undefined, { placement: "belowEditor" });
	const active = sortedRecords().filter(isActive);
	const blocked = active.filter((record) => record.state === "blocked").length;
	const working = active.length - blocked;
	const status = active.length ? `agents: ${blocked ? `${blocked} awaiting input, ` : ""}${working} working` : undefined;
	ctx.ui.setStatus("subagents", status);
}

function installPanelInput(ctx: ExtensionContext): void {
	terminalInputUnsubscribe?.();
	terminalInputUnsubscribe = ctx.ui.onTerminalInput((data) => {
		if (panelSelection.tab !== "running") return undefined;
		const items = sortedRecords().slice(0, DEFAULT_RECENT_LIMIT);
		if (!items.length || ctx.ui.getEditorText().trim()) return undefined;
		if (matchesKey(data, Key.up)) {
			panelSelection.index = Math.max(0, panelSelection.index - 1);
			updatePanel(ctx);
			return { consume: true };
		}
		if (matchesKey(data, Key.down)) {
			panelSelection.index = Math.min(items.length - 1, panelSelection.index + 1);
			updatePanel(ctx);
			return { consume: true };
		}
		if (matchesKey(data, Key.enter) || matchesKey(data, Key.return)) {
			const record = items[panelSelection.index];
			if (record) ctx.ui.notify(resultText(record), record.state === "failed" ? "error" : "info");
			return { consume: true };
		}
		if (data === "x" || matchesKey(data, Key.ctrl("x"))) {
			const record = items[panelSelection.index];
			if (record) {
				if (isActive(record)) void stopRecord(record, "stopped from panel");
				else records.delete(record.id);
			}
			updatePanel(ctx);
			return { consume: true };
		}
		return undefined;
	});
}

function registerBarSegment(pi: ExtensionAPI): void {
	pi.events.emit("pi-bar:register", {
		id: BAR_SEGMENT_ID,
		placement: "right",
		order: 45,
		render: ({ theme }: any) => {
			const active = sortedRecords().filter(isActive);
			if (!active.length) return undefined;
			const blocked = active.filter((record) => record.state === "blocked").length;
			const working = active.length - blocked;
			const text = blocked ? `${blocked} awaiting · ${working} working` : `${working} agents`;
			return theme.fg(blocked ? "warning" : "accent", text);
		},
	});
}

function openAgentView(pi: ExtensionAPI, ctx: ExtensionCommandContext): void {
	agentViewDepth++;
	pi.events.emit(AGENT_VIEW_OPEN_EVENT, { source: "lazypi-agent-view" });
	if (!ctx.hasUI) return;
	ctx.ui.setWidget(PANEL_WIDGET_KEY, undefined, { placement: "belowEditor" });
	ctx.ui.setStatus("subagents", undefined);
}

function closeAgentView(pi: ExtensionAPI, ctx: ExtensionCommandContext): void {
	agentViewDepth = Math.max(0, agentViewDepth - 1);
	pi.events.emit(AGENT_VIEW_CLOSE_EVENT, { source: "lazypi-agent-view" });
	if (currentCtx) updatePanel(currentCtx);
	else if (ctx.hasUI) updatePanel(ctx as ExtensionContext);
}

function commandCompletions(prefix: string) {
	const options = ["reload", "running", "library"];
	const matches = options
		.filter((option) => option.startsWith(prefix.trim().toLowerCase()))
		.map((option) => ({ value: option, label: option }));
	return matches.length ? matches : null;
}

export default function subagentsExtension(pi: ExtensionAPI): void {
	const internalLoad = internalSessionLoadCount > 0;
	if (!internalLoad) {
		currentPi = pi;
		cleanupOldTranscripts();
	}

	pi.registerTool({
		name: "Agent",
		label: "Agent",
		description: "Launch a named local subagent with a fresh context, or fork from the current conversation when requested.",
		promptSnippet: "Agent: delegate a task to a local subagent.",
		parameters: AgentParams,
		executionMode: "parallel",
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const agentName = params.agent?.trim() || "general-purpose";
			const definition = findDefinition(ctx.cwd, agentName);
			if (!definition) {
				const available = loadCatalog(ctx.cwd).definitions.map((item) => `${item.name} (${item.source})`).join(", ") || "none";
				return { content: [{ type: "text", text: `Unknown or invalid agent "${agentName}". Available agents: ${available}` }], isError: true };
			}
			if (definition.validationErrors.length) {
				return { content: [{ type: "text", text: `Agent "${agentName}" is invalid: ${definition.validationErrors.join("; ")}` }], isError: true };
			}

			const parentDepth = currentDepth(ctx);
			const depth = parentDepth + 1;
			if (depth > MAX_NESTING_DEPTH) {
				return { content: [{ type: "text", text: `Nested agents are limited to depth ${MAX_NESTING_DEPTH}.` }], isError: true };
			}

			const id = safeId();
			const oneShot = definition.name === "Explore" || definition.name === "Plan";
			const background = params.background ?? definition.background ?? false;
			const requestedIsolation = normalizeIsolation(params.isolation);
			const runnableDefinition = { ...definition, isolation: requestedIsolation ?? definition.isolation ?? "none" };
			const parentRecord = [...records.values()].find((record) => record.session?.sessionId === ctx.sessionManager.getSessionId());
			const cwd = params.cwd ? resolve(ctx.cwd, params.cwd) : ctx.cwd;
			const record: AgentRecord = {
				id,
				name: definition.name,
				task: params.task,
				summary: shortSummary(params.task),
				state: "starting",
				source: definition.source,
				startedAt: now(),
				updatedAt: now(),
				parentSessionId: ctx.sessionManager.getSessionId(),
				parentAgentId: parentRecord?.id,
				depth,
				resumable: !oneShot,
				background,
				maxTurns: definition.maxTurns,
				transcriptPath: transcriptPath(ctx, id),
				usage: defaultUsage(),
				descendants: 0,
				lastActivity: "queued",
			};
			if (parentRecord) parentRecord.descendants++;

			const run = runRecord(ctx, pi, runnableDefinition, record, { cwd, fork: params.fork === true, signal });
			record.run = run;
			if (background) {
				void run;
				return toolResult(record, `Started ${record.name} in the background.${record.resumable ? `\nagentId: ${record.id}` : ""}\nTranscript: ${record.transcriptPath}`);
			}

			await run;
			return toolResult(record);
		},
		renderCall(args, theme) {
			return renderAgentCall("Agent", [args.agent ?? "general-purpose", shortSummary(args.task ?? ""), args.background ? "background" : "foreground"], theme);
		},
		renderResult(result, _options, theme) {
			return renderAgentResult(result, theme);
		},
	});

	pi.registerTool({
		name: "SendMessage",
		label: "SendMessage",
		description: "Send a steering, follow-up, or resume message to a local subagent by id or name.",
		promptSnippet: "SendMessage: steer or resume a resumable local subagent.",
		parameters: SendMessageParams,
		executionMode: "parallel",
		async execute(_toolCallId, params) {
			const record = findRecord(params);
			if (!record) return { content: [{ type: "text", text: "No matching subagent found." }], isError: true };
			const modeRaw = params.mode?.trim() || "auto";
			if (modeRaw === "stop") {
				await stopRecord(record, "stopped by SendMessage");
				return toolResult(record, `Stopped ${record.name} (${record.id}).`);
			}
			if (modeRaw === "dismiss") {
				records.delete(record.id);
				emitChanged(pi);
				return { content: [{ type: "text", text: `Dismissed ${record.name} (${record.id}).` }] };
			}
			if (!params.message?.trim()) return { content: [{ type: "text", text: "message is required unless mode is stop or dismiss." }], isError: true };
			const mode = (["steer", "followUp", "prompt"].includes(modeRaw) ? modeRaw : record.session?.isStreaming ? "steer" : "prompt") as SendMode;
			const run = continueRecord(record, params.message, mode);
			record.run = run;
			await run;
			return toolResult(record);
		},
		renderCall(args, theme) {
			return renderAgentCall("SendMessage", [args.to ?? args.agentId ?? args.agentName ?? "(missing agent)", shortSummary(args.message ?? args.mode ?? "")], theme);
		},
		renderResult(result, _options, theme) {
			return renderAgentResult(result, theme);
		},
	});

	pi.registerTool({
		name: "get_subagent_result",
		label: "get_subagent_result",
		description: "Retrieve the latest stored output and transcript path for a local subagent.",
		parameters: ResultParams,
		async execute(_toolCallId, params) {
			const record = findRecord(params);
			if (!record) return { content: [{ type: "text", text: "No matching subagent found." }], isError: true };
			return toolResult(record);
		},
		renderCall(args, theme) {
			return renderAgentCall("get_subagent_result", [args.to ?? args.agentId ?? args.agentName ?? "(missing agent)"], theme);
		},
		renderResult(result, _options, theme) {
			return renderAgentResult(result, theme);
		},
	});

	pi.registerCommand("agents", {
		description: "Manage local subagents",
		getArgumentCompletions: commandCompletions,
		handler: async (args, ctx) => {
			const action = args.trim().toLowerCase();
			if (action === "reload") {
				const catalog = loadCatalog(ctx.cwd);
				ctx.ui.notify(`Loaded ${catalog.definitions.length} agent definitions${catalog.diagnostics.length ? `\n${catalog.diagnostics.join("\n")}` : ""}`, catalog.diagnostics.length ? "warning" : "info");
				return;
			}
			if (!ctx.hasUI) {
				const rows = sortedRecords().map((record) => `${record.id} ${record.name} ${record.state}: ${record.summary}`);
				ctx.ui.notify(rows.length ? rows.join("\n") : "No subagents have run in this session.", "info");
				return;
			}
			if (action === "library") panelSelection = { tab: "library", index: 0 };
			else panelSelection = { tab: "running", index: 0 };
			openAgentView(pi, ctx);
			try {
				await ctx.ui.custom<void>((tui, theme, _keybindings, done) => new AgentsPanel(tui, theme, ctx, () => done()));
			} finally {
				closeAgentView(pi, ctx);
			}
		},
	});

	pi.on("session_start", (_event, ctx) => {
		if (internalLoad) return;
		currentCtx = ctx;
		registerBarSegment(pi);
		if (ctx.hasUI) {
			installPanelInput(ctx);
			updatePanel(ctx);
		}
	});

	pi.on("session_shutdown", () => {
		if (internalLoad) return;
		terminalInputUnsubscribe?.();
		terminalInputUnsubscribe = undefined;
		agentViewDepth = 0;
		activeAgentViewTui = undefined;
		currentCtx = undefined;
		for (const record of records.values()) {
			if (isActive(record)) void stopRecord(record, "session shutdown");
			record.unsubscribe?.();
		}
	});

	if (!internalLoad) {
		pi.events.on("pi-bar:request-sync", () => registerBarSegment(pi));
		pi.events.on(SUBAGENTS_CHANGED_EVENT, () => {
			if (currentCtx) updatePanel(currentCtx);
		});
	}
}
