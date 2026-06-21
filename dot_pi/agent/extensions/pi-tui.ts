import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, Text, truncateToWidth } from "@earendil-works/pi-tui";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

type TuiRenderer = "default" | "fullscreen";
type TuiHandle = { requestRender(force?: boolean): void };
type InputListenerResult = { consume?: boolean; data?: string } | undefined | void;
type PatchableTui = TuiHandle & {
	render(width: number): string[];
	addInputListener?: (listener: (data: string) => InputListenerResult) => () => void;
	terminal?: { rows?: number; write?: (data: string) => void };
};
type ScrollPatch = {
	reset(): void;
	restore(): void;
	updateAlternateScroll(enabled: boolean): void;
};

const SETTINGS_KEY = "tui";
const VALID_RENDERERS: readonly TuiRenderer[] = ["default", "fullscreen"];
const ALT_SCREEN_ENTER = "\x1b[?1049h\x1b[H\x1b[2J";
const ALT_SCREEN_LEAVE = "\x1b[?1049l";
// Do not enable DEC alternate-scroll mode: many terminals translate mouse-wheel
// movement into the same escape sequences as real Up/Down arrow keys, which
// prevents multiline prompt cursor movement. Use real SGR mouse reporting for
// wheel input instead, keeping keyboard arrows distinct from mouse scrolls.
const ALT_SCROLL_DISABLE = "\x1b[?1007l";
const MOUSE_REPORT_ENABLE = "\x1b[?1000h\x1b[?1006h";
const MOUSE_REPORT_DISABLE = "\x1b[?1000l\x1b[?1006l\x1b[?1015l";
const CURSOR_MARKER = "\x1b_pi:c\x07";
const WHEEL_SCROLL_LINES = 1;
const WHEEL_SCROLL_COALESCE_MS = 30;
const PAGE_UP_SEQUENCES = ["\x1b[5~", "\x1b[[5~"];
const PAGE_DOWN_SEQUENCES = ["\x1b[6~", "\x1b[[6~"];
const EFFORT_SELECTOR_OPEN_EVENT = "pi-effort:selector-open";
const EFFORT_SELECTOR_CLOSE_EVENT = "pi-effort:selector-close";

function settingsPath(): string {
	return join(getAgentDir(), "settings.json");
}

function readSettings(): Record<string, unknown> {
	try {
		return JSON.parse(readFileSync(settingsPath(), "utf8")) as Record<string, unknown>;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
		throw error;
	}
}

function getConfiguredRenderer(): TuiRenderer {
	const value = readSettings()[SETTINGS_KEY];
	return value === "fullscreen" ? "fullscreen" : "default";
}

