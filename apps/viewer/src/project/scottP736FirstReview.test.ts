import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mergeReviewedTrainingTruth } from "../layoutLibrary/layoutReviewPack";
import { buildReviewedLayoutLibrary } from "../layoutLibrary/reviewedLayoutLibrary";
import { exportKairoProjectJson, parseKairoProjectJson } from "./kairoProject";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const fixturePath = join(repoRoot, "docs/examples/scott-p736-first-review.kairo-project.json");

describe.skipIf(!existsSync(fixturePath))("Scott P736 first-review project fixture", () => {
  it("parses the fixture and produces a stable reviewed library", () => {
    const json = readFileSync(fixturePath, "utf8");
    const result = parseKairoProjectJson(json);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.errors.map((e) => `${e.path}: ${e.message}`).join("\n"));
    }

    const { project } = result;
    expect(project.schema).toBe("kairo-project");
    expect(project.schemaVersion).toBe(1);
    expect(typeof project.source.displayName).toBe("string");
    expect(project.layoutReviewPack).toBeDefined();

    const mergedTruth = mergeReviewedTrainingTruth(project.layoutPackage, project.layoutReviewPack!);
    const reviewedLibrary = buildReviewedLayoutLibrary(project.layoutPackage, mergedTruth);

    // reusableItems = accepted + corrected; excludedRecords = rejected; reviewOnlyRecords = uncertain
    const { summary } = reviewedLibrary;
    expect(summary.reusableItems).toBeGreaterThanOrEqual(0);
    expect(summary.acceptedItems + summary.correctedItems).toBe(summary.reusableItems);
    expect(summary).toMatchSnapshot("scott-p736-first-review-library-summary");
  });

  it("round-trips through export and re-parse without data loss", () => {
    const json = readFileSync(fixturePath, "utf8");
    const first = parseKairoProjectJson(json);
    if (!first.ok) throw new Error("fixture failed to parse");

    const reExported = exportKairoProjectJson(first.project);
    const second = parseKairoProjectJson(reExported);

    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("re-parse failed");
    expect(second.project).toEqual(first.project);
  });
});
