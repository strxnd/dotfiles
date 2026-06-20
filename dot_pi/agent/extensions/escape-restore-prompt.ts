import { InteractiveMode, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

type AnyInteractiveMode = InteractiveMode & Record<PropertyKey, any>;

type ActivePrompt = {
	text: string;
	previousLeafId: string | null;
	messageCount: number;
	chatStartIndex: number;
	restoredToEditor: boolean;
	hasAgentOutput: boolean;
};

type RestoreState = {
	active?: ActivePrompt;
	restoreRequested: boolean;
};

type Originals = {
	handleEvent: (event: any) => Promise<void>;
	restoreQueuedMessagesToEditor: (options?: { abort?: boolean; currentText?: string }) => number;
};

const PATCH_VERSION = "v2";
const PATCHED = Symbol.for("pi-escape-restore-prompt:patched");
const ORIGINALS = Symbol.for("pi-escape-restore-prompt:originals");
const CUSTOM_ENTRY_TYPE = "escape-restore-prompt";
const restoreStates = new WeakMap<object, RestoreState>();

function getState(instance: object): RestoreState {
	let state = restoreStates.get(instance);
	if (!state) {
		state = { restoreRequested: false };
		restoreStates.set(instance, state);
	}
	return state;
}

function textFromMessage(message: any): string {
	if (!message || message.role !== "user") return "";
	const content = message.content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((block) => block?.type === "text" && typeof block.text === "string")
		.map((block) => block.text)
		.join("");
}

function getUserMessageText(instance: AnyInteractiveMode, message: any): string {
	try {
		if (typeof instance.getUserMessageText === "function") {
			return instance.getUserMessageText(message);
		}
	} catch {
		// Fall back to local extraction below.
	}
	return textFromMessage(message);
}

function requestRender(instance: AnyInteractiveMode): void {
	try {
		instance.ui?.requestRender?.();
	} catch {
		// best effort only
	}
}

function hideActiveTurn(instance: AnyInteractiveMode, active: ActivePrompt): void {
	const children = instance.chatContainer?.children;
	if (Array.isArray(children) && active.chatStartIndex >= 0 && active.chatStartIndex <= children.length) {
		children.splice(active.chatStartIndex);
	}

	try {
		instance.pendingTools?.clear?.();
	} catch {
		// best effort only
	}

	instance.streamingComponent = undefined;
	instance.streamingMessage = undefined;

	try {
		instance.stopWorkingLoader?.();
		instance.statusContainer?.clear?.();
	} catch {
		// best effort only
	}

	requestRender(instance);
}

function isAgentOutputEvent(event: any): boolean {
	if (event.type === "message_update") return true;
	if (event.type === "message_start" || event.type === "message_end") {
		return event.message?.role !== "user";
	}
	return typeof event.type === "string" && event.type.startsWith("tool_execution_");
}

function shouldSuppressCurrentTurnEvent(state: RestoreState, event: any): boolean {
	if (!state.restoreRequested || !state.active) return false;
	if (event.type === "agent_end") return false;
	return isAgentOutputEvent(event);
}

function cleanupRestoredPrompt(instance: AnyInteractiveMode, state: RestoreState): void {
	const active = state.active;
	if (!active) return;

	try {
		if (active.previousLeafId === null || active.previousLeafId === undefined) {
			instance.sessionManager?.resetLeaf?.();
		} else {
			instance.sessionManager?.branch?.(active.previousLeafId);
		}

		// Persist the branch position without adding anything to the model context or chat.
		// Without this hidden bookkeeping entry, resuming before another prompt would
		// make the append-only session pick the abandoned aborted entry as the leaf.
		instance.sessionManager?.appendCustomEntry?.(CUSTOM_ENTRY_TYPE, {
			restoredPrompt: active.text,
			restoredAt: new Date().toISOString(),
		});

		const context = instance.sessionManager?.buildSessionContext?.();
		if (context?.messages && instance.agent?.state) {
			instance.agent.state.messages = context.messages;
		}
	} catch {
		// Keep the in-memory agent context sane even if session bookkeeping fails.
		try {
			if (instance.agent?.state?.messages) {
				instance.agent.state.messages = instance.agent.state.messages.slice(0, active.messageCount);
			}
		} catch {
			// best effort only
		}
	}

	try {
		instance.rebuildChatFromMessages?.();
	} catch {
		requestRender(instance);
	}

	state.active = undefined;
	state.restoreRequested = false;
}

function installPatch(): void {
	const proto = InteractiveMode.prototype as AnyInteractiveMode & {
		[PATCHED]?: string;
		[ORIGINALS]?: Originals;
	};

	if (proto[PATCHED] === PATCH_VERSION) return;

	const originals: Originals = proto[ORIGINALS] ?? {
		handleEvent: proto.handleEvent,
		restoreQueuedMessagesToEditor: proto.restoreQueuedMessagesToEditor,
	};

	// If this extension was reloaded with a new implementation, unwrap first so
	// wrappers do not stack on wrappers.
	if (proto[ORIGINALS]) {
		proto.handleEvent = originals.handleEvent;
		proto.restoreQueuedMessagesToEditor = originals.restoreQueuedMessagesToEditor;
	}

	proto.handleEvent = async function patchedHandleEvent(this: AnyInteractiveMode, event: any): Promise<void> {
		const state = getState(this);

		if (event.type === "message_start" && event.message?.role === "user") {
			const text = getUserMessageText(this, event.message);
			state.active = {
				text,
				previousLeafId: this.sessionManager?.getLeafId?.() ?? null,
				messageCount: Array.isArray(this.agent?.state?.messages) ? this.agent.state.messages.length : 0,
				chatStartIndex: Array.isArray(this.chatContainer?.children) ? this.chatContainer.children.length : 0,
				restoredToEditor: false,
				hasAgentOutput: false,
			};
			state.restoreRequested = false;
		} else if (state.active && !state.restoreRequested && isAgentOutputEvent(event)) {
			state.active.hasAgentOutput = true;
		}

		if (shouldSuppressCurrentTurnEvent(state, event)) {
			requestRender(this);
			return;
		}

		await originals.handleEvent.call(this, event);

		if (event.type === "agent_end") {
			if (state.restoreRequested && state.active) {
				cleanupRestoredPrompt(this, state);
			} else {
				state.active = undefined;
				state.restoreRequested = false;
			}
		}
	};

	proto.restoreQueuedMessagesToEditor = function patchedRestoreQueuedMessagesToEditor(
		this: AnyInteractiveMode,
		options?: { abort?: boolean; currentText?: string },
	): number {
		const state = getState(this);
		const active = state.active;
		const shouldRestoreActivePrompt = Boolean(
			options?.abort && active && !active.restoredToEditor && !active.hasAgentOutput && this.session?.isStreaming,
		);

		if (!shouldRestoreActivePrompt || !active) {
			return originals.restoreQueuedMessagesToEditor.call(this, options);
		}

		const { steering = [], followUp = [] } = this.clearAllQueues?.() ?? {};
		const queuedMessages = [...steering, ...followUp];
		const restoredParts: string[] = [];

		if (active.text.trim()) {
			restoredParts.push(active.text);
			active.restoredToEditor = true;
			state.restoreRequested = true;
			hideActiveTurn(this, active);
		}

		restoredParts.push(...queuedMessages);
		const currentText = options?.currentText ?? this.editor?.getText?.() ?? "";
		const combinedText = [...restoredParts, currentText].filter((text) => text.trim()).join("\n\n");

		if (combinedText) {
			this.editor?.setText?.(combinedText);
		}

		this.updatePendingMessagesDisplay?.();

		if (options?.abort) {
			this.agent?.abort?.();
		}

		return restoredParts.length;
	};

	proto[ORIGINALS] = originals;
	proto[PATCHED] = PATCH_VERSION;
}

export default function escapeRestorePromptExtension(_pi: ExtensionAPI) {
	installPatch();
}
