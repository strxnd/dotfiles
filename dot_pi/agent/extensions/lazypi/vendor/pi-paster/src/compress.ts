import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { ResolvedImageCompressionConfig } from "./config.ts";
import type { ImageCompressionReportDetails } from "./types.ts";

export const DEFAULT_IMAGE_SUMMARY_PROMPT =
  "Summarize this image in 2-4 concise sentences. Include important visible text, UI elements, errors, diagrams, and details that may matter for future coding or design work.";

interface TextBlock {
  type: "text";
  text: string;
}

interface ImageBlock {
  type: "image";
  data: string;
  mimeType: string;
}

type ContentBlock = TextBlock | ImageBlock | Record<string, unknown>;

type SessionEntryLike = {
  type: string;
  thinkingLevel?: string;
  provider?: string;
  modelId?: string;
  summary?: string;
  firstKeptEntryId?: string;
  tokensBefore?: number;
  details?: unknown;
  data?: unknown;
  name?: string;
  fromHook?: boolean;
  customType?: string;
  content?: string | ContentBlock[];
  display?: boolean;
  message?: {
    role?: string;
    content?: string | ContentBlock[];
    [key: string]: unknown;
  };
};

interface ImageOccurrence {
  key: string;
  image: ImageBlock;
}

function isImageBlock(block: unknown): block is ImageBlock {
  return (
    !!block &&
    typeof block === "object" &&
    (block as { type?: unknown }).type === "image" &&
    typeof (block as { data?: unknown }).data === "string" &&
    typeof (block as { mimeType?: unknown }).mimeType === "string"
  );
}

function imageKey(image: ImageBlock): string {
  return `${image.mimeType}:${image.data.length}:${image.data.slice(0, 48)}`;
}

function collectImages(entries: SessionEntryLike[]): ImageOccurrence[] {
  const images: ImageOccurrence[] = [];
  for (const entry of entries) {
    const content = entry.type === "custom_message" ? entry.content : entry.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!isImageBlock(block)) continue;
      images.push({ key: imageKey(block), image: block });
    }
  }
  return images;
}

function extensionForMime(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "image/png":
    default:
      return ".png";
  }
}

function normalizeSummary(stdout: string): string {
  return stdout.trim().replace(/\n{3,}/g, "\n\n");
}

