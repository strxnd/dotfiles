import { CustomEditor, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth, type AutocompleteProvider, type EditorComponent } from "@earendil-works/pi-tui";

type PiBarPlacement = "left" | "center" | "right";
type PiBarTheme = ExtensionContext["ui"]["theme"];

type PiBarRenderContext = {
	ctx: ExtensionContext;
	theme: PiBarTheme;
	footerData: any;
	width: number;
};

type PiBarRendered = string | string[] | null | undefined;

type PiBarSegment = {
	id: string;
	placement?: PiBarPlacement;
	order?: number;
	render?: (context: PiBarRenderContext) => PiBarRendered;
	text?: PiBarRendered;
};

const REGISTER_EVENT = "pi-bar:register";
const UNREGISTER_EVENT = "pi-bar:unregister";
const REQUEST_SYNC_EVENT = "pi-bar:request-sync";
const REFRESH_EVENT = "pi-bar:refresh";
const PERMISSION_PROMPT_OPEN_EVENT = "pi-permissions:prompt-open";
const PERMISSION_PROMPT_CLOSE_EVENT = "pi-permissions:prompt-close";
const EFFORT_SELECTOR_OPEN_EVENT = "pi-effort:selector-open";
const EFFORT_SELECTOR_CLOSE_EVENT = "pi-effort:selector-close";
const SEPARATOR = " │ ";
const PROMPT_MARKER = "❯ ";
const PROMPT_MARKER_WIDTH = visibleWidth(PROMPT_MARKER);
const CTRL_C_EXIT_PROMPT = "Press Ctrl+C again to exit";
const CTRL_C_EXIT_WINDOW_MS = 500;
const CATPPUCCIN_SKY_FG = "\x1b[38;2;137;220;235m";
const ANSI_FG_RESET = "\x1b[39m";

function fitLine(line: string, width: number): string {
	return truncateToWidth(line, Math.max(0, width), "");
}

function stripControlWhitespace(text: string): string {
	return text.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();
}

