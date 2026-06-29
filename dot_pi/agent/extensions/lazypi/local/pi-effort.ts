import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { Key, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

type PiThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

type ExtensionTheme = {
	fg(color: string, text: string): string;
	bold(text: string): string;
};

type EffortOption = {
	level: PiThinkingLevel;
	label: string;
};

type PiBarSegment = {
	id: string;
	placement?: "left" | "center" | "right";
	order?: number;
	render: (context: { theme: ExtensionTheme }) => string | undefined | null;
};

const ALL_LEVELS: PiThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];
const MODAL_LEVELS: PiThinkingLevel[] = ["low", "medium", "high", "xhigh"];
const COMMAND_USAGE = "Usage: /effort [off|minimal|low|medium|high|xhigh|max]";
const EFFORT_SEGMENT_ID = "pi-effort:effort";
const EFFORT_SELECTOR_OPEN_EVENT = "pi-effort:selector-open";
const EFFORT_SELECTOR_CLOSE_EVENT = "pi-effort:selector-close";
const EFFORT_SYMBOLS: Partial<Record<PiThinkingLevel, string>> = {
	low: "○",
	medium: "◐",
	high: "●",
	xhigh: "◉",
};

function fitLine(line: string, width: number): string {
	return truncateToWidth(line, Math.max(0, width), "", true);
}

