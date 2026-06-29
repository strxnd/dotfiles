import { PASTE_END, PASTE_START } from "./editor.ts";
import { describeReject, replaceImagePathsInText } from "./image-utils.ts";
import type { AttachmentStore } from "./store.ts";
import type { ImageAttachment, LoadImageResult } from "./types.ts";

export type TerminalInputResult = { consume?: boolean; data?: string } | undefined;

export function createImagePasteTerminalInputHandler(options: {
  cwd: string;
  store: AttachmentStore;
  notify?: (message: string) => void;
  onAccept?: (attachments: ImageAttachment[]) => void;
  loadImage?: (path: string, cwd: string) => LoadImageResult;
}): (data: string) => TerminalInputResult {
  let pasteBuffer: string | undefined;

  const transform = (text: string) =>
    replaceImagePathsInText(text, {
      cwd: options.cwd,
      store: options.store,
      loadImage: options.loadImage,
      onReject: (result) => describeReject(result, options.notify),
    });

  return (data: string): TerminalInputResult => {
    let prefix = "";
    const wasBuffered = pasteBuffer !== undefined;
    if (pasteBuffer === undefined) {
      const start = data.indexOf(PASTE_START);
      if (start === -1) return undefined;

      prefix = data.slice(0, start);
      pasteBuffer = data.slice(start + PASTE_START.length);
      if (!pasteBuffer.includes(PASTE_END)) {
        return prefix ? { data: prefix } : { consume: true };
      }
    } else {
      pasteBuffer += data;
      if (!pasteBuffer.includes(PASTE_END)) return { consume: true };
    }

    const end = pasteBuffer.indexOf(PASTE_END);
    const content = pasteBuffer.slice(0, end);
    const remaining = pasteBuffer.slice(end + PASTE_END.length);
    pasteBuffer = undefined;

    const transformed = transform(content);
    if (transformed.replaced === 0) {
      return wasBuffered ? { data: `${PASTE_START}${content}${PASTE_END}${remaining}` } : undefined;
    }
    options.onAccept?.(transformed.accepted);
    return { data: `${prefix}${transformed.text}${remaining}` };
  };
}
