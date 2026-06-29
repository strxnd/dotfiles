import {
  Box,
  Container,
  getCellDimensions,
  Image,
  type Component,
  type ImageTheme,
  Spacer,
  Text,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import type { ImageAttachment, ImageCompressionReportDetails } from "./types.ts";

function formatAttachmentLine(
  attachment: ImageAttachment,
  width: number,
  style: (text: string) => string,
): string {
  const maxWidth = Math.max(1, width);
  const line = style(`Attached ${attachment.placeholder} ${attachment.originalPath}`);
  return visibleWidth(line) > maxWidth ? truncateToWidth(line, maxWidth, "") : line;
}

export type ImagePreviewMessageStyle = "raw" | "collapsible";

interface ImagePreviewMessageTheme extends ImageTheme {
  background?: (text: string) => string;
  title?: (text: string) => string;
  muted?: (text: string) => string;
}

export class ImagePreviewMessage implements Component {
  private readonly images: Image[];

  constructor(
    private readonly attachments: ImageAttachment[],
    private readonly theme: ImagePreviewMessageTheme,
    private readonly options: { expanded?: boolean; style?: ImagePreviewMessageStyle } = {},
  ) {
    this.images = attachments.map(
      (attachment) =>
        new Image(attachment.data, attachment.mimeType, theme, {
          maxWidthCells: 60,
          maxHeightCells: 16,
          filename: attachment.placeholder,
        }),
    );
  }

  invalidate(): void {
    for (const image of this.images) image.invalidate();
  }

  render(width: number): string[] {
    return this.options.style === "collapsible"
      ? this.renderCollapsible(width)
      : this.renderRaw(width);
  }

  private renderRaw(width: number): string[] {
    const lines: string[] = [];
    const safeWidth = Math.max(1, width);
    for (let index = 0; index < this.attachments.length; index++) {
      const attachment = this.attachments[index]!;
      lines.push(formatAttachmentLine(attachment, safeWidth, this.theme.fallbackColor));
      lines.push(...this.images[index]!.render(safeWidth));
    }
    return lines;
  }

  private renderCollapsible(width: number): string[] {
    const container = new Container();
    container.addChild(new Spacer(1));
    const box = new Box(1, 1, this.theme.background);
    container.addChild(box);

    const title = this.theme.title ?? this.theme.fallbackColor;
    const muted = this.theme.muted ?? this.theme.fallbackColor;
    const summary =
      this.attachments.length === 1
        ? `Attached ${this.attachments[0]!.placeholder}`
        : `Attached ${this.attachments.length} images`;
    const suffix = this.options.expanded ? " (ctrl+o to collapse)" : " (ctrl+o to expand)";
    box.addChild(new Text(`${title(summary)}${muted(suffix)}`, 0, 0));

    for (const attachment of this.attachments) {
      box.addChild(new Text(formatAttachmentLine(attachment, width, muted), 0, 0));
    }

    const lines = container.render(width);
    if (!this.options.expanded) return lines;

    const safeWidth = Math.max(1, width);
    for (let index = 0; index < this.attachments.length; index++) {
      lines.push(...this.images[index]!.render(safeWidth));
    }
    return lines;
  }
}

interface CompressionReportTheme {
  background?: (text: string) => string;
  title: (text: string) => string;
  muted: (text: string) => string;
}

export class ImageCompressionReportMessage implements Component {
  constructor(
    private readonly details: ImageCompressionReportDetails,
    private readonly theme: CompressionReportTheme,
    private readonly expanded = false,
  ) {}

  render(width: number): string[] {
    const container = new Container();
    container.addChild(new Spacer(1));
    const box = new Box(1, 1, this.theme.background);
    container.addChild(box);

    const suffix = this.expanded ? " (ctrl+o to collapse)" : " (ctrl+o to expand)";
    box.addChild(
      new Text(
        `${this.theme.title(`Compressed ${this.details.imageCount} image block(s) into ${this.details.summaryCount} summary/summaries`)}${this.theme.muted(suffix)}`,
        0,
        0,
      ),
    );

    if (this.expanded) {
      for (const item of this.details.items) {
        box.addChild(new Text(this.theme.muted(`Image ${item.index}:`), 0, 0));
        box.addChild(new Text(truncateToWidth(item.summary, Math.max(1, width - 4), "…"), 0, 0));
      }
    }

    return container.render(width);
  }

  invalidate(): void {}
}

interface CursorPreviewTheme {
  title: (text: string) => string;
  muted: (text: string) => string;
  accent: (text: string) => string;
}

export class CursorImagePreviewWidget implements Component {
  private image: Image;

  constructor(
    private attachment: ImageAttachment,
    private readonly theme: CursorPreviewTheme,
  ) {
    this.image = this.createImage(attachment);
  }

  render(width: number): string[] {
    const imageWidth = this.constrainedImageWidth(width);
    this.image = this.createImage(this.attachment, imageWidth);
    return [this.headerLine(width), ...this.image.render(imageWidth + 2)];
  }

  invalidate(): void {
    this.image.invalidate();
  }

  private headerLine(width: number): string {
    return formatAttachmentLine(this.attachment, width, this.theme.title);
  }

  private createImage(attachment: ImageAttachment, maxWidthCells = 60): Image {
    return new Image(
      attachment.data,
      attachment.mimeType,
      { fallbackColor: this.theme.accent },
      {
        maxWidthCells,
        filename: attachment.placeholder,
      },
      attachment.dimensions,
    );
  }

  private constrainedImageWidth(width: number): number {
    const maxWidth = Math.max(1, Math.min(60, width - 2));
    const maxRows = 14;
    const dimensions = this.attachment.dimensions;
    if (!dimensions || dimensions.widthPx <= 0 || dimensions.heightPx <= 0) return maxWidth;

    const cell = getCellDimensions();
    const widthForMaxRows = Math.floor(
      (maxRows * cell.heightPx * dimensions.widthPx) / (dimensions.heightPx * cell.widthPx),
    );
    return Math.max(1, Math.min(maxWidth, widthForMaxRows));
  }
}