function padRight(line: string, width: number): string {
	const clipped = fitLine(line, width);
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function center(line: string, width: number): string {
	const clipped = fitLine(line, width);
	const remaining = Math.max(0, width - visibleWidth(clipped));
	const left = Math.floor(remaining / 2);
	return " ".repeat(left) + clipped + " ".repeat(remaining - left);
}

function formatEffortIndicator(theme: ExtensionTheme, level: PiThinkingLevel): string {
	const active = level !== "off";
	const symbol = EFFORT_SYMBOLS[level] ?? "○";
	const dot = theme.fg(active ? "muted" : "dim", symbol);
	const label = theme.fg(active ? "muted" : "dim", level);
	return `${dot} ${label}${theme.fg("dim", " · /effort")}`;
}

function getSupportedLevels(ctx: any): PiThinkingLevel[] {
	if (!ctx.model) return ["off", "minimal", "low", "medium", "high"];
	return getSupportedThinkingLevels(ctx.model).filter((level): level is PiThinkingLevel =>
		ALL_LEVELS.includes(level as PiThinkingLevel),
	);
}

function getSelectorOptions(ctx: any): EffortOption[] {
	const supported = getSupportedLevels(ctx);
	const modalLevels = MODAL_LEVELS.filter((level) => supported.includes(level));
	const levels = modalLevels.length > 0 ? modalLevels : supported;
	return levels.map((level) => ({ level, label: level }));
}

function coerceRequestedLevel(arg: string): PiThinkingLevel | undefined {
	const normalized = arg.trim().toLowerCase();
	if (!normalized) return undefined;
	if (normalized === "none") return "off";
	if (normalized === "min") return "minimal";
	if (normalized === "max") return "xhigh";
	return ALL_LEVELS.includes(normalized as PiThinkingLevel) ? (normalized as PiThinkingLevel) : undefined;
}

function placeSegments(width: number, segments: Array<{ col: number; text: string }>): string {
	let out = "";
	let cursor = 0;
	for (const segment of [...segments].sort((a, b) => a.col - b.col)) {
		const segmentWidth = visibleWidth(segment.text);
		const col = Math.max(0, Math.min(segment.col, Math.max(0, width - segmentWidth)));
		if (col < cursor) continue;
		out += " ".repeat(col - cursor) + segment.text;
		cursor = col + segmentWidth;
	}
	return fitLine(out, width);
}

type LabelLayout = {
	start: number;
	center: number;
	width: number;
};

function planLabelLayout(trackWidth: number, labelWidths: number[]): LabelLayout[] {
	const count = labelWidths.length;
	if (count === 0) return [];

	const available = Math.max(1, trackWidth);
	const widths = labelWidths.map((width) => Math.max(1, width));
	const totalLabelWidth = widths.reduce((sum, width) => sum + width, 0);
	const gap = totalLabelWidth + (count - 1) * 2 <= available ? 2 : totalLabelWidth + (count - 1) <= available ? 1 : 0;

	if (count === 1) {
		const width = widths[0]!;
		const start = Math.max(0, Math.floor((available - width) / 2));
		return [{ start, center: start + Math.floor(width / 2), width }];
	}

	const firstCenter = Math.floor(widths[0]! / 2);
	const lastCenter = Math.max(firstCenter, available - Math.ceil(widths[count - 1]! / 2));
	const starts = widths.map((width, index) => {
		const center = Math.round(firstCenter + ((lastCenter - firstCenter) * index) / Math.max(1, count - 1));
		return center - Math.floor(width / 2);
	});

	let cursor = 0;
	for (let i = 0; i < count; i++) {
		starts[i] = Math.max(starts[i]!, i === 0 ? 0 : cursor + gap);
		cursor = starts[i]! + widths[i]!;
	}

	if (cursor > available) {
		starts[count - 1] = Math.min(starts[count - 1]!, Math.max(0, available - widths[count - 1]!));
		for (let i = count - 2; i >= 0; i--) {
			starts[i] = Math.min(starts[i]!, starts[i + 1]! - gap - widths[i]!);
		}

		const shiftRight = Math.max(0, -starts[0]!);
		if (shiftRight > 0) {
			for (let i = 0; i < count; i++) starts[i] = starts[i]! + shiftRight;
		}

		cursor = 0;
		for (let i = 0; i < count; i++) {
			starts[i] = Math.max(starts[i]!, i === 0 ? 0 : cursor + gap);
			cursor = starts[i]! + widths[i]!;
		}
	}

	return starts.map((start, index) => {
		const width = widths[index]!;
		const safeStart = Math.max(0, Math.min(start, Math.max(0, available - width)));
		return { start: safeStart, center: safeStart + Math.floor(width / 2), width };
	});
}

class EffortSelector implements Component {
	constructor(
		private readonly tui: TUI,
		private readonly theme: ExtensionTheme,
		private readonly options: EffortOption[],
		private selectedIndex: number,
		private readonly done: (level: PiThinkingLevel | null) => void,
	) {}

	invalidate(): void {}

	handleInput(data: string): void {
		if (matchesKey(data, Key.left) || data === "h") {
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, Key.right) || data === "l") {
			this.selectedIndex = Math.min(this.options.length - 1, this.selectedIndex + 1);
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, Key.enter) || matchesKey(data, Key.return)) {
			this.done(this.options[this.selectedIndex]?.level ?? null);
			return;
		}
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
			this.done(null);
		}
	}

	render(width: number): string[] {
		const w = Math.max(1, width);
		const line = (content = "") => padRight(fitLine(content, w), w);
		if (w < 20) return [line(this.theme.fg("accent", this.theme.bold("Effort")))];

		const lines: string[] = [
			line(this.theme.fg("accent", "─".repeat(w))),
			line(`  ${this.theme.fg("text", this.theme.bold("Effort"))}`),
			line(),
		];

		if (this.options.length <= 1) {
			lines.push(
				line(center(this.theme.fg("muted", "Only one effort level is available"), w)),
				line(),
				line(`  ${this.theme.fg("dim", "←/→ to adjust • Enter to confirm • Esc to cancel")}`),
			);
			return lines;
		}

		const labelWidths = this.options.map((option) => visibleWidth(option.label));
		const totalLabelWidth = labelWidths.reduce((sum, width) => sum + width, 0);
		const minimumTrackWidth = Math.max(24, totalLabelWidth + Math.max(0, this.options.length - 1) + 2);
		const targetTrackWidth = Math.max(56, this.options.length * 18, minimumTrackWidth);
		const trackWidth = Math.max(1, Math.min(Math.max(1, w - 4), targetTrackWidth));
		const start = Math.max(0, Math.floor((w - trackWidth) / 2));
		// Plan label positions first, then draw the marker at those same centers.
		// A fixed label slot caused short/narrow layouts to skip labels entirely,
		// leaving the selected arrow visually detached from the reasoning text.
		const labelLayout = planLabelLayout(trackWidth, labelWidths);
		const positions = labelLayout.map((layout) => Math.max(0, Math.min(trackWidth - 1, layout.center)));
		const markerPos = positions[this.selectedIndex] ?? Math.floor(trackWidth / 2);

		lines.push(
			line(
				placeSegments(w, [
					{ col: start, text: this.theme.fg("text", "Faster") },
					{ col: start + trackWidth - visibleWidth("Smarter"), text: this.theme.fg("text", "Smarter") },
				]),
			),
		);

		const before = this.theme.fg("borderMuted", "─".repeat(markerPos));
		const marker = this.theme.fg("text", "▲");
		const after = this.theme.fg("borderMuted", "─".repeat(Math.max(0, trackWidth - markerPos - 1)));
		lines.push(line(placeSegments(w, [{ col: start, text: before + marker + after }])));

		lines.push(
			line(
				placeSegments(
					w,
					this.options.map((option, i) => {
						const active = i === this.selectedIndex;
						const text = active
							? this.theme.fg("accent", this.theme.bold(option.label))
							: this.theme.fg("muted", option.label);
						const layout = labelLayout[i]!;
						return {
							col: start + layout.start,
							text,
						};
					}),
				),
			),
		);

		lines.push(
			line(),
			line(`  ${this.theme.fg("dim", "←/→ to adjust • Enter to confirm • Esc to cancel")}`),
		);

		return lines;
	}
}

