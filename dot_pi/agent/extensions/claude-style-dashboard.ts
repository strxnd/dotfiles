import { VERSION, getPackageDir, type ExtensionAPI, type ExtensionContext, type Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const MIN_BOX_WIDTH = 36;
const CHANGELOG_NOTE_LIMIT = 7;

type ModelLike = {
	id?: string;
	name?: string;
	provider?: string;
	contextWindow?: number;
};

type ChangelogEntry = {
	version: string;
	date?: string;
	lines: string[];
};

type ChangelogPreview = {
	versionLabel: string;
	notes: string[];
};

let cachedChangelogPreview: ChangelogPreview | undefined;

function fit(text: string, width: number, ellipsis = "…"): string {
	return truncateToWidth(text, Math.max(0, width), ellipsis);
}

function padRight(text: string, width: number): string {
	const clipped = fit(text, width);
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function center(text: string, width: number): string {
	const clipped = fit(text, width, "");
	const remaining = Math.max(0, width - visibleWidth(clipped));
	const left = Math.floor(remaining / 2);
	return " ".repeat(left) + clipped + " ".repeat(remaining - left);
}

const WELCOME_MESSAGE = "Welcome back!";

function formatCount(value: number): string {
	return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function modelLabel(ctx: ExtensionContext): string {
	const model = ctx.model as ModelLike | undefined;
	if (!model) return "No model selected";

	const provider = model.provider ? `${model.provider}/` : "";
	const name = model.name || model.id || "unknown";
	const context = typeof model.contextWindow === "number" ? ` (${formatCount(model.contextWindow)} context)` : "";
	return `${provider}${name}${context}`;
}

function trimTrailingSeparators(path: string): string {
	const trimmed = path.replace(/[\\/]+$/, "");
	return trimmed || path;
}

function substitutePathPrefix(path: string, prefix: string | undefined, replacement: string): string {
	if (!prefix) return path;
	const normalizedPrefix = trimTrailingSeparators(prefix);
	if (!normalizedPrefix) return path;
	if (path === normalizedPrefix) return replacement;
	if (path.startsWith(normalizedPrefix)) {
		const next = path[normalizedPrefix.length];
		if (next === "/" || next === "\\") {
			return `${replacement}${path.slice(normalizedPrefix.length)}`;
		}
	}
	return path;
}

function cwdLabel(ctx: ExtensionContext): string {
	let path = trimTrailingSeparators(ctx.cwd || ".");

	for (const home of [process.env.HOME, process.env.USERPROFILE, homedir()].filter(Boolean) as string[]) {
		path = substitutePathPrefix(path, home, "~");
		if (path.startsWith("~")) return path;
	}

	// macOS often resolves /tmp and /var through /private; Claude Code-style paths
	// display the shell-friendly location instead.
	path = substitutePathPrefix(path, "/private/tmp", "/tmp");
	path = substitutePathPrefix(path, "/private/var", "/var");
	return path;
}

function parseLatestChangelogEntry(markdown: string): ChangelogEntry | undefined {
	const lines = markdown.split(/\r?\n/);
	const start = lines.findIndex((line) => /^##\s+\[?\d+\.\d+\.\d+\]?/.test(line));
	if (start === -1) return undefined;

	const header = lines[start];
	const match = header.match(/^##\s+\[?(\d+\.\d+\.\d+)\]?(?:\s+-\s*(.+))?/);
	if (!match) return undefined;

	let end = lines.length;
	for (let i = start + 1; i < lines.length; i++) {
		if (/^##\s+/.test(lines[i])) {
			end = i;
			break;
		}
	}

	return {
		version: match[1],
		date: match[2]?.trim(),
		lines: lines.slice(start + 1, end),
	};
}

function extractBullets(lines: string[]): string[] {
	const bullets: string[] = [];
	let current: string | undefined;

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line) continue;
		if (/^#{2,}\s+/.test(line)) continue;

		if (/^[-*]\s+/.test(line)) {
			if (current) bullets.push(current);
			current = line;
		} else if (current) {
			current += ` ${line}`;
		}
	}

	if (current) bullets.push(current);
	return bullets;
}

function sectionLines(entry: ChangelogEntry, sectionName: string): string[] {
	const lines: string[] = [];
	let inSection = false;

	for (const line of entry.lines) {
		const heading = line.match(/^###\s+(.+)\s*$/);
		if (heading) {
			inSection = heading[1].trim().toLowerCase() === sectionName.toLowerCase();
			continue;
		}
		if (inSection) lines.push(line);
	}

	return lines;
}

function cleanChangelogBullet(bullet: string): string {
	return bullet
		.replace(/^[-*]\s+/, "")
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/\*\*([^*]+)\*\*/g, "$1")
		.replace(/__([^_]+)__/g, "$1")
		.replace(/\s+See\s+.+$/i, "")
		.replace(/\s+by\s+@\S+\.?$/i, "")
		.replace(/\s+\(#[^)]+\)\.?$/g, "")
		.replace(/\s+-\s+/, " — ")
		.replace(/\s+/g, " ")
		.trim();
}

function extractChangelogNotes(entry: ChangelogEntry): string[] {
	const notes = ["New Features", "Added", "Changed", "Fixed"].flatMap((section) =>
		extractBullets(sectionLines(entry, section)).map(cleanChangelogBullet).filter(Boolean)
	);

	return (notes.length > 0 ? notes : extractBullets(entry.lines).map(cleanChangelogBullet).filter(Boolean)).slice(0, CHANGELOG_NOTE_LIMIT);
}

function loadChangelogPreview(): ChangelogPreview {
	try {
		const changelog = readFileSync(join(getPackageDir(), "CHANGELOG.md"), "utf8");
		const entry = parseLatestChangelogEntry(changelog);
		if (entry) {
			const versionLabel = entry.date ? `v${entry.version} — ${entry.date}` : `v${entry.version}`;
			const notes = extractChangelogNotes(entry);
			return {
				versionLabel,
				notes: notes.length > 0 ? notes : [`See /changelog for ${versionLabel}`],
			};
		}
	} catch {
		// Keep header rendering quiet if the bundled changelog cannot be read.
	}

	return {
		versionLabel: `v${VERSION}`,
		notes: ["No changelog entries found."],
	};
}

function changelogPreview(): ChangelogPreview {
	cachedChangelogPreview ??= loadChangelogPreview();
	return cachedChangelogPreview;
}

function getPiLogo(theme: Theme): string[] {
	// Compact pi logo. Keep the four entries as visual lines.
	const mark = (text: string) => theme.fg("text", text);
	return [
		mark("██████  "),
		mark("██  ██  "),
		mark("████  ██"),
		mark("██    ██"),
	];
}

function topBorder(width: number, title: string, theme: Theme): string {
	if (width < 2) return theme.fg("accent", "─".repeat(width));
	const fillWidth = width - 2;
	const label = fit(` ${title} `, Math.max(0, fillWidth - 2), "");
	const leftFill = "─";
	const rightFill = "─".repeat(Math.max(0, fillWidth - visibleWidth(leftFill) - visibleWidth(label)));
	return theme.fg("accent", `╭${leftFill}`) + theme.fg("accent", label) + theme.fg("accent", `${rightFill}╮`);
}

function bottomBorder(width: number, theme: Theme): string {
	if (width < 2) return theme.fg("accent", "─".repeat(width));
	return theme.fg("accent", `╰${"─".repeat(Math.max(0, width - 2))}╯`);
}

function framedLine(content: string, width: number, theme: Theme): string {
	if (width < 2) return fit(content, width, "");
	const inner = width - 2;
	return theme.fg("accent", "│") + padRight(content, inner) + theme.fg("accent", "│");
}

function renderVertical(lines: string[], innerWidth: number): string[] {
	const pad = " ";
	const contentWidth = Math.max(1, innerWidth - 2);
	return lines.map((line) => `${pad}${center(line, contentWidth)}${pad}`);
}

function renderColumns(left: string[], right: string[], innerWidth: number, theme: Theme): string[] {
	const outerPad = 2;
	const gap = 2;
	const dividerWidth = 1;
	const available = Math.max(1, innerWidth - outerPad * 2 - gap * 2 - dividerWidth);
	const leftWidth = Math.max(26, Math.floor(available * 0.43));
	const rightWidth = Math.max(20, available - leftWidth);
	const rows = Math.max(left.length, right.length);
	const lines: string[] = [];

	for (let i = 0; i < rows; i++) {
		const line =
			" ".repeat(outerPad) +
			center(left[i] ?? "", leftWidth) +
			" ".repeat(gap) +
			theme.fg("accent", "│") +
			" ".repeat(gap) +
			padRight(right[i] ?? "", rightWidth) +
			" ".repeat(outerPad);
		lines.push(padRight(line, innerWidth));
	}

	return lines;
}

function buildDashboard(ctx: ExtensionContext, theme: Theme, width: number): string[] {
	if (width < MIN_BOX_WIDTH) {
		return [
			fit(theme.fg("accent", `Pi v${VERSION}`), width),
			fit(WELCOME_MESSAGE, width),
			fit(modelLabel(ctx), width),
			fit(cwdLabel(ctx), width),
			"",
		];
	}

	const boxWidth = Math.max(MIN_BOX_WIDTH, width);
	const innerWidth = boxWidth - 2;
	const leftColumn = [
		"",
		theme.fg("text", theme.bold(WELCOME_MESSAGE)),
		"",
		...getPiLogo(theme),
		"",
		theme.fg("muted", modelLabel(ctx)),
		theme.fg("dim", cwdLabel(ctx)),
		"",
	];

	const label = (text: string) => theme.fg("accent", theme.bold(text));
	const note = (text: string) => theme.fg("text", text);
	const buildRightColumn = () => {
		const changelog = changelogPreview();
		return [
			"",
			label("What's new"),
			...changelog.notes.map(note),
			theme.fg("dim", theme.italic("/changelog for more")),
			"",
			"",
		];
	};

	const contentLines = width >= 92 ? renderColumns(leftColumn, buildRightColumn(), innerWidth, theme) : renderVertical(leftColumn, innerWidth);
	return [
		topBorder(boxWidth, `Pi v${VERSION}`, theme),
		...contentLines.map((line) => framedLine(line, boxWidth, theme)),
		bottomBorder(boxWidth, theme),
		"",
	];
}

function installDashboardHeader(ctx: ExtensionContext): void {
	ctx.ui.setHeader((_tui, theme) => ({
		render(width: number): string[] {
			return buildDashboard(ctx, theme, Math.max(1, width));
		},
		invalidate() {},
	}));
}

export default function claudeStyleDashboard(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		installDashboardHeader(ctx);
	});
}
