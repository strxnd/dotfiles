import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectImageMimeType, dimensionsForImage } from "./image-utils.ts";
import { MAX_IMAGE_BYTES, type LoadedImage } from "./types.ts";

export type ClipboardImageResult =
  | { ok: true; image: LoadedImage }
  | {
      ok: false;
      reason: "empty" | "unsupported-platform" | "too-large" | "unsupported" | "read-error";
    };

export function readClipboardImage(maxBytes = MAX_IMAGE_BYTES): ClipboardImageResult {
  if (process.platform === "darwin") return readMacOSClipboardImage(maxBytes);
  if (process.platform === "win32") return readWindowsClipboardImage(maxBytes);
  if (process.platform === "linux" && isWSL()) return readWindowsClipboardImage(maxBytes);
  return { ok: false, reason: "unsupported-platform" };
}

function isWSL(): boolean {
  try {
    return /microsoft|wsl/i.test(readFileSync("/proc/version", "utf8"));
  } catch {
    return false;
  }
}

function resolvePowerShell(): string | null {
  if (process.platform === "win32") return "powershell.exe";
  const candidates = [
    "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
    "/mnt/c/WINDOWS/System32/WindowsPowerShell/v1.0/powershell.exe",
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return "powershell.exe";
}

function readWindowsClipboardImage(maxBytes: number): ClipboardImageResult {
  const exe = resolvePowerShell();
  if (!exe) return { ok: false, reason: "unsupported-platform" };

  const script = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.Windows.Forms | Out-Null",
    "Add-Type -AssemblyName System.Drawing | Out-Null",
    "$img = [System.Windows.Forms.Clipboard]::GetImage()",
    "if ($img -eq $null) { exit 2 }",
    "$ms = New-Object System.IO.MemoryStream",
    "$img.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)",
    "[Console]::Out.Write([Convert]::ToBase64String($ms.ToArray()))",
  ].join("; ");

  try {
    const result = spawnSync(exe, ["-NoProfile", "-NonInteractive", "-STA", "-Command", script], {
      timeout: 5000,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    if (result.status === 2) return { ok: false, reason: "empty" };
    if (result.status !== 0) return { ok: false, reason: "read-error" };

    const data = (result.stdout || "").trim();
    if (!data) return { ok: false, reason: "empty" };

    const bytes = Buffer.from(data, "base64");
    if (bytes.length === 0) return { ok: false, reason: "empty" };
    if (bytes.length > maxBytes) return { ok: false, reason: "too-large" };

    const mimeType = detectImageMimeType(bytes);
    if (!mimeType) return { ok: false, reason: "unsupported" };

    return {
      ok: true,
      image: {
        originalPath: "clipboard.png",
        mimeType,
        data,
        dimensions: dimensionsForImage(data, mimeType),
      },
    };
  } catch {
    return { ok: false, reason: "read-error" };
  }
}

function readMacOSClipboardImage(maxBytes: number): ClipboardImageResult {
  const attempts = [
    { appleScriptClass: "PNGf", extension: "png" },
    { appleScriptClass: "JPEG", extension: "jpg" },
  ];

  for (const attempt of attempts) {
    const tmpFile = join(tmpdir(), `paster-clipboard-${randomUUID()}.${attempt.extension}`);
    try {
      const result = spawnSync(
        "osascript",
        [
          "-e",
          `set imageData to the clipboard as «class ${attempt.appleScriptClass}»`,
          "-e",
          `set outputFile to open for access POSIX file ${JSON.stringify(tmpFile)} with write permission`,
          "-e",
          "set eof of outputFile to 0",
          "-e",
          "write imageData to outputFile",
          "-e",
          "close access outputFile",
        ],
        { timeout: 3000, stdio: "ignore" },
      );
      if (result.status !== 0) continue;

      const bytes = readFileSync(tmpFile);
      if (bytes.length === 0) continue;
      if (bytes.length > maxBytes) return { ok: false, reason: "too-large" };

      const mimeType = detectImageMimeType(bytes);
      if (!mimeType) continue;

      const data = bytes.toString("base64");
      return {
        ok: true,
        image: {
          originalPath: `clipboard.${attempt.extension}`,
          mimeType,
          data,
          dimensions: dimensionsForImage(data, mimeType),
        },
      };
    } catch {
      return { ok: false, reason: "read-error" };
    } finally {
      try {
        unlinkSync(tmpFile);
      } catch {
        // Ignore cleanup errors.
      }
    }
  }

  return { ok: false, reason: "empty" };
}
