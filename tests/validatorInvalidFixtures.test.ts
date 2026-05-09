import { describe, expect, it } from "vitest";
import { validateScenePackage } from "@kairo/validator";
import { invalidSceneFixtures } from "../packages/validator/test-fixtures/invalidScenes";

describe("invalid scene fixtures", () => {
  it.each(invalidSceneFixtures)("$name produces a deterministic validation report", (fixture) => {
    const firstReport = validateScenePackage(fixture.scenePackage);
    const secondReport = validateScenePackage(fixture.scenePackage);

    expect(firstReport).toEqual(secondReport);
    expect(firstReport.valid).toBe(false);
    expect(firstReport.summary).toEqual(fixture.expectedSummary);
    expect(
      firstReport.findings.map((finding) => ({
        code: finding.code,
        severity: finding.severity,
        path: finding.path
      }))
    ).toEqual(fixture.expectedFindings);
  });
});
