import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { platform } from "node:process";
import { getImageDimensions } from "@earendil-works/pi-tui";
import type { AttachmentStore } from "./store.ts";
import {
  MAX_IMAGE_BYTES,
  type ImageAttachment,
  type LoadImageResult,
  type PasterImageContent,
  type SupportedImageMimeType,
} from "./types.ts";
import { optimizeImageBytes } from "./optimize-image.ts";

interface PathToken {
  raw: string;
  value: string;
  start: number;
  end: number;
  bare: boolean;
}

const MAX_BARE_PATH_EXTENSIONS = 8;

export function detectImageMimeType(bytes: Uint8Array): SupportedImageMimeType | undefined {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return undefined;
}

const WINDOWS_DRIVE_PATH = /^([a-zA-Z]):[\\/](.*)$/;

export function isWindowsDrivePath(value: string): boolean {
  return WINDOWS_DRIVE_PATH.test(value);
}

export function isWindowsUncPath(value: string): boolean {
  return value.startsWith("\\\\") && value.length > 2;
}

export function isWindowsLikePath(value: string): boolean {
  return isWindowsDrivePath(value) || isWindowsUncPath(value);
}

let cachedIsWsl: boolean | undefined;
export function isWsl(): boolean {
  if (cachedIsWsl !== undefined) return cachedIsWsl;
  if (platform !== "linux") {
    cachedIsWsl = false;
    return cachedIsWsl;
  }
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) {
    cachedIsWsl = true;
    return cachedIsWsl;
  }
  try {
    const release = readFileSync("/proc/version", "utf8");
    cachedIsWsl = /microsoft|wsl/i.test(release);
  } catch {
    cachedIsWsl = false;
  }
  return cachedIsWsl;
}

export function windowsToWslPath(windowsPath: string): string {
  const driveMatch = WINDOWS_DRIVE_PATH.exec(windowsPath);
  if (driveMatch) {
    const drive = driveMatch[1]!.toLowerCase();
    const rest = driveMatch[2]!.replace(/\\/g, "/");
    return rest.length > 0 ? `/mnt/${drive}/${rest}` : `/mnt/${drive}`;
  }
  if (isWindowsUncPath(windowsPath)) {
    // \\server\share\path -> //wsl.localhost-style not generally translatable; pass through.
    return windowsPath.replace(/\\/g, "/");
  }
  return windowsPath;
}

export function resolveImagePath(input: string, cwd: string): string {
  if (input === "~") return homedir();
  if (input.startsWith("~/")) return resolve(homedir(), input.slice(2));
  if (isWindowsLikePath(input)) {
    if (platform === "win32") return input;
    if (isWsl()) return windowsToWslPath(input);
    return input;
  }
  if (isAbsolute(input)) return input;
  return resolve(cwd, input);
}

export function shellUnescape(input: string): string {
  let result = "";
  for (let i = 0; i < input.length; i++) {
    const char = input[i]!;
    if (char === "\\" && i + 1 < input.length) {
      result += input[++i]!;
    } else {
      result += char;
    }
  }
  return result;
}

function isPathLike(value: string): boolean {
  return (
    value.startsWith("/") ||
    value.startsWith("~/") ||
    value === "~" ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    isWindowsLikePath(value)
  );
}

function startsWithWindowsPath(text: string, index: number): boolean {
  if (
    index + 2 < text.length &&
    /[a-zA-Z]/.test(text[index]!) &&
    text[index + 1] === ":" &&
    (text[index + 2] === "\\" || text[index + 2] === "/")
  ) {
    return true;
  }
  if (index + 1 < text.length && text[index] === "\\" && text[index + 1] === "\\") {
    return true;
  }
  return false;
}