function hasAnsi(text: string): boolean {
	return /\x1b[\[\]\(\)#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/.test(text);
}

function stripAnsiControls(text: string): string {
	return text
		.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
		.replace(/\x1b_pi:c\x07/g, "")
		.replace(/\x1b[\[\]\(\)#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "");
}

function isEditorRuleLine(line: string): boolean {
	const clean = stripAnsiControls(line).trim();
	return clean.startsWith("─") && clean.includes("─");
}

function dimIfPlain(theme: PiBarTheme, text: string): string {
	return hasAnsi(text) ? text : theme.fg("dim", text);
}

function normalizeRendered(value: PiBarRendered): string | undefined {
	if (value === null || value === undefined) return undefined;
	const text = Array.isArray(value) ? value.join(" ") : value;
	const clean = stripControlWhitespace(String(text));
	return clean || undefined;
}

function getSegmentId(segment: unknown): string | undefined {
	if (!segment || typeof segment !== "object") return undefined;
	const id = (segment as { id?: unknown }).id;
	return typeof id === "string" && id.trim() ? id.trim() : undefined;
}

function coercePlacement(value: unknown): PiBarPlacement {
	return value === "center" || value === "right" || value === "left" ? value : "left";
}

function coerceOrder(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 100;
}

function renderSegment(segment: PiBarSegment, context: PiBarRenderContext): string | undefined {
	try {
		return normalizeRendered(segment.render ? segment.render(context) : segment.text);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return context.theme.fg("error", `${segment.id}: ${message}`);
	}
}

function sortSegments(a: PiBarSegment, b: PiBarSegment): number {
	const order = coerceOrder(a.order) - coerceOrder(b.order);
	return order === 0 ? a.id.localeCompare(b.id) : order;
}

function joinParts(parts: string[], theme: PiBarTheme, separator = "  "): string {
	return parts.filter(Boolean).join(theme.fg("dim", separator));
}

function joinLeftRight(left: string, right: string, width: number): string {
	if (!left && !right) return "";
	if (!right) return fitLine(left, width);
	if (!left) {
		const rightWidth = visibleWidth(right);
		if (rightWidth >= width) return fitLine(right, width);
		return fitLine(" ".repeat(width - rightWidth) + right, width);
	}

	const rightWidth = visibleWidth(right);
	if (rightWidth >= width) return fitLine(right, width);

	const availableLeft = Math.max(0, width - rightWidth - 1);
	const clippedLeft = truncateToWidth(left, availableLeft, "…");
	const padding = " ".repeat(Math.max(1, width - visibleWidth(clippedLeft) - rightWidth));
	return fitLine(clippedLeft + padding + right, width);
}

function layoutLine(left: string, center: string, right: string, width: number, theme: PiBarTheme): string {
	const leftAndCenter = joinParts([left, center], theme, SEPARATOR);
	return joinLeftRight(leftAndCenter, right, width);
}

function getPermissionMode(statuses: ReadonlyMap<string, string> | undefined): string {
	const raw = statuses?.get("permissions") ?? "";
	const match = raw.match(/permissions:\s*(.+)$/i);
	return (match?.[1] ?? "default").trim().toLowerCase();
}

function renderPermissionMode(theme: PiBarTheme, mode: string): string | undefined {
	if (mode === "auto") return theme.fg("warning", "⏵⏵ auto mode on");
	if (mode === "accept edits" || mode === "accept-edits") return theme.fg("accent", "⏵⏵ accept edits on");
	if (mode === "plan") return `${CATPPUCCIN_SKY_FG}⏸ plan mode on${ANSI_FG_RESET}`;
	return undefined;
}

function isAgentBusy(ctx: ExtensionContext): boolean {
	try {
		return typeof ctx.isIdle === "function" ? !ctx.isIdle() : false;
	} catch {
		return false;
	}
}

function renderPrimaryStatus(context: PiBarRenderContext, statuses: ReadonlyMap<string, string> | undefined): string {
	const { ctx, theme } = context;
	const mode = getPermissionMode(statuses);
	const modeText = renderPermissionMode(theme, mode);
	const interruptText = isAgentBusy(ctx) ? theme.fg("dim", "esc to interrupt") : "";
	if (!modeText) return interruptText;
	const cycleHint = theme.fg("dim", "(shift+tab to cycle)");
	const interruptHint = interruptText ? `${theme.fg("dim", " · ")}${interruptText}` : "";
	return `${modeText} ${cycleHint}${interruptHint}`;
}

type CtrlCExitPromptController = {
	isActive(): boolean;
	show(): void;
	clear(): void;
};

class PiBarPromptEditor implements EditorComponent {
	constructor(
		private readonly base: EditorComponent,
		private readonly theme: PiBarTheme,
		private readonly ctrlCExitPrompt: CtrlCExitPromptController,
	) {}

	get actionHandlers(): Map<string, () => void> | undefined {
		return (this.base as EditorComponent & { actionHandlers?: Map<string, () => void> }).actionHandlers;
	}

	get onEscape(): (() => void) | undefined {
		return (this.base as EditorComponent & { onEscape?: () => void }).onEscape;
	}

	set onEscape(handler: (() => void) | undefined) {
		(this.base as EditorComponent & { onEscape?: () => void }).onEscape = handler;
	}

	get onCtrlD(): (() => void) | undefined {
		return (this.base as EditorComponent & { onCtrlD?: () => void }).onCtrlD;
	}

	set onCtrlD(handler: (() => void) | undefined) {
		(this.base as EditorComponent & { onCtrlD?: () => void }).onCtrlD = handler;
	}

	get onPasteImage(): (() => void) | undefined {
		return (this.base as EditorComponent & { onPasteImage?: () => void }).onPasteImage;
	}

	set onPasteImage(handler: (() => void) | undefined) {
		(this.base as EditorComponent & { onPasteImage?: () => void }).onPasteImage = handler;
	}

	get onExtensionShortcut(): ((data: string) => boolean | undefined) | undefined {
		return (this.base as EditorComponent & { onExtensionShortcut?: (data: string) => boolean | undefined }).onExtensionShortcut;
	}

	set onExtensionShortcut(handler: ((data: string) => boolean | undefined) | undefined) {
		(this.base as EditorComponent & { onExtensionShortcut?: (data: string) => boolean | undefined }).onExtensionShortcut = handler;
	}

	onAction(action: string, handler: () => void): void {
		(this.base as EditorComponent & { onAction?: (action: string, handler: () => void) => void }).onAction?.(action, handler);
	}

	get wantsKeyRelease(): boolean | undefined {
		return this.base.wantsKeyRelease;
	}

	get focused(): boolean {
		return "focused" in this.base && typeof this.base.focused === "boolean" ? this.base.focused : false;
	}

	set focused(value: boolean) {
		if ("focused" in this.base) {
			(this.base as EditorComponent & { focused?: boolean }).focused = value;
		}
	}

	get onSubmit(): ((text: string) => void) | undefined {
		return this.base.onSubmit;
	}

	set onSubmit(handler: ((text: string) => void) | undefined) {
		this.base.onSubmit = handler;
	}

	get onChange(): ((text: string) => void) | undefined {
		return this.base.onChange;
	}

	set onChange(handler: ((text: string) => void) | undefined) {
		this.base.onChange = handler;
	}

	get borderColor(): ((str: string) => string) | undefined {
		return this.base.borderColor;
	}

	set borderColor(color: ((str: string) => string) | undefined) {
		this.base.borderColor = color;
	}

	render(width: number): string[] {
		const w = Math.max(1, width);
		const originalBorderColor = this.base.borderColor;
		const promptBorderColor = (text: string) => this.theme.fg("dim", text);
		this.base.borderColor = promptBorderColor;
		const renderBase = (renderWidth: number) => {
			try {
				return this.base.render(renderWidth);
			} finally {
				this.base.borderColor = originalBorderColor;
			}
		};

		if (w <= PROMPT_MARKER_WIDTH) return renderBase(w).map((line) => fitLine(line, w));

		const baseWidth = Math.max(1, w - PROMPT_MARKER_WIDTH);
		const lines = renderBase(baseWidth);
		const spacer = " ".repeat(PROMPT_MARKER_WIDTH);
		const ruleFill = promptBorderColor("─".repeat(PROMPT_MARKER_WIDTH));
		let promptLineRendered = false;

		return lines.map((line) => {
			if (isEditorRuleLine(line)) return fitLine(`${line}${ruleFill}`, w);

			const prefix = promptLineRendered ? spacer : PROMPT_MARKER;
			promptLineRendered = true;
			return fitLine(`${prefix}${line}`, w);
		});
	}

	handleInput(data: string): void {
		if (matchesKey(data, "ctrl+c")) {
			const clearHandler = this.actionHandlers?.get("app.clear");
			if (this.ctrlCExitPrompt.isActive()) {
				this.ctrlCExitPrompt.clear();
				if (clearHandler) clearHandler();
				else this.base.handleInput(data);
				return;
			}

			if (clearHandler) clearHandler();
			else this.base.setText("");
			this.ctrlCExitPrompt.show();
			return;
		}

		this.base.handleInput(data);
	}

	invalidate(): void {
		this.base.invalidate();
	}

	getText(): string {
		return this.base.getText();
	}

	setText(text: string): void {
		this.base.setText(text);
	}

	addToHistory(text: string): void {
		this.base.addToHistory?.(text);
	}

	insertTextAtCursor(text: string): void {
		this.base.insertTextAtCursor?.(text);
	}

	getExpandedText(): string {
		return this.base.getExpandedText?.() ?? this.base.getText();
	}

	setAutocompleteProvider(provider: AutocompleteProvider): void {
		this.base.setAutocompleteProvider?.(provider);
	}

	setPaddingX(padding: number): void {
		this.base.setPaddingX?.(padding);
	}

	setAutocompleteMaxVisible(maxVisible: number): void {
		this.base.setAutocompleteMaxVisible?.(maxVisible);
	}
}

export default function piBarExtension(pi: ExtensionAPI) {
	const segments = new Map<string, PiBarSegment>();
	let activeTui: { requestRender(): void } | undefined;
	let lastLegacyStatuses: Array<{ id: string; text: string }> = [];
	let promptEditorInstallTimer: ReturnType<typeof setTimeout> | undefined;
	let ctrlCExitPromptUntil = 0;
	let ctrlCExitPromptTimer: ReturnType<typeof setTimeout> | undefined;
	let permissionPromptDepth = 0;
	let effortSelectorDepth = 0;
	let sessionToken = 0;

	function requestRender() {
		activeTui?.requestRender();
	}

	function isCtrlCExitPromptActive() {
		return Date.now() < ctrlCExitPromptUntil;
	}

	function clearCtrlCExitPrompt() {
		ctrlCExitPromptUntil = 0;
		if (ctrlCExitPromptTimer) {
			clearTimeout(ctrlCExitPromptTimer);
			ctrlCExitPromptTimer = undefined;
		}
		requestRender();
	}

	function showCtrlCExitPrompt() {
		ctrlCExitPromptUntil = Date.now() + CTRL_C_EXIT_WINDOW_MS;
		if (ctrlCExitPromptTimer) clearTimeout(ctrlCExitPromptTimer);
		ctrlCExitPromptTimer = setTimeout(() => {
			ctrlCExitPromptTimer = undefined;
			if (Date.now() >= ctrlCExitPromptUntil) {
				ctrlCExitPromptUntil = 0;
				requestRender();
			}
		}, CTRL_C_EXIT_WINDOW_MS);
		requestRender();
	}

	function registerSegment(segment: unknown) {
		const id = getSegmentId(segment);
		if (!id || !segment || typeof segment !== "object") return;
		segments.set(id, { ...(segment as PiBarSegment), id });
		requestRender();
	}

	function unregisterSegment(payload: unknown) {
		const id =
			typeof payload === "string"
				? payload
				: payload && typeof payload === "object" && typeof (payload as { id?: unknown }).id === "string"
					? (payload as { id: string }).id
					: undefined;
		if (!id) return;
		segments.delete(id);
		requestRender();
	}

	function emitSyncRequest() {
		pi.events.emit(REQUEST_SYNC_EVENT, { source: "pi-bar" });
	}

	function installPromptEditor(ctx: ExtensionContext) {
		const previousEditorFactory = ctx.ui.getEditorComponent();
		ctx.ui.setEditorComponent((tui, editorTheme, keybindings) => {
			const base = previousEditorFactory?.(tui, editorTheme, keybindings) ?? new CustomEditor(tui, editorTheme, keybindings);
			return base instanceof PiBarPromptEditor
				? base
				: new PiBarPromptEditor(base, ctx.ui.theme, {
						isActive: isCtrlCExitPromptActive,
						show: showCtrlCExitPrompt,
						clear: clearCtrlCExitPrompt,
					});
		});
	}

	pi.events.on(REGISTER_EVENT, registerSegment);
	pi.events.on(UNREGISTER_EVENT, unregisterSegment);
	pi.events.on(REFRESH_EVENT, requestRender);
	pi.events.on(PERMISSION_PROMPT_OPEN_EVENT, () => {
		permissionPromptDepth++;
		requestRender();
	});
	pi.events.on(PERMISSION_PROMPT_CLOSE_EVENT, () => {
		permissionPromptDepth = Math.max(0, permissionPromptDepth - 1);
		requestRender();
	});
	pi.events.on(EFFORT_SELECTOR_OPEN_EVENT, () => {
		effortSelectorDepth++;
		requestRender();
	});
	pi.events.on(EFFORT_SELECTOR_CLOSE_EVENT, () => {
		effortSelectorDepth = Math.max(0, effortSelectorDepth - 1);
		requestRender();
	});

	pi.on("agent_start", requestRender);
	pi.on("message_update", requestRender);
	pi.on("agent_end", requestRender);
	pi.on("turn_end", requestRender);

	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode !== "tui") return;

		const token = ++sessionToken;
		if (promptEditorInstallTimer) clearTimeout(promptEditorInstallTimer);
		promptEditorInstallTimer = setTimeout(() => {
			promptEditorInstallTimer = undefined;
			if (token !== sessionToken) return;
			installPromptEditor(ctx);
			requestRender();
		}, 0);

		ctx.ui.setFooter((tui, theme, footerData) => {
			activeTui = tui;
			const unsubscribe = footerData.onBranchChange?.(() => tui.requestRender());

			return {
				dispose() {
					unsubscribe?.();
				},
				invalidate() {},
				render(width: number): string[] {
					const w = Math.max(1, width);
					const footerOffset = w > PROMPT_MARKER_WIDTH ? " ".repeat(PROMPT_MARKER_WIDTH) : "";
					const footerWidth = Math.max(1, w - visibleWidth(footerOffset));
					if (permissionPromptDepth > 0 || effortSelectorDepth > 0) return [];
					const renderContext: PiBarRenderContext = { ctx, theme, footerData, width: footerWidth };
					const placements: Record<PiBarPlacement, string[]> = { left: [], center: [], right: [] };

					const effortSegments: string[] = [];
					for (const segment of [...segments.values()].sort(sortSegments)) {
						const rendered = renderSegment(segment, renderContext);
						if (!rendered) continue;
						if (segment.id === "pi-effort:effort" || stripAnsiControls(rendered).includes("/effort")) {
							effortSegments.push(rendered);
							continue;
						}
						placements[coercePlacement(segment.placement)].push(rendered);
					}

					const statuses = footerData.getExtensionStatuses?.() as ReadonlyMap<string, string> | undefined;
					const legacyStatuses: Array<{ id: string; text: string }> = [];
					for (const [id, value] of statuses ?? []) {
						if (id === "permissions" || !value || segments.has(id) || segments.has(`legacy:${id}`)) continue;
						const text = normalizeRendered(value);
						if (!text) continue;
						legacyStatuses.push({ id, text });
						placements.left.push(dimIfPlain(theme, text));
					}
					lastLegacyStatuses = legacyStatuses;

					const primary = renderPrimaryStatus(renderContext, statuses);
					const left = joinParts([primary, ...placements.left], theme);
					const center = joinParts(placements.center, theme);
					const right = joinParts(placements.right, theme);
					const statusLine = layoutLine(left, center, right, footerWidth, theme);
					const effortLine = effortSegments.length ? joinLeftRight("", joinParts(effortSegments, theme), footerWidth) : "";
					const hasEffortLine = stripAnsiControls(effortLine).trim().length > 0;
					let footerLines = [effortLine, statusLine].filter((line) => stripAnsiControls(line).trim().length > 0);

					if (isCtrlCExitPromptActive()) {
						const promptLine = theme.fg("dim", CTRL_C_EXIT_PROMPT);
						// Only replace the bottom/status bar. Keep the top effort row intact.
						footerLines = hasEffortLine ? [effortLine, promptLine] : [promptLine];
					}

					return footerLines.map((line) => fitLine(`${footerOffset}${fitLine(line, footerWidth)}`, w));
				},
			};
		});

		emitSyncRequest();
		requestRender();
	});

	pi.on("session_shutdown", () => {
		sessionToken++;
		if (promptEditorInstallTimer) {
			clearTimeout(promptEditorInstallTimer);
			promptEditorInstallTimer = undefined;
		}
		activeTui = undefined;
		lastLegacyStatuses = [];
		clearCtrlCExitPrompt();
		permissionPromptDepth = 0;
		effortSelectorDepth = 0;
		segments.clear();
	});

	pi.registerCommand("pi-bar", {
		description: "Show pi-bar registered and legacy status segments",
		handler: async (_args, ctx) => {
			const registered = [...segments.keys()].sort();
			const lines = ["pi-bar segments"];

			if (registered.length) {
				lines.push("", "Registered:", ...registered.map((id) => `- ${id}`));
			} else {
				lines.push("", "Registered:", "- none");
			}

			if (lastLegacyStatuses.length) {
				lines.push("", "Legacy status:", ...lastLegacyStatuses.map(({ id, text }) => `- ${id}: ${text}`));
			} else {
				lines.push("", "Legacy status:", "- none seen yet");
			}

			ctx.ui.notify(lines.join("\n"), "info");
			emitSyncRequest();
			requestRender();
		},
	});
}