async function summarizeImage(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  image: ImageBlock,
  config: ResolvedImageCompressionConfig,
): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "pi-paster-image-compress-"));
  try {
    const imagePath = join(dir, `image${extensionForMime(image.mimeType)}`);
    writeFileSync(imagePath, Buffer.from(image.data, "base64"));

    const args = ["--no-session", "--no-extensions", "--no-tools", "--mode", "text", "-p"];
    if (config.model) {
      args.splice(0, 0, "--model", config.model);
    }
    args.push(`@${imagePath}`, config.prompt);

    const result = await pi.exec(config.piCommand, args, {
      cwd: ctx.cwd,
      timeout: config.timeoutMs,
    });
    if (result.code !== 0) {
      const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.code}`;
      throw new Error(`image summarization failed: ${detail}`);
    }
    const summary = normalizeSummary(result.stdout);
    if (!summary) throw new Error("image summarization returned an empty response");
    return summary;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function summaryBlock(summary: string): TextBlock {
  return { type: "text", text: `Image summary: ${summary}` };
}

function transformContent(
  content: string | ContentBlock[] | undefined,
  summaries: Map<string, string>,
): string | ContentBlock[] | undefined {
  if (!Array.isArray(content)) return content;
  return content.map((block) => {
    if (!isImageBlock(block)) return block;
    return summaryBlock(summaries.get(imageKey(block)) ?? "Image summary unavailable.");
  });
}

function buildReportDetails(
  images: ImageOccurrence[],
  summaries: Map<string, string>,
): ImageCompressionReportDetails {
  const items = [...summaries.values()].map((summary, index) => ({ index: index + 1, summary }));
  return { imageCount: images.length, summaryCount: summaries.size, items };
}

function appendTransformedEntry(
  sessionManager: unknown,
  entry: SessionEntryLike,
  summaries: Map<string, string>,
) {
  const manager = sessionManager as {
    appendThinkingLevelChange(level: string): void;
    appendModelChange(provider: string, modelId: string): void;
    appendCustomEntry(customType: string, data?: unknown): void;
    appendSessionInfo(name: string): void;
    appendCustomMessageEntry(
      customType: string,
      content: string | ContentBlock[],
      display: boolean,
      details?: unknown,
    ): void;
    appendMessage(message: Record<string, unknown>): void;
  };

  switch (entry.type) {
    case "thinking_level_change":
      if (entry.thinkingLevel) manager.appendThinkingLevelChange(entry.thinkingLevel);
      return;
    case "model_change":
      if (entry.provider && entry.modelId) manager.appendModelChange(entry.provider, entry.modelId);
      return;
    case "compaction":
      if (entry.summary) {
        manager.appendCustomMessageEntry(
          "paster-image-compress-compaction-summary",
          entry.summary,
          false,
          entry.details,
        );
      }
      return;
    case "branch_summary":
      if (entry.summary) {
        manager.appendCustomMessageEntry(
          "paster-image-compress-branch-summary",
          entry.summary,
          false,
          entry.details,
        );
      }
      return;
    case "custom":
      if (entry.customType) manager.appendCustomEntry(entry.customType, entry.data);
      return;
    case "session_info":
      if (typeof entry.name === "string") {
        manager.appendSessionInfo(entry.name);
      }
      return;
    case "custom_message":
      if (entry.customType === "paster-preview") return;
      if (entry.customType && entry.content !== undefined) {
        manager.appendCustomMessageEntry(
          entry.customType,
          transformContent(entry.content, summaries) ?? "",
          entry.display ?? true,
          entry.details,
        );
      }
      return;
    case "message":
      if (entry.message) {
        manager.appendMessage({
          ...entry.message,
          content: transformContent(entry.message.content, summaries),
        });
      }
      return;
    default:
      return;
  }
}

function resolveCommandOptions(args: string, config: ResolvedImageCompressionConfig) {
  const model = args.trim() || config.model;
  return { ...config, model };
}

function setCompressionProgress(
  ctx: ExtensionCommandContext,
  current: number,
  total: number,
  model: string,
): void {
  if (!ctx.hasUI) return;
  const progress = `Summarizing image ${current}/${total}`;
  ctx.ui.setStatus("paster-image-compress", progress);
  ctx.ui.setWidget(
    "paster-image-compress-progress",
    [`paster: ${progress}`, model ? `model: ${model}` : "model: pi default"],
    { placement: "aboveEditor" },
  );
}

function clearCompressionProgress(ctx: ExtensionCommandContext): void {
  if (!ctx.hasUI) return;
  ctx.ui.setStatus("paster-image-compress", undefined);
  ctx.ui.setWidget("paster-image-compress-progress", undefined, { placement: "aboveEditor" });
}

export function registerImageCompressionCommand(
  pi: ExtensionAPI,
  config: ResolvedImageCompressionConfig,
): void {
  if (!config.enabled) return;

  pi.registerCommand(config.command, {
    description:
      "Summarize images in the current branch and switch to a new session where image blocks are replaced with text summaries.",
    handler: async (args, ctx): Promise<void> => {
      await ctx.waitForIdle();
      const commandConfig = resolveCommandOptions(args, config);
      const branch = ctx.sessionManager.getBranch() as SessionEntryLike[];
      const images = collectImages(branch);
      if (images.length === 0) {
        if (ctx.hasUI) ctx.ui.notify("No images found in the current branch", "warning");
        return;
      }

      const uniqueImages = [...new Map(images.map((item) => [item.key, item.image])).entries()];
      const summaries = new Map<string, string>();

      if (ctx.hasUI) {
        ctx.ui.notify(`Summarizing ${uniqueImages.length} image(s)...`, "info");
      }
      setCompressionProgress(ctx, 0, uniqueImages.length, commandConfig.model);

      try {
        for (let index = 0; index < uniqueImages.length; index++) {
          const [key, image] = uniqueImages[index]!;
          setCompressionProgress(ctx, index + 1, uniqueImages.length, commandConfig.model);
          summaries.set(key, await summarizeImage(pi, ctx, image, commandConfig));
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const modelHint = commandConfig.model || "pi's default model";
        const message = `Image compression failed while using ${modelHint}. ${reason}\n\nTo try another model once, run /${commandConfig.command} provider/model. To change the default, configure pi-paster's imageCompression.model option in your wrapper extension. See https://github.com/beowulf11/pi-paster#configuration.`;
        if (ctx.hasUI) ctx.ui.notify(message, "error");
        else console.error(message);
        return;
      } finally {
        clearCompressionProgress(ctx);
      }

      const parentSession = ctx.sessionManager.getSessionFile();
      const reportDetails = buildReportDetails(images, summaries);
      await ctx.newSession({
        parentSession,
        setup: async (sessionManager) => {
          for (const entry of branch) appendTransformedEntry(sessionManager, entry, summaries);
          if (commandConfig.includeReport) {
            sessionManager.appendCustomMessageEntry(
              "paster-image-compress-report",
              "",
              true,
              reportDetails,
            );
          }
        },
        withSession: async (newCtx) => {
          if (newCtx.hasUI) {
            newCtx.ui.notify(
              `Compressed ${images.length} image block(s) into text summaries`,
              "info",
            );
          }
        },
      });

      return;
    },
  });
}