export function tokenizePathLikeText(text: string): PathToken[] {
  const tokens: PathToken[] = [];
  let index = 0;

  while (index < text.length) {
    const char = text[index]!;
    if (/\s/.test(char)) {
      index++;
      continue;
    }

    const start = index;
    if (char === "'" || char === '"') {
      const quote = char;
      index++;
      const windowsMode = startsWithWindowsPath(text, index);
      let value = "";
      let closed = false;
      while (index < text.length) {
        const current = text[index]!;
        if (!windowsMode && current === "\\" && quote === '"' && index + 1 < text.length) {
          value += text[index + 1]!;
          index += 2;
          continue;
        }
        if (current === quote) {
          index++;
          closed = true;
          break;
        }
        value += current;
        index++;
      }
      if (closed && isPathLike(value))
        tokens.push({ raw: text.slice(start, index), value, start, end: index, bare: false });
      continue;
    }

    const windowsMode = startsWithWindowsPath(text, index);
    let rawValue = "";
    while (index < text.length) {
      const current = text[index]!;
      if (/\s/.test(current)) break;
      if (!windowsMode && current === "\\" && index + 1 < text.length) {
        rawValue += current + text[index + 1]!;
        index += 2;
        continue;
      }
      rawValue += current;
      index++;
    }
    const value = windowsMode ? rawValue : shellUnescape(rawValue);
    if (isPathLike(value)) tokens.push({ raw: rawValue, value, start, end: index, bare: true });
  }

  return tokens;
}

function tryExtendBareToken(
  text: string,
  token: PathToken,
  attempt: (path: string) => LoadImageResult,
): { value: string; end: number; result: LoadImageResult } {
  let value = token.value;
  let end = token.end;
  let lastResult = attempt(value);
  if (lastResult.ok || lastResult.reason === "too-large" || !token.bare) {
    return { value, end, result: lastResult };
  }

  let scan = end;
  for (let i = 0; i < MAX_BARE_PATH_EXTENSIONS; i++) {
    let wsEnd = scan;
    while (wsEnd < text.length) {
      const ch = text[wsEnd]!;
      if (ch === "\n" || ch === "\r") break;
      if (!/\s/.test(ch)) break;
      wsEnd++;
    }
    if (wsEnd === scan) break;

    let wordEnd = wsEnd;
    while (wordEnd < text.length && !/\s/.test(text[wordEnd]!)) wordEnd++;
    if (wordEnd === wsEnd) break;

    const nextWord = shellUnescape(text.slice(wsEnd, wordEnd));
    if (isPathLike(nextWord)) break;

    const extendedValue = value + text.slice(scan, wsEnd) + nextWord;
    const candidate = attempt(extendedValue);
    scan = wordEnd;
    if (candidate.ok || candidate.reason === "too-large") {
      return { value: extendedValue, end: wordEnd, result: candidate };
    }
    value = extendedValue;
    end = wordEnd;
    lastResult = candidate;
  }

  return { value, end, result: lastResult };
}

export function dimensionsForImage(data: string, mimeType: SupportedImageMimeType) {
  return getImageDimensions(data, mimeType) ?? undefined;
}

export function loadImageFromPath(
  inputPath: string,
  cwd: string,
  maxBytes = MAX_IMAGE_BYTES,
): LoadImageResult {
  const path = resolveImagePath(inputPath, cwd);
  try {
    if (!existsSync(path)) return { ok: false, reason: "missing", path };
    const stat = statSync(path);
    if (!stat.isFile()) return { ok: false, reason: "not-file", path };
    if (stat.size > maxBytes) return { ok: false, reason: "too-large", path };

    const data = readFileSync(path);
    const mimeType = detectImageMimeType(data);
    if (!mimeType) return { ok: false, reason: "unsupported", path };

    const base64Data = data.toString("base64");
    return {
      ok: true,
      image: {
        originalPath: path,
        mimeType,
        data: base64Data,
        dimensions: dimensionsForImage(base64Data, mimeType),
      },
    };
  } catch {
    return { ok: false, reason: "read-error", path };
  }
}

