export type SubmittedPreviewStyle = "raw" | "collapsible";

export interface ImageCompressionConfig {
  /** Enable the image compression slash command. */
  enabled?: boolean;
  /** Slash command name without the leading slash. */
  command?: string;
  /** Model passed to pi for image summarization. Pass an empty string to use pi's default model. */
  model?: string;
  /** Prompt used to summarize each image. */
  prompt?: string;
  /** pi executable used for summarization subprocesses. */
  piCommand?: string;
  /** Per-image summarization timeout in milliseconds. */
  timeoutMs?: number;
  /** Add a visible, collapsible UI report after compression. */
  includeReport?: boolean;
}

export interface ResolvedImageCompressionConfig {
  enabled: boolean;
  command: string;
  model: string;
  prompt: string;
  piCommand: string;
  timeoutMs: number;
  includeReport: boolean;
}

export interface PasterConfig {
  /** How submitted attachment previews render in chat history. */
  submittedPreviewStyle?: SubmittedPreviewStyle;
  /** Append local image paths to the submitted prompt so the agent can manipulate the source files. */
  includeImagePathsInPrompt?: boolean;
  /** Configure the /image-compress command. */
  imageCompression?: ImageCompressionConfig;
  customEditor?: {
    /** Replace pi's input editor to enable inline image UX features. */
    enabled?: boolean;
    /** Show an image preview above the input while the cursor is inside an image placeholder. */
    showImagePreview?: boolean;
    /** Treat image placeholders as atomic blocks for backspace/delete. */
    deletePlaceholderAsBlock?: boolean;
  };
}

export interface ResolvedPasterConfig {
  submittedPreviewStyle: SubmittedPreviewStyle;
  includeImagePathsInPrompt: boolean;
  imageCompression: ResolvedImageCompressionConfig;
  customEditor: {
    enabled: boolean;
    showImagePreview: boolean;
    deletePlaceholderAsBlock: boolean;
  };
}

export const DEFAULT_PASTER_CONFIG: ResolvedPasterConfig = {
  submittedPreviewStyle: "raw",
  includeImagePathsInPrompt: true,
  imageCompression: {
    enabled: true,
    command: "image-compress",
    model: "openai-codex/gpt-5.4-mini",
    prompt:
      "Summarize this image in 2-4 concise sentences. Include important visible text, UI elements, errors, diagrams, and details that may matter for future coding or design work.",
    piCommand: "pi",
    timeoutMs: 120_000,
    includeReport: true,
  },
  customEditor: {
    enabled: true,
    showImagePreview: true,
    deletePlaceholderAsBlock: true,
  },
};

export function resolvePasterConfig(config: PasterConfig = {}): ResolvedPasterConfig {
  return {
    submittedPreviewStyle:
      config.submittedPreviewStyle ?? DEFAULT_PASTER_CONFIG.submittedPreviewStyle,
    includeImagePathsInPrompt:
      config.includeImagePathsInPrompt ?? DEFAULT_PASTER_CONFIG.includeImagePathsInPrompt,
    imageCompression: {
      enabled: config.imageCompression?.enabled ?? DEFAULT_PASTER_CONFIG.imageCompression.enabled,
      command: config.imageCompression?.command ?? DEFAULT_PASTER_CONFIG.imageCompression.command,
      model: config.imageCompression?.model ?? DEFAULT_PASTER_CONFIG.imageCompression.model,
      prompt: config.imageCompression?.prompt ?? DEFAULT_PASTER_CONFIG.imageCompression.prompt,
      piCommand:
        config.imageCompression?.piCommand ?? DEFAULT_PASTER_CONFIG.imageCompression.piCommand,
      timeoutMs:
        config.imageCompression?.timeoutMs ?? DEFAULT_PASTER_CONFIG.imageCompression.timeoutMs,
      includeReport:
        config.imageCompression?.includeReport ??
        DEFAULT_PASTER_CONFIG.imageCompression.includeReport,
    },
    customEditor: {
      enabled: config.customEditor?.enabled ?? DEFAULT_PASTER_CONFIG.customEditor.enabled,
      showImagePreview:
        config.customEditor?.showImagePreview ??
        DEFAULT_PASTER_CONFIG.customEditor.showImagePreview,
      deletePlaceholderAsBlock:
        config.customEditor?.deletePlaceholderAsBlock ??
        DEFAULT_PASTER_CONFIG.customEditor.deletePlaceholderAsBlock,
    },
  };
}
