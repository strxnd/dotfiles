import { UserMessageComponent, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Container, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const USER_MESSAGE_MARKER = "❯";
const PATCH_VERSION = `direct-v3-${USER_MESSAGE_MARKER}`;
const PATCHED = Symbol.for("pi-user-message:claude-strip-patched");
const CLAUDE_STYLE_TOOLS_USER_PATCHED = Symbol.for("pi-claude-style-tools:patched-user-message-render");
const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";

// Catppuccin-black palette values already used by the local theme.
const BG = "\x1b[48;2;49;50;68m"; // #313244 / roleChromeMuted
const MARKER = "\x1b[38;2;108;112;134m"; // #6c7086 / overlay0
const TEXT = "\x1b[38;2;205;214;244m"; // #cdd6f4 / roleAssistant
const RESET_FG = "\x1b[39m";
const RESET_BG = "\x1b[49m";

function stripAnsiControls(text: string): string {
	return text
		.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
		.replace(/\x1b_pi:c\x07/g, "")
		.replace(/\x1b[\[\]\(\)#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "");
}

function stripOuterUserBoxStyling(line: string): string {
	return line
		.replace(/\x1b\]133;[ABC]\x07/g, "")
		.replace(/\x1b\[48;2;\d+;\d+;\d+m/g, "")
		.replace(/\x1b\[4[0-9]m/g, "")
		.replace(/\x1b\[10[0-7]m/g, "")
		.replace(/\x1b\[49m/g, "")
		.trim();
}

function fullWidthBar(content: string, width: number): string {
	const w = Math.max(1, width);
	const clipped = truncateToWidth(content, w, "");
	const padding = " ".repeat(Math.max(0, w - visibleWidth(clipped)));
	return `${BG}${clipped}${padding}${RESET_BG}`;
}

function renderBaseUserContent(instance: UserMessageComponent, width: number): string[] {
	// Bypass UserMessageComponent.prototype.render entirely. That method is what
	// pi-claude-style-tools patches into a rounded user box; Container.render
	// still renders the component's real children (Box -> Markdown) so we can
	// extract just the message text and draw our own Claude-style strip.
	try {
		return Container.prototype.render.call(instance, Math.max(1, width)) as string[];
	} catch {
		return [];
	}
}

function installPatch(): void {
	const proto = UserMessageComponent.prototype as UserMessageComponent & {
		[PATCHED]?: string;
		[CLAUDE_STYLE_TOOLS_USER_PATCHED]?: boolean;
		render(width: number): string[];
	};
	if (proto[PATCHED] === PATCH_VERSION && (proto.render as any)[PATCHED] === PATCH_VERSION) return;

	const renderClaudeLikeUserMessage = function renderClaudeLikeUserMessage(this: UserMessageComponent, width: number): string[] {
		const rawLines = renderBaseUserContent(this, width);
		const contentLines = rawLines
			.map(stripOuterUserBoxStyling)
			.filter((line) => stripAnsiControls(line).trim().length > 0);

		if (contentLines.length === 0) return rawLines;

		const rendered = contentLines.map((line, index) => {
			const prefix = index === 0 ? `${MARKER}${USER_MESSAGE_MARKER}${RESET_FG} ` : "  ";
			return fullWidthBar(`${prefix}${TEXT}${line}${RESET_FG}`, width);
		});

		rendered[0] = OSC133_ZONE_START + rendered[0];
		rendered[rendered.length - 1] = OSC133_ZONE_END + OSC133_ZONE_FINAL + rendered[rendered.length - 1];
		return rendered;
	};
	(renderClaudeLikeUserMessage as any)[PATCHED] = PATCH_VERSION;
	proto.render = renderClaudeLikeUserMessage;

	// If pi-claude-style-tools loads after this extension, make its user-message
	// patch no-op. If it loaded before, our direct render replacement above wins.
	proto[CLAUDE_STYLE_TOOLS_USER_PATCHED] = true;
	proto[PATCHED] = PATCH_VERSION;
}

export default function claudeLikeUserMessageExtension(pi: ExtensionAPI) {
	installPatch();
	// Re-apply on session_start and the next tick so this override wins even if
	// another extension re-patches UserMessageComponent during startup/reload.
	pi.on("session_start", async () => {
		installPatch();
		setTimeout(installPatch, 0);
	});
}