export function replaceImagePathsInText(
  text: string,
  options: {
    cwd: string;
    store: AttachmentStore;
    loadImage?: (path: string, cwd: string) => LoadImageResult;
    onReject?: (result: Exclude<LoadImageResult, { ok: true }>) => void;
  },
): { text: string; replaced: number; accepted: ImageAttachment[] } {
  const tokens = tokenizePathLikeText(text);
  if (tokens.length === 0) return { text, replaced: 0, accepted: [] };

  let output = "";
  let cursor = 0;
  let replaced = 0;
  const accepted: ImageAttachment[] = [];
  const loadImage = options.loadImage ?? loadImageFromPath;

  for (const token of tokens) {
    if (token.start < cursor) continue;

    const extended = tryExtendBareToken(text, token, (path) => loadImage(path, options.cwd));
    if (!extended.result.ok) {
      if (extended.result.reason === "too-large") options.onReject?.(extended.result);
      continue;
    }

    const attachment = options.store.add(extended.result.image);
    accepted.push(attachment);
    output += text.slice(cursor, token.start) + attachment.placeholder;
    cursor = extended.end;
    replaced++;
  }

  if (replaced === 0) return { text, replaced: 0, accepted: [] };
  output += text.slice(cursor);
  return { text: output, replaced, accepted };
}

export function imagesForText(
  store: AttachmentStore,
  text: string,
  existing: PasterImageContent[] = [],
): PasterImageContent[] {
  return [
    ...existing,
    ...store.matchingPlaceholders(text).map((attachment) => ({
      type: "image" as const,
      mimeType: attachment.mimeType,
      data: attachment.data,
    })),
  ];
}

export function appendImagePathContext(text: string, attachments: ImageAttachment[]): string {
  if (attachments.length === 0) return text;
  const lines = attachments.map(
    (attachment) => `- ${attachment.placeholder}: ${attachment.originalPath}`,
  );
  return `${text}\n\nAttached image paths:\n${lines.join("\n")}`;
}

/**
 * Async variant of imagesForText that runs each attachment through the
 * Anthropic-aware image optimizer (resize to 8000px cap, JPEG ladder to stay
 * under the 5 MB / 32 MB request caps). Optimization is cached on the
 * attachment so the cost is paid once per image, not per submit.
 *
 * Used by paster's `input` handler; safe to await on the hot path because
 * sharp is only invoked when the image is actually over the limits.
 */
export async function imagesForTextOptimized(
  store: AttachmentStore,
  text: string,
  existing: PasterImageContent[] = [],
): Promise<PasterImageContent[]> {
  const attachments = store.matchingPlaceholders(text);
  const optimized: PasterImageContent[] = [];
  for (const attachment of attachments) {
    if (!attachment.optimized) {
      try {
        const input = Buffer.from(attachment.data, "base64");
        const result = await optimizeImageBytes(input, attachment.mimeType);
        if (result.changed) {
          attachment.data = result.data;
          attachment.mimeType = result.mimeType;
          if (result.finalDim) {
            attachment.dimensions = {
              widthPx: result.finalDim.width,
              heightPx: result.finalDim.height,
            };
          }
        }
        attachment.optimized = true;
        attachment.originalBytes = result.originalBytes;
        attachment.finalBytes = result.finalBytes;
        attachment.optimizeActions = result.actions;
      } catch {
        // optimization is best-effort; fall through with the original bytes
        attachment.optimized = true;
      }
    }
    optimized.push({
      type: "image",
      mimeType: attachment.mimeType,
      data: attachment.data,
    });
  }
  return [...existing, ...optimized];
}

export function describeReject(
  result: Exclude<LoadImageResult, { ok: true }>,
  notify?: (message: string) => void,
): void {
  if (!notify) return;
  if (result.reason === "too-large") {
    notify(`paster: image is too large and was not attached: ${result.path}`);
  }
}
