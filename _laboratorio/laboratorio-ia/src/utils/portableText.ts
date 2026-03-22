import type {
  PortableTextBlock,
  PortableTextSpan,
  PortableTextValue,
} from "../types";

export type PortableTextInput =
  | string
  | string[]
  | PortableTextValue
  | null
  | undefined;

export type CreatePortableTextOptions = {
  defaultStyle?: string;
  splitOnDoubleLineBreak?: boolean;
  trimParagraphs?: boolean;
};

function createKey(prefix = "pt"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeLineBreaks(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function normalizeParagraphText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function splitIntoParagraphs(
  value: string,
  options: CreatePortableTextOptions = {}
): string[] {
  const {
    splitOnDoubleLineBreak = true,
    trimParagraphs = true,
  } = options;

  const normalized = normalizeLineBreaks(value);

  const rawParagraphs = splitOnDoubleLineBreak
    ? normalized.split(/\n\s*\n/g)
    : normalized.split("\n");

  return rawParagraphs
    .map((paragraph) =>
      trimParagraphs ? normalizeParagraphText(paragraph) : paragraph
    )
    .filter((paragraph) => paragraph.length > 0);
}

export function isPortableTextBlock(value: unknown): value is PortableTextBlock {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PortableTextBlock>;

  return candidate._type === "block";
}

export function isPortableTextValue(value: unknown): value is PortableTextValue {
  return Array.isArray(value) && value.every((item) => isPortableTextBlock(item));
}

export function createPortableTextSpan(text: string): PortableTextSpan {
  return {
    _type: "span",
    _key: createKey("span"),
    text: text.trim(),
    marks: [],
  };
}

export function createPortableTextBlock(
  text: string,
  style = "normal"
): PortableTextBlock {
  return {
    _type: "block",
    _key: createKey("block"),
    style,
    markDefs: [],
    children: [createPortableTextSpan(text)],
  };
}

export function createPortableTextFromString(
  value: string,
  options: CreatePortableTextOptions = {}
): PortableTextValue {
  const { defaultStyle = "normal" } = options;
  const paragraphs = splitIntoParagraphs(value, options);

  return paragraphs.map((paragraph) =>
    createPortableTextBlock(paragraph, defaultStyle)
  );
}

export function createPortableText(
  input: PortableTextInput,
  options: CreatePortableTextOptions = {}
): PortableTextValue {
  if (!input) {
    return [];
  }

  if (isPortableTextValue(input)) {
    return input;
  }

  if (Array.isArray(input)) {
    const merged = input
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .join("\n\n");

    return createPortableTextFromString(merged, options);
  }

  if (typeof input === "string") {
    return createPortableTextFromString(input, options);
  }

  return [];
}

export function hasPortableTextContent(value: PortableTextInput): boolean {
  const portableText = createPortableText(value);

  return portableText.some(
    (block) =>
      Array.isArray(block.children) &&
      block.children.some(
        (child) => typeof child.text === "string" && child.text.trim().length > 0
      )
  );
}

export function getPortableTextPlainText(value: PortableTextInput): string {
  const portableText = createPortableText(value);

  return portableText
    .map((block) =>
      Array.isArray(block.children)
        ? block.children
            .map((child) => (typeof child.text === "string" ? child.text : ""))
            .join("")
        : ""
    )
    .filter(Boolean)
    .join("\n\n")
    .trim();
}