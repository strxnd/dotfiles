import type { ImageAttachment } from "./types.ts";

export class AttachmentStore {
  private nextId = 1;
  private readonly attachments = new Map<string, ImageAttachment>();

  clear(): void {
    this.nextId = 1;
    this.attachments.clear();
  }

  list(): ImageAttachment[] {
    return [...this.attachments.values()].sort((a, b) => a.id - b.id);
  }

  add(input: Omit<ImageAttachment, "id" | "placeholder" | "createdAt">): ImageAttachment {
    const id = this.nextId++;
    const attachment: ImageAttachment = {
      ...input,
      id,
      placeholder: `[#image ${id}]`,
      createdAt: Date.now(),
    };
    this.attachments.set(attachment.placeholder, attachment);
    return attachment;
  }

  get(placeholder: string): ImageAttachment | undefined {
    return this.attachments.get(placeholder);
  }

  matchingPlaceholders(text: string): ImageAttachment[] {
    const matches = this.list()
      .map((attachment) => ({ attachment, index: text.indexOf(attachment.placeholder) }))
      .filter((match) => match.index >= 0)
      .sort((a, b) => a.index - b.index);

    return matches.map((match) => match.attachment);
  }
}
