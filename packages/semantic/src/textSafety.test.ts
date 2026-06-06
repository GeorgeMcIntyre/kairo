import { describe, expect, it } from "vitest";
import {
  MAX_LIST_LABEL_CHARS,
  extractStrongDeviceTag,
  isLikelyAnnotationText,
  safeDisplayText,
  textSafetyProfile
} from "./textSafety";

describe("text safety helpers", () => {
  it("truncates display text while preserving raw text in the profile", () => {
    const raw = "Cable tray support note with many words that should never become an oversized viewer label or row";
    const profile = textSafetyProfile(raw, 100);

    expect(profile.rawText).toBe(raw);
    expect(profile.displayText.length).toBeLessThanOrEqual(MAX_LIST_LABEL_CHARS);
    expect(profile.displayText.endsWith("...")).toBe(true);
  });

  it("collapses newlines and DXF paragraph markers for safe list display", () => {
    expect(safeDisplayText("7B-020L-04\\P(RIVET)\nBASE | PLATE", 80)).toBe("7B-020L-04 (RIVET) BASE | PLATE");
  });

  it("recognizes annotation notes without strong device tags", () => {
    const note = "Fence Panel 1424mm x 2388mm galvanized mesh infill supplied by others";

    expect(isLikelyAnnotationText(note)).toBe(true);
  });

  it("extracts a strong device tag from longer text", () => {
    expect(extractStrongDeviceTag("Install bracket near robot 7B-020R-03 with clearance note")).toBe("7B-020R-03");
  });
});