function writeSettings(update: (settings: Record<string, unknown>) => void): void {
	const path = settingsPath();
	const settings = readSettings();
	update(settings);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

function writeConfiguredRenderer(renderer: TuiRenderer): void {
	writeSettings((settings) => {
		settings[SETTINGS_KEY] = renderer;
	});
}

function parseRenderer(raw: string): TuiRenderer | undefined {
	const value = raw.trim().toLowerCase();
	return VALID_RENDERERS.includes(value as TuiRenderer) ? (value as TuiRenderer) : undefined;
}

function alternateScreenDisabled(): boolean {
	const value = process.env.PI_TUI_DISABLE_ALTERNATE_SCREEN;
	return value === "1" || value?.toLowerCase() === "true";
}

function terminalHeight(tui: PatchableTui): number {
	return Math.max(1, tui.terminal?.rows ?? process.stdout.rows ?? Number(process.env.LINES) ?? 24);
}

function forceRender(tui: TuiHandle | undefined): void {
	try {
		tui?.requestRender(true);
	} catch {
		try {
			tui?.requestRender();
		} catch {
			// best effort only
		}
	}
}

type ParsedMouseEvent = {
	next: number;
	direction?: "up" | "down";
};

type ParsedScrollBatch = {
	delta: number;
};

function wheelDirectionFromButton(button: number): "up" | "down" | undefined {
	if ((button & 64) !== 64) return undefined;
	const wheelButton = button & 3;
	if (wheelButton === 0) return "up";
	if (wheelButton === 1) return "down";
	return undefined;
}

function parseMouseEventAt(data: string, index: number): ParsedMouseEvent | undefined {
	const sgr = data.slice(index).match(/^\x1b\[<(\d+);\d+;\d+[Mm]/);
	if (sgr) {
		return {
			next: index + sgr[0].length,
			direction: wheelDirectionFromButton(Number(sgr[1])),
		};
	}

	const urxvt = data.slice(index).match(/^\x1b\[(\d+);\d+;\d+M/);
	if (urxvt) {
		return {
			next: index + urxvt[0].length,
			direction: wheelDirectionFromButton(Number(urxvt[1])),
		};
	}

	// X10 mouse fallback: ESC [ M Cb Cx Cy, where Cb - 32 is the button code.
	if (data.startsWith("\x1b[M", index) && data.length >= index + 6) {
		return {
			next: index + 6,
			direction: wheelDirectionFromButton(data.charCodeAt(index + 3) - 32),
		};
	}

	return undefined;
}

function isMouseEvent(data: string): boolean {
	const event = parseMouseEventAt(data, 0);
	return Boolean(event && event.next === data.length);
}

function matchSequenceAt(data: string, index: number, sequences: readonly string[]): number | undefined {
	const sequence = sequences.find((value) => data.startsWith(value, index));
	return sequence ? index + sequence.length : undefined;
}

function isTerminalControlSequence(data: string): boolean {
	return data.includes("\x1b") || data.includes("\x9b");
}

function isPromptCursorKey(data: string): boolean {
	return matchesKey(data, "up") || matchesKey(data, "down");
}

function parseScrollInputBatch(data: string, pageScrollLines: number): ParsedScrollBatch | undefined {
	let index = 0;
	let wheelDelta = 0;
	let pageDelta = 0;
	let consumed = false;

	while (index < data.length) {
		const mouseEvent = parseMouseEventAt(data, index);
		if (mouseEvent) {
			consumed = true;
			if (mouseEvent.direction === "up") wheelDelta += WHEEL_SCROLL_LINES;
			if (mouseEvent.direction === "down") wheelDelta -= WHEEL_SCROLL_LINES;
			index = mouseEvent.next;
			continue;
		}

		let next = matchSequenceAt(data, index, PAGE_UP_SEQUENCES);
		if (next !== undefined) {
			consumed = true;
			pageDelta += pageScrollLines;
			index = next;
			continue;
		}

		next = matchSequenceAt(data, index, PAGE_DOWN_SEQUENCES);
		if (next !== undefined) {
			consumed = true;
			pageDelta -= pageScrollLines;
			index = next;
			continue;
		}

		return undefined;
	}

	if (!consumed) return undefined;

	// Keep batched input from becoming a jump. Some terminals coalesce a single
	// wheel notch into many mouse events; consume the whole batch, but apply only
	// one line (or one page for PageUp/PageDown).
	const normalizedWheelDelta = wheelDelta === 0 ? 0 : Math.sign(wheelDelta) * WHEEL_SCROLL_LINES;
	const normalizedPageDelta = pageDelta === 0 ? 0 : Math.sign(pageDelta) * pageScrollLines;
	return { delta: normalizedWheelDelta + normalizedPageDelta };
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

function isSlashPrompt(promptLines: string[]): boolean {
	return promptLines.some((line) => {
		if (isEditorRuleLine(line)) return false;
		const clean = stripAnsiControls(line)
			.trim()
			.replace(/^[❯›>]\s*/, "");
		return clean.startsWith("/");
	});
}

function isPromptBarStatusLine(line: string): boolean {
	const clean = stripAnsiControls(line).trim().toLowerCase();
	return (
		clean.includes("/effort") ||
		clean.includes("shift+tab to cycle") ||
		clean.includes("auto mode on") ||
		clean.includes("accept edits on") ||
		clean.includes("plan mode on") ||
		clean.includes("esc to interrupt")
	);
}

function isPromptBarEffortLine(line: string): boolean {
	return stripAnsiControls(line).trim().toLowerCase().includes("/effort");
}

function trimTrailingBlankLines(lines: string[]): string[] {
	let end = lines.length;
	while (end > 0 && stripAnsiControls(lines[end - 1] ?? "").trim().length === 0) end--;
	return lines.slice(0, end);
}

function findPromptBlock(lines: string[]): { start: number; end: number } {
	const cursorLine = lines.findIndex((line) => line.includes(CURSOR_MARKER));
	if (cursorLine >= 0) {
		let start = cursorLine;
		for (let i = cursorLine; i >= 0; i--) {
			if (isEditorRuleLine(lines[i] ?? "")) {
				start = i;
				break;
			}
		}

		let end = Math.min(lines.length, cursorLine + 1);
		for (let i = cursorLine + 1; i < Math.min(lines.length, cursorLine + 20); i++) {
			if (isEditorRuleLine(lines[i] ?? "")) {
				end = i + 1;
				break;
			}
		}

		return { start, end: Math.max(end, start + 1) };
	}

	// Fallback for moments when the editor is not focused: pin only the last
	// editor-like rule pair near the bottom, not footer/status/widgets after it.
	let bottomRule = -1;
	for (let i = lines.length - 1; i >= Math.max(0, lines.length - 20); i--) {
		if (isEditorRuleLine(lines[i] ?? "")) {
			bottomRule = i;
			break;
		}
	}
	if (bottomRule >= 0) {
		for (let i = bottomRule - 1; i >= Math.max(0, bottomRule - 20); i--) {
			if (isEditorRuleLine(lines[i] ?? "")) return { start: i, end: bottomRule + 1 };
		}
		return { start: Math.max(0, bottomRule - 1), end: bottomRule + 1 };
	}

	return { start: lines.length, end: lines.length };
}

function formatUsage(current: TuiRenderer): string {
	return `Current renderer: ${current}. Usage: /tui <default|fullscreen>`;
}

function formatSetMessage(renderer: TuiRenderer, applied: boolean): string {
	if (renderer === "fullscreen") {
		const suffix = applied
			? "Entered alternate-screen rendering for this session. Mouse wheel and PageUp/PageDown scroll the transcript; Up/Down stay in the prompt editor."
			: "Saved preference; alternate screen is disabled by PI_TUI_DISABLE_ALTERNATE_SCREEN.";
		return `Renderer set to fullscreen. ${suffix}`;
	}
	return applied ? "Renderer set to default. Returned to normal scrollback rendering." : "Renderer set to default.";
}

export default function piTuiExtension(pi: ExtensionAPI) {
	let activeTui: PatchableTui | undefined;
	let activeRenderer: TuiRenderer = getConfiguredRenderer();
	let inAlternateScreen = false;
	let scrollPatch: ScrollPatch | undefined;
	let effortSelectorDepth = 0;

	function fullscreenScrollActive(): boolean {
		return activeRenderer === "fullscreen" && inAlternateScreen;
	}

	function requestRender() {
		forceRender(activeTui);
	}

	function setAlternateScroll(enabled: boolean) {
		scrollPatch?.updateAlternateScroll(enabled && fullscreenScrollActive());
	}

	function createScrollPatch(tui: PatchableTui): ScrollPatch {
		const originalRender = tui.render.bind(tui);
		let scrollOffset = 0;
		let lastScrollableLineCount = 0;
		let lastFixedLineCount = 0;
		let mouseReportingEnabled = false;
		let alternateScrollDisableSent = false;
		let lastLineScrollAt = 0;
		let lastLineScrollDirection = 0;

		function disableAlternateScroll(force = false) {
			if (!force && alternateScrollDisableSent) return;
			tui.terminal?.write?.(ALT_SCROLL_DISABLE);
			alternateScrollDisableSent = true;
		}

		function enableMouseReporting() {
			if (mouseReportingEnabled) return;
			disableAlternateScroll();
			tui.terminal?.write?.(MOUSE_REPORT_ENABLE);
			mouseReportingEnabled = true;
		}

		function disableMouseReporting() {
			if (!mouseReportingEnabled) return;
			tui.terminal?.write?.(MOUSE_REPORT_DISABLE);
			mouseReportingEnabled = false;
		}

		function updateScrollInput(enabled: boolean) {
			disableAlternateScroll();
			if (enabled) enableMouseReporting();
			else disableMouseReporting();
		}

		function scrollWindowHeight(): number {
			return Math.max(1, terminalHeight(tui) - lastFixedLineCount);
		}

		function maxOffset(scrollableLineCount = lastScrollableLineCount): number {
			return Math.max(0, scrollableLineCount - scrollWindowHeight());
		}

		function clampOffset(scrollableLineCount = lastScrollableLineCount) {
			scrollOffset = Math.max(0, Math.min(scrollOffset, maxOffset(scrollableLineCount)));
		}

		function scrollBy(delta: number) {
			scrollOffset += delta;
			clampOffset();
			requestRender();
		}

		function scrollLine(direction: number) {
			const normalized = Math.sign(direction);
			if (normalized === 0) return;

			const now = Date.now();
			if (normalized === lastLineScrollDirection && now - lastLineScrollAt < WHEEL_SCROLL_COALESCE_MS) return;

			lastLineScrollAt = now;
			lastLineScrollDirection = normalized;
			scrollBy(normalized * WHEEL_SCROLL_LINES);
		}

		tui.render = (width: number): string[] => {
			const lines = originalRender(width);

			if (!fullscreenScrollActive()) {
				scrollOffset = 0;
				lastScrollableLineCount = lines.length;
				lastFixedLineCount = 0;
				updateScrollInput(false);
				return lines;
			}

			// Leave Up/Down arrow keys available to the prompt editor. Transcript
			// scrolling is handled by PageUp/PageDown and real mouse wheel reports.
			updateScrollInput(true);

			const height = terminalHeight(tui);
			const promptBlock = findPromptBlock(lines);
			const rawPromptLines = lines.slice(promptBlock.start, promptBlock.end);
			if (rawPromptLines.length === 0) {
				lastScrollableLineCount = lines.length;
				lastFixedLineCount = 0;
				return lines;
			}

			// Pi renders custom footer/status after the editor, but visually it belongs
			// to the prompt bar. Pin those bar lines with the editor, and render them
			// above the input box. Keep all transcript/header/resource output scrollable.
			const rawPostPromptCandidates = lines.slice(promptBlock.end);
			const rawPostPromptLines =
				effortSelectorDepth > 0
					? rawPostPromptCandidates
					: rawPostPromptCandidates.filter((line) => stripAnsiControls(line).trim().length > 0);
			const slashAutocompleteVisible =
				isSlashPrompt(rawPromptLines) && rawPostPromptLines.some((line) => !isPromptBarStatusLine(line));
			const postPromptBarLines = slashAutocompleteVisible
				? rawPostPromptLines.filter((line) => !isPromptBarStatusLine(line))
				: rawPostPromptLines;
			const abovePromptBarLines = slashAutocompleteVisible
				? postPromptBarLines
				: postPromptBarLines.filter(isPromptBarEffortLine);
			const belowPromptBarLines = slashAutocompleteVisible
				? []
				: postPromptBarLines.filter((line) => !isPromptBarEffortLine(line));
			const promptLines = rawPromptLines.slice(-Math.max(1, height - 1));
			const maxFixedLines = Math.max(1, height - 1);
			const promptBottomGap = belowPromptBarLines.length === 0 && abovePromptBarLines.length + promptLines.length < maxFixedLines ? [""] : [];
			const fixedLines = [...abovePromptBarLines, ...promptLines, ...belowPromptBarLines, ...promptBottomGap].slice(-maxFixedLines);
			const fixedCount = fixedLines.length;
			const scrollHeight = Math.max(1, height - fixedCount);
			const scrollableLines = trimTrailingBlankLines(lines.slice(0, promptBlock.start));
			lastScrollableLineCount = scrollableLines.length;
			lastFixedLineCount = fixedCount;

			clampOffset(scrollableLines.length);

			// Always return exactly one terminal-height viewport in fullscreen mode:
			// all non-prompt UI scrolls normally above, and only the prompt/editor bar
			// is pinned at the bottom.
			const bottom = Math.max(0, scrollableLines.length - scrollOffset);
			const top = Math.max(0, bottom - scrollHeight);
			const visible = scrollableLines.slice(top, bottom);
			while (visible.length < scrollHeight) visible.push("");

			if (scrollOffset > 0 && visible.length > 0) {
				const indicator = `\x1b[2m↑ scrolled ${scrollOffset}/${maxOffset(scrollableLines.length)} lines from bottom · wheel/PageDown to return\x1b[22m`;
				visible[0] = truncateToWidth(indicator, Math.max(1, width), "");
			}

			return [...visible, ...fixedLines];
		};

		const removeInputListener = tui.addInputListener?.((data: string) => {
			if (!fullscreenScrollActive()) return undefined;

			const pageScrollLines = Math.max(1, terminalHeight(tui) - 3);
			const scrollBatch = parseScrollInputBatch(data, pageScrollLines);
			if (scrollBatch) {
				// Fast wheel gestures can arrive as several SGR/X10 mouse events in one
				// input chunk. Treat the whole chunk as scrollback; otherwise it falls
				// through as "normal input" and snaps the viewport back to the bottom.
				if (Math.abs(scrollBatch.delta) === WHEEL_SCROLL_LINES) scrollLine(scrollBatch.delta);
				else if (scrollBatch.delta !== 0) scrollBy(scrollBatch.delta);
				return { consume: true };
			}

			if (isMouseEvent(data)) {
				// If mouse tracking is explicitly re-enabled later, consume clicks/drags so
				// their escape sequences do not leak into the prompt editor. Do not use
				// mouse noise as a signal to leave scrollback.
				return { consume: true };
			}

			if (matchesKey(data, "pageUp")) {
				scrollBy(pageScrollLines);
				return { consume: true };
			}
			if (matchesKey(data, "pageDown")) {
				scrollBy(-pageScrollLines);
				return { consume: true };
			}

			if (scrollOffset > 0 && isPromptCursorKey(data)) {
				// Cursor movement should always belong to the prompt editor. Leaving
				// scrollback first keeps the visible editor and cursor in sync.
				scrollOffset = 0;
				requestRender();
				return undefined;
			}

			if (scrollOffset > 0 && isTerminalControlSequence(data) && !matchesKey(data, "escape")) {
				// Unknown escape/control chunks are usually terminal bookkeeping or an
				// unhandled mouse variant. Ignore them instead of treating them as typing,
				// which would jump hundreds of lines to bottom.
				return { consume: true };
			}

			// Any normal input exits scrollback view so typing/commands operate at the live bottom.
			if (scrollOffset > 0) {
				scrollOffset = 0;
				requestRender();
			}
			return undefined;
		});

		return {
			reset() {
				scrollOffset = 0;
				requestRender();
			},
			restore() {
				disableMouseReporting();
				disableAlternateScroll(true);
				removeInputListener?.();
				tui.render = originalRender;
			},
			updateAlternateScroll(enabled: boolean) {
				updateScrollInput(enabled);
			},
		};
	}

	function ensureScrollPatch(tui: PatchableTui) {
		if (scrollPatch) return;
		scrollPatch = createScrollPatch(tui);
	}

	function enterAlternateScreen() {
		if (alternateScreenDisabled() || inAlternateScreen) return false;
		process.stdout.write(ALT_SCREEN_ENTER);
		inAlternateScreen = true;
		setAlternateScroll(true);
		requestRender();
		return true;
	}

	function leaveAlternateScreen() {
		if (!inAlternateScreen) return false;
		setAlternateScroll(false);
		scrollPatch?.reset();
		process.stdout.write(ALT_SCREEN_LEAVE);
		inAlternateScreen = false;
		requestRender();
		return true;
	}

	function applyRenderer(renderer: TuiRenderer): boolean {
		activeRenderer = renderer;
		if (renderer === "fullscreen") return enterAlternateScreen();
		return leaveAlternateScreen();
	}

	function captureTui(ctx: ExtensionContext) {
		ctx.ui.setWidget(
			"pi-tui-capture",
			(tui) => {
				activeTui = tui as PatchableTui;
				ensureScrollPatch(activeTui);
				setAlternateScroll(true);
				return {
					render: () => [],
					invalidate: () => {},
				};
			},
			{ placement: "belowEditor" },
		);
	}

	function emitOutput(content: string, ctx?: ExtensionContext) {
		if (ctx && !ctx.hasUI) {
			console.log(content);
			return;
		}
		pi.sendMessage({ customType: "tui", content, display: true });
		requestRender();
	}

	pi.registerMessageRenderer("tui", (message, _options, theme) => {
		const text = typeof message.content === "string" ? message.content : "";
		return new Text(theme.fg("dim", truncateToWidth(text, 2000)), 1, 0);
	});

	pi.events.on(EFFORT_SELECTOR_OPEN_EVENT, () => {
		effortSelectorDepth++;
		requestRender();
	});
	pi.events.on(EFFORT_SELECTOR_CLOSE_EVENT, () => {
		effortSelectorDepth = Math.max(0, effortSelectorDepth - 1);
		requestRender();
	});

	pi.on("session_start", async (_event, ctx) => {
		activeRenderer = getConfiguredRenderer();
		if (ctx.mode !== "tui") return;
		captureTui(ctx);
		applyRenderer(activeRenderer);
	});

	pi.on("session_shutdown", () => {
		effortSelectorDepth = 0;
		leaveAlternateScreen();
		scrollPatch?.restore();
		scrollPatch = undefined;
		activeTui = undefined;
	});

	pi.registerCommand("tui", {
		description: "Select renderer: default or fullscreen",
		getArgumentCompletions: (prefix: string) => {
			const normalized = prefix.trim().toLowerCase();
			return VALID_RENDERERS
				.filter((value) => value.startsWith(normalized))
				.map((value) => ({
					value,
					label: value,
					description: value === "fullscreen" ? "Use alternate-screen rendering with internal scrollback" : "Use normal scrollback rendering",
				}));
		},
		handler: async (args, ctx) => {
			const raw = args.trim();
			if (!raw) {
				emitOutput(formatUsage(getConfiguredRenderer()), ctx);
				return;
			}

			const renderer = parseRenderer(raw);
			if (!renderer) {
				emitOutput(`Invalid renderer: ${raw}. Usage: /tui <default|fullscreen>`, ctx);
				return;
			}

			writeConfiguredRenderer(renderer);
			const applied = ctx.mode === "tui" ? applyRenderer(renderer) : false;
			emitOutput(formatSetMessage(renderer, applied || renderer === "default"), ctx);
		},
	});
}
