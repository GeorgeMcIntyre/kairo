export type SemanticNoteKind =
  | "processNote"
  | "cableTrayNote"
  | "fenceNote"
  | "panelNote"
  | "annotation"
  | "unknownNote";

export const MAX_TEXT_OVERLAY_CHARS = 64;
export const MAX_LIST_LABEL_CHARS = 84;
export const MAX_SEMANTIC_OVERLAY_CHARS = 42;
export const LONG_TEXT_CHAR_THRESHOLD = 96;
export const LONG_TEXT_WORD_THRESHOLD = 12;
export const LONG_TEXT_ASSOCIATION_RADIUS = 1600;

const STRONG_DEVICE_TAG_PATTERN = /\b[A-Z0-9]+-\d{3}[LR]-[A-Z0-9]+\b/i;
const DIMENSION_PATTERN = /\b\d+(?:\.\d+)?\s*(?:MM|CM|M|IN|")\b|\b\d+(?:\.\d+)?\s*[Xx]\s*\d+(?:\.\d+)?\b/;

export type TextSafetyProfile = {
  rawText: string;
  normalizedText: string;
  displayText: string;
  overlayText: string;
  associationText: string;
  primaryTag?: string;
  noteKind?: SemanticNoteKind;
  isLongText: boolean;
  associationRadius?: number;
};

export function normalizeDxfText(text: string): string {
  return text.replace(/\\P/gi, " ").replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

export function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  if (maxChars <= 3) return text.slice(0, maxChars);
  return `${text.slice(0, maxChars - 3).trimEnd()}...`;
}

export function safeDisplayText(text: string, maxChars = MAX_LIST_LABEL_CHARS): string {
  return truncateText(normalizeDxfText(text), maxChars);
}

export function extractStrongDeviceTag(text: string): string | undefined {
  return normalizeDxfText(text).match(STRONG_DEVICE_TAG_PATTERN)?.[0]?.toUpperCase();
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function classifySemanticNoteKind(text: string): SemanticNoteKind | undefined {
  const normalized = normalizeDxfText(text);
  if (!normalized) return undefined;
  const upper = normalized.toUpperCase();
  const words = wordCount(normalized);
  const hasDimensions = DIMENSION_PATTERN.test(upper);
  const isLong = normalized.length >= LONG_TEXT_CHAR_THRESHOLD || words >= LONG_TEXT_WORD_THRESHOLD;

  if (/\bCABLE\s+TRAY\b/.test(upper) && (isLong || hasDimensions || words >= 5)) return "cableTrayNote";
  if (/\bFENCE\b/.test(upper) && (isLong || hasDimensions || words >= 4)) return "fenceNote";
  if (/\b(PANEL|PDP|400A|ENCLOSURE|DISCONNECT)\b/.test(upper) && (isLong || hasDimensions || words >= 6)) return "panelNote";
  if (/\b(RESPOT|RIVET|PROCESS|LOAD|SPAC|GEO|STATION)\b/.test(upper) && (isLong || words >= 7)) return "processNote";
  if (/\bNOTE\b/.test(upper) && (isLong || words >= 4)) return "unknownNote";
  if (hasDimensions || isLong) return "annotation";
  return undefined;
}

export function isLikelyAnnotationText(text: string): boolean {
  const normalized = normalizeDxfText(text);
  if (!normalized) return false;
  if (extractStrongDeviceTag(normalized)) return false;
  return classifySemanticNoteKind(normalized) !== undefined;
}

export function textSafetyProfile(rawText: string, textHeight = 0): TextSafetyProfile {
  const normalizedText = normalizeDxfText(rawText);
  const primaryTag = extractStrongDeviceTag(normalizedText);
  const noteKind = classifySemanticNoteKind(normalizedText);
  const isLongText =
    normalizedText.length >= LONG_TEXT_CHAR_THRESHOLD ||
    wordCount(normalizedText) >= LONG_TEXT_WORD_THRESHOLD ||
    noteKind !== undefined;
  const associationText = primaryTag ?? normalizedText;
  const upperNormalized = normalizedText.toUpperCase();
  const displaySource =
    primaryTag && upperNormalized !== primaryTag && !upperNormalized.startsWith(primaryTag)
      ? `${primaryTag} ${normalizedText}`
      : normalizedText;
  const associationRadius = isLongText ? Math.max(250, Math.min(textHeight * 8, LONG_TEXT_ASSOCIATION_RADIUS)) : undefined;

  return {
    rawText,
    normalizedText,
    displayText: safeDisplayText(displaySource, MAX_LIST_LABEL_CHARS),
    overlayText: safeDisplayText(displaySource, MAX_SEMANTIC_OVERLAY_CHARS),
    associationText,
    primaryTag,
    noteKind,
    isLongText,
    associationRadius
  };
}