export default function effortBarExtension(pi: ExtensionAPI) {
	let currentCtx: any;

	function requestBarRender(): void {
		pi.events.emit("pi-bar:refresh", { source: "pi-effort" });
	}

	function registerEffortSegment(): void {
		if (!currentCtx) return;

		const segment: PiBarSegment = {
			id: EFFORT_SEGMENT_ID,
			placement: "right",
			order: 50,
			render: ({ theme }) => formatEffortIndicator(theme, pi.getThinkingLevel() as PiThinkingLevel),
		};

		pi.events.emit("pi-bar:register", segment);
		requestBarRender();
	}

	function applyEffort(level: PiThinkingLevel, ctx: any, sourceLabel = level): void {
		pi.setThinkingLevel(level as any);
		const effective = pi.getThinkingLevel() as PiThinkingLevel;
		requestBarRender();

		if (effective !== level) {
			ctx.ui.notify(`Effort ${sourceLabel} is not supported by this model; using ${effective}.`, "warning");
		}
	}

	async function showEffortSelector(ctx: any): Promise<void> {
		if (ctx.mode !== "tui") {
			ctx.ui.notify(COMMAND_USAGE, "info");
			return;
		}

		const options = getSelectorOptions(ctx);
		if (options.length === 0) {
			ctx.ui.notify("No effort levels are available for the current model", "warning");
			return;
		}

		const current = pi.getThinkingLevel() as PiThinkingLevel;
		let selectedIndex = options.findIndex((option) => option.level === current);
		if (selectedIndex === -1) {
			selectedIndex = Math.max(
				0,
				options.findIndex((option) => option.level === "medium") !== -1
					? options.findIndex((option) => option.level === "medium")
					: options.findIndex((option) => option.level === "high"),
			);
		}

		pi.events.emit(EFFORT_SELECTOR_OPEN_EVENT, { source: "pi-effort" });
		let selected: PiThinkingLevel | null | undefined;
		try {
			selected = await ctx.ui.custom<PiThinkingLevel | null>(
				(tui: TUI, theme: ExtensionTheme, _kb: unknown, done: (value: PiThinkingLevel | null) => void) => {
					return new EffortSelector(tui, theme, options, selectedIndex, done);
				},
			);
		} finally {
			pi.events.emit(EFFORT_SELECTOR_CLOSE_EVENT, { source: "pi-effort" });
		}

		if (selected) applyEffort(selected, ctx);
	}

	pi.events.on("pi-bar:request-sync", registerEffortSegment);

	pi.registerCommand("effort", {
		description: "Set thinking effort",
		getArgumentCompletions: (prefix: string) => {
			const values = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
			const matches = values
				.filter((value) => value.startsWith(prefix.trim().toLowerCase()))
				.map((value) => ({ value, label: value }));
			return matches.length > 0 ? matches : null;
		},
		handler: async (args, ctx) => {
			const raw = args.trim();
			if (!raw) {
				await showEffortSelector(ctx);
				return;
			}

			const level = coerceRequestedLevel(raw);
			if (!level) {
				ctx.ui.notify(COMMAND_USAGE, "error");
				return;
			}

			applyEffort(level, ctx, raw.toLowerCase() === "max" ? "max" : level);
		},
	});

	pi.on("session_start", (_event, ctx) => {
		currentCtx = ctx;
		registerEffortSegment();
	});

	pi.on("thinking_level_select", () => requestBarRender());
	pi.on("model_select", () => requestBarRender());
	pi.on("session_shutdown", () => {
		currentCtx = undefined;
		pi.events.emit("pi-bar:unregister", { id: EFFORT_SEGMENT_ID });
	});
}
